import { supabase } from "../lib/supabase";
import { getProfile, updateProfile, type SaveResult } from "./profile";

// Populates the master resume from a parsed resume. Overwrite semantics: master
// content is cleared and repopulated. Saved company versions are left intact but
// may reference bullet ids that no longer exist. Writes go through the browser
// Supabase client under RLS (profile_id = auth.uid()).

// Mirrors the shape returned by /api/parse-resume (keep in sync).
export interface ParsedResume {
    profile: {
        full_name: string;
        email: string;
        phone: string;
        location: string;
        linkedin_url: string;
        github_url: string;
    };
    education: { school: string; degree: string; details: string; date: string }[];
    work: { title: string; date: string; bullets: string[] }[];
    projects: { title: string; date: string; bullets: string[] }[];
    skills: { category: string; items: string }[];
}

async function getUserId(): Promise<string | null> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
}

// True when the user has no work, projects, or skills yet (triggers onboarding).
export async function isMasterEmpty(): Promise<boolean> {
    const uid = await getUserId();
    if (!uid) return false;
    const [w, p, s] = await Promise.all([
        supabase.from("work").select("id", { count: "exact", head: true }).eq("profile_id", uid),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("profile_id", uid),
        supabase.from("skills").select("id", { count: "exact", head: true }).eq("profile_id", uid),
    ]);
    return (w.count ?? 0) === 0 && (p.count ?? 0) === 0 && (s.count ?? 0) === 0;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// Clear then repopulate master content. Best-effort, not a single transaction.
export async function overwriteMasterResume(parsed: ParsedResume): Promise<SaveResult> {
    const uid = await getUserId();
    if (!uid) return { ok: false, error: "Not signed in." };

    // Clear master. Bullets cascade with work/projects.
    const dels = await Promise.all([
        supabase.from("work").delete().eq("profile_id", uid),
        supabase.from("projects").delete().eq("profile_id", uid),
        supabase.from("skills").delete().eq("profile_id", uid),
        supabase.from("education").delete().eq("profile_id", uid),
    ]);
    const delErr = dels.find((d) => d.error)?.error;
    if (delErr) return { ok: false, error: `Clearing old resume failed: ${delErr.message}` };

    // Client-generated uuids so bullets can reference a parent before it round-trips.
    const workEntries = (parsed.work ?? []).filter((w) => clean(w.title));
    const workRows = workEntries.map((w, i) => ({
        id: crypto.randomUUID(),
        profile_id: uid,
        title: clean(w.title),
        date: clean(w.date),
        position: i,
    }));
    const workBulletRows = workEntries.flatMap((w, i) =>
        (w.bullets ?? [])
            .filter((b) => clean(b))
            .map((b, bi) => ({
                id: crypto.randomUUID(),
                work_id: workRows[i].id,
                text: clean(b),
                original_text: clean(b),
                position: bi,
            })),
    );

    const projEntries = (parsed.projects ?? []).filter((p) => clean(p.title));
    const projRows = projEntries.map((p, i) => ({
        id: crypto.randomUUID(),
        profile_id: uid,
        title: clean(p.title),
        date: clean(p.date),
        position: i,
        is_selected: true,
    }));
    const projBulletRows = projEntries.flatMap((p, i) =>
        (p.bullets ?? [])
            .filter((b) => clean(b))
            .map((b, bi) => ({
                id: crypto.randomUUID(),
                project_id: projRows[i].id,
                text: clean(b),
                original_text: clean(b),
                position: bi,
            })),
    );

    const skillRows = (parsed.skills ?? [])
        .filter((s) => clean(s.category) && clean(s.items))
        .map((s, i) => ({
            profile_id: uid,
            category: clean(s.category),
            items: clean(s.items),
            position: i,
            is_selected: true,
        }));

    const eduRows = (parsed.education ?? [])
        .filter((e) => clean(e.school))
        .map((e, i) => ({
            profile_id: uid,
            school: clean(e.school),
            degree: clean(e.degree),
            details: clean(e.details) || null,
            date: clean(e.date),
            position: i,
        }));

    // Insert parents before their bullets (FK). Stop on first error.
    const insert = async (label: string, table: string, rows: unknown[]): Promise<string | null> => {
        if (!rows.length) return null;
        const { error } = await supabase.from(table).insert(rows);
        return error ? `Saving ${label} failed: ${error.message}` : null;
    };
    const insertErr =
        (await insert("work", "work", workRows)) ||
        (await insert("work bullets", "work_bullets", workBulletRows)) ||
        (await insert("projects", "projects", projRows)) ||
        (await insert("project bullets", "project_bullets", projBulletRows)) ||
        (await insert("skills", "skills", skillRows)) ||
        (await insert("education", "education", eduRows));
    if (insertErr) return { ok: false, error: insertErr };

    // Merge parsed personal info over existing, keeping existing where blank.
    const existing = await getProfile();
    const p = parsed.profile ?? ({} as ParsedResume["profile"]);
    const profileRes = await updateProfile({
        full_name: clean(p.full_name) || existing.full_name,
        email: clean(p.email) || existing.email,
        phone: clean(p.phone) || existing.phone,
        location: clean(p.location) || existing.location,
        linkedin_url: clean(p.linkedin_url) || existing.linkedin_url,
        github_url: clean(p.github_url) || existing.github_url,
    });
    if (!profileRes.ok) return profileRes;

    return { ok: true };
}
