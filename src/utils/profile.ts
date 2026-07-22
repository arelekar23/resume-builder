import { supabase } from "../lib/supabase";

// Profile = personal info (profiles row) + education entries. Skills, work, and
// projects live in their own tables and are handled elsewhere.

export interface PersonalInfo {
    full_name: string;
    email: string;
    phone: string;
    location: string;
    linkedin_url: string;
    github_url: string;
}

export interface EducationRow {
    // id is empty ("") for a not-yet-saved entry added in the UI.
    id: string;
    school: string;
    degree: string;
    details: string;
    date: string;
    position: number;
}

export const EMPTY_PERSONAL_INFO: PersonalInfo = {
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin_url: "",
    github_url: "",
};

// Resume sections, in render order. The name/contact header is always first and
// is not part of this list. Section order is master-level (shared by versions).
export type SectionKey =
    | "summary"
    | "education"
    | "skills"
    | "experience"
    | "projects";

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
    "summary",
    "education",
    "skills",
    "experience",
    "projects",
];

// Coerce a stored value into a complete, deduped, known-key order (missing keys
// appended in default order; unknown keys dropped). Tolerates old/null rows.
export function normalizeSectionOrder(raw: unknown): SectionKey[] {
    const known = new Set<SectionKey>(DEFAULT_SECTION_ORDER);
    const seen = new Set<SectionKey>();
    const out: SectionKey[] = [];
    if (Array.isArray(raw)) {
        for (const v of raw) {
            if (typeof v === "string" && known.has(v as SectionKey) && !seen.has(v as SectionKey)) {
                seen.add(v as SectionKey);
                out.push(v as SectionKey);
            }
        }
    }
    for (const k of DEFAULT_SECTION_ORDER) if (!seen.has(k)) out.push(k);
    return out;
}

async function getUserId(): Promise<string | null> {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error || !user) {
        console.error("Not signed in:", error);
        return null;
    }
    return user.id;
}

const asText = (v: unknown): string => (typeof v === "string" ? v : "");

// profiles row is auto-created by a DB trigger on sign-up; returns empty
// defaults on error so the UI still renders.
export async function getProfile(): Promise<PersonalInfo> {
    const uid = await getUserId();
    if (!uid) return { ...EMPTY_PERSONAL_INFO };

    const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email, phone, location, linkedin_url, github_url")
        .eq("id", uid)
        .maybeSingle();

    if (error || !data) {
        if (error) console.error("Failed to load profile:", error.message);
        return { ...EMPTY_PERSONAL_INFO };
    }

    return {
        full_name: asText(data.full_name),
        email: asText(data.email),
        phone: asText(data.phone),
        location: asText(data.location),
        linkedin_url: asText(data.linkedin_url),
        github_url: asText(data.github_url),
    };
}

export interface SaveResult {
    ok: boolean;
    error?: string;
}

// UPDATE keyed on user id (the primary key + RLS scope); the row already exists.
export async function updateProfile(info: PersonalInfo): Promise<SaveResult> {
    const uid = await getUserId();
    if (!uid) return { ok: false, error: "Not signed in." };

    const { error } = await supabase
        .from("profiles")
        .update({
            full_name: info.full_name.trim() || null,
            email: info.email.trim() || null,
            phone: info.phone.trim() || null,
            location: info.location.trim() || null,
            linkedin_url: info.linkedin_url.trim() || null,
            github_url: info.github_url.trim() || null,
        })
        .eq("id", uid);

    if (error) {
        console.error("Failed to save profile:", error);
        return { ok: false, error: `Profile: ${error.message}` };
    }
    return { ok: true };
}

// Master-level resume section order (jsonb on the profiles row).
export async function getSectionOrder(): Promise<SectionKey[]> {
    const uid = await getUserId();
    if (!uid) return [...DEFAULT_SECTION_ORDER];
    const { data, error } = await supabase
        .from("profiles")
        .select("section_order")
        .eq("id", uid)
        .maybeSingle();
    if (error) {
        console.error("Failed to load section order:", error.message);
        return [...DEFAULT_SECTION_ORDER];
    }
    return normalizeSectionOrder(data?.section_order);
}

export async function saveSectionOrder(order: SectionKey[]): Promise<SaveResult> {
    const uid = await getUserId();
    if (!uid) return { ok: false, error: "Not signed in." };
    const { error } = await supabase
        .from("profiles")
        .update({ section_order: normalizeSectionOrder(order) })
        .eq("id", uid);
    if (error) {
        console.error("Failed to save section order:", error);
        return { ok: false, error: `Section order: ${error.message}` };
    }
    return { ok: true };
}

export async function listEducation(): Promise<EducationRow[]> {
    const uid = await getUserId();
    if (!uid) return [];

    const { data, error } = await supabase
        .from("education")
        .select("id, school, degree, details, date, position")
        .eq("profile_id", uid)
        .order("position", { ascending: true });

    if (error) {
        console.error("Failed to load education:", error.message);
        return [];
    }

    return (data ?? []).map((e, i) => ({
        id: e.id,
        school: asText(e.school),
        degree: asText(e.degree),
        details: asText(e.details),
        date: asText(e.date),
        position: typeof e.position === "number" ? e.position : i,
    }));
}

// Diff education against the DB: insert new, update existing, delete removed.
// Position comes from array order.
export async function saveEducation(entries: EducationRow[]): Promise<SaveResult> {
    const uid = await getUserId();
    if (!uid) return { ok: false, error: "Not signed in." };

    const kept = entries.filter((e) => e.school.trim() || e.degree.trim());

    const { data: existingRows, error: loadErr } = await supabase
        .from("education")
        .select("id")
        .eq("profile_id", uid);
    if (loadErr) {
        console.error("Failed to load education for diff:", loadErr);
        return { ok: false, error: `Education: ${loadErr.message}` };
    }

    const existingIds = new Set((existingRows ?? []).map((r) => r.id as string));
    const keptIds = new Set(kept.filter((e) => e.id).map((e) => e.id));

    const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
    const toUpdate = kept.filter((e) => e.id && existingIds.has(e.id));
    const toInsert = kept.filter((e) => !e.id || !existingIds.has(e.id));

    const row = (e: EducationRow, position: number) => ({
        profile_id: uid,
        school: e.school.trim(),
        degree: e.degree.trim(),
        details: e.details.trim() || null,
        date: e.date.trim(),
        position,
    });

    // Supabase builders are PromiseLike, not full Promises; each op resolves to
    // an error message or null.
    const ops: PromiseLike<string | null>[] = [];
    const err = (r: { error: { message: string } | null }) =>
        r.error ? r.error.message : null;

    if (toDelete.length) {
        ops.push(supabase.from("education").delete().in("id", toDelete).then(err));
    }
    kept.forEach((e, position) => {
        if (toUpdate.some((u) => u.id === e.id)) {
            ops.push(
                supabase
                    .from("education")
                    .update(row(e, position))
                    .eq("id", e.id)
                    .then(err),
            );
        }
    });
    const inserts = kept
        .map((e, position) => ({ e, position }))
        .filter(({ e }) => toInsert.includes(e))
        .map(({ e, position }) => row(e, position));
    if (inserts.length) {
        ops.push(supabase.from("education").insert(inserts).then(err));
    }

    const errors = await Promise.all(ops);
    const failed = errors.find(Boolean);
    if (failed) {
        console.error("Failed to save education:", failed);
        return { ok: false, error: `Education: ${failed}` };
    }
    return { ok: true };
}

// Permanently delete the account: profile row (cascades to resume data, saved
// versions, and the encrypted LLM key) plus the auth user. Server verifies the
// caller's JWT; the body is never trusted for identity.
export async function deleteAccount(): Promise<SaveResult> {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
        return { ok: false, error: "Your session has expired. Please sign in again." };
    }
    const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 204) return { ok: true };
    let error = `Request failed (${res.status})`;
    try {
        const j = await res.json();
        if (j?.error) error = typeof j.error === "string" ? j.error : JSON.stringify(j.error);
    } catch {
        /* non-JSON error body */
    }
    return { ok: false, error };
}
