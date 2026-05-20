import { supabase } from "../lib/supabase";
import type { ProjectEntry, WorkEntry, SkillsMap, Bullet } from "../data/resumeData";

export interface ResumeState {
    selected_projects: string[];
    projects: ProjectEntry[];
    skills: SkillsMap;
    work: WorkEntry[];
}

const EMPTY_STATE: ResumeState = {
    selected_projects: [],
    projects: [],
    skills: {},
    work: [],
};

// Snapshot of the last state we loaded or successfully saved.
// saveState diffs against this so we only write what actually changed.
let lastSaved: ResumeState | null = null;
let cachedProfileId: string | null = null;

async function getProfileId(): Promise<string | null> {
    if (cachedProfileId) return cachedProfileId;
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error || !user) {
        console.error("Not signed in:", error);
        return null;
    }
    cachedProfileId = user.id;
    return cachedProfileId;
}

/**
 * Load the current user's resume from the normalized tables and assemble it
 * into the in-memory shape the editor + renderer expect.
 *
 * Returns an empty-but-valid state for new users so the editor can render
 * a blank resume.
 */
export async function loadState(): Promise<ResumeState | null> {
    try {
        const profileId = await getProfileId();
        if (!profileId) return null;

        const [
            { data: projectRows, error: projectsError },
            { data: projectBulletRows, error: projectBulletsError },
            { data: workRows, error: workError },
            { data: workBulletRows, error: workBulletsError },
            { data: skillRows, error: skillsError },
        ] = await Promise.all([
            supabase
                .from("projects")
                .select("id, title, date, is_selected, position")
                .eq("profile_id", profileId)
                .order("position", { ascending: true }),
            supabase
                .from("project_bullets")
                .select("id, project_id, text, original_text,position")
                .order("position", { ascending: true }),
            supabase
                .from("work")
                .select("id, title, date, position")
                .eq("profile_id", profileId)
                .order("position", { ascending: true }),
            supabase
                .from("work_bullets")
                .select("id, work_id, text, original_text, position")
                .order("position", { ascending: true }),
            supabase
                .from("skills")
                .select("category, items, position")
                .eq("profile_id", profileId)
                .order("position", { ascending: true }),
        ]);

        const anyError =
            projectsError ||
            projectBulletsError ||
            workError ||
            workBulletsError ||
            skillsError;
        if (anyError) {
            console.error("Failed to load resume:", anyError);
            return null;
        }

        const projectBulletsByProject = new Map<string, Bullet[]>();
        for (const row of projectBulletRows ?? []) {
            const list = projectBulletsByProject.get(row.project_id) ?? [];
            list.push({ id: row.id, text: row.text, original_text: row.original_text });
            projectBulletsByProject.set(row.project_id, list);
        }

        const workBulletsByJob = new Map<string, Bullet[]>();
        for (const row of workBulletRows ?? []) {
            const list = workBulletsByJob.get(row.work_id) ?? [];
            list.push({ id: row.id, text: row.text, original_text: row.original_text });
            workBulletsByJob.set(row.work_id, list);
        }

        const projects: ProjectEntry[] = (projectRows ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            date: p.date,
            bullets: projectBulletsByProject.get(p.id) ?? [],
        }));

        const selected_projects: string[] = (projectRows ?? [])
            .filter((p) => p.is_selected)
            .map((p) => p.id);

        const work: WorkEntry[] = (workRows ?? []).map((w) => ({
            id: w.id,
            title: w.title,
            date: w.date,
            bullets: workBulletsByJob.get(w.id) ?? [],
        }));

        const skills: SkillsMap = {};
        for (const s of skillRows ?? []) {
            skills[s.category] = s.items;
        }

        const state: ResumeState = { selected_projects, projects, skills, work };
        lastSaved = structuredClone(state);
        return state;
    } catch (e) {
        console.error("Failed to load resume:", e);
        return null;
    }
}

/**
 * Diff-based save. Only writes rows that changed since the last successful
 * save (or load). Replaces a work/project's bullets entirely if any of them
 * changed, since bullets don't have stable IDs in the in-memory shape.
 */
export async function saveState(state: ResumeState): Promise<void> {
    try {
        const profileId = await getProfileId();
        if (!profileId) return;

        // No baseline yet (e.g., load failed). Skip — safer than overwriting.
        if (!lastSaved) {
            console.warn("saveState skipped: no baseline state loaded");
            return;
        }
        const baseline = lastSaved;
        const ops: PromiseLike<unknown>[] = [];
        const selectedSet = new Set(state.selected_projects);
        const prevSelectedSet = new Set(baseline.selected_projects);

        // ---- PROJECTS ----
        const prevProjectsById = new Map(baseline.projects.map((p) => [p.id, p]));
        const currentProjectsById = new Map(state.projects.map((p) => [p.id, p]));

        state.projects.forEach((p, idx) => {
            const prev = prevProjectsById.get(p.id);
            const isSelectedNow = selectedSet.has(p.id);
            const wasSelectedBefore = prevSelectedSet.has(p.id);

            if (!prev) {
                // New project row + all its bullets.
                ops.push(
                    supabase.from("projects").insert({
                        id: p.id,
                        profile_id: profileId,
                        title: p.title,
                        date: p.date,
                        is_selected: isSelectedNow,
                        position: idx,
                    }),
                );
                if (p.bullets.length > 0) {
                    ops.push(
                        supabase.from("project_bullets").insert(
                            p.bullets.map((text, bIdx) => ({
                                project_id: p.id,
                                text,
                                original_text: text,
                                position: bIdx,
                            })),
                        ),
                    );
                }
            } else {
                // Update only fields that changed.
                const patch: Record<string, unknown> = {};
                if (prev.title !== p.title) patch.title = p.title;
                if (prev.date !== p.date) patch.date = p.date;
                if (wasSelectedBefore !== isSelectedNow)
                    patch.is_selected = isSelectedNow;
                const prevIdx = baseline.projects.findIndex((q) => q.id === p.id);
                if (prevIdx !== idx) patch.position = idx;
                if (Object.keys(patch).length > 0) {
                    ops.push(supabase.from("projects").update(patch).eq("id", p.id));
                }

                if (!bulletsEqual(prev.bullets, p.bullets)) {
                    ops.push(
                        (async () => {
                            const prevById = new Map(prev.bullets.map((b) => [b.id, b]));
                            const currById = new Map(p.bullets.map((b) => [b.id, b]));

                            // Insert new bullets (in current but not in prev).
                            const inserts = p.bullets
                                .map((b, idx) => ({ b, idx }))
                                .filter(({ b }) => !prevById.has(b.id));
                            if (inserts.length > 0) {
                                await supabase.from("project_bullets").insert(
                                    inserts.map(({ b, idx }) => ({
                                        id: b.id,
                                        project_id: p.id,
                                        text: b.text,
                                        original_text: b.text,
                                        position: idx,
                                    })),
                                );
                            }

                            // Update existing bullets where text or position changed.
                            for (let idx = 0; idx < p.bullets.length; idx++) {
                                const b = p.bullets[idx];
                                const prevBullet = prevById.get(b.id);
                                if (!prevBullet) continue; // already handled by insert
                                const prevIdx = prev.bullets.findIndex((q) => q.id === b.id);
                                const patch: Record<string, unknown> = {};
                                if (prevBullet.text !== b.text) patch.text = b.text;
                                if (prevIdx !== idx) patch.position = idx;
                                if (Object.keys(patch).length > 0) {
                                    await supabase
                                        .from("project_bullets")
                                        .update(patch)
                                        .eq("id", b.id);
                                }
                            }

                            // Delete bullets in prev but not in current.
                            const deletedIds = prev.bullets
                                .filter((b) => !currById.has(b.id))
                                .map((b) => b.id);
                            if (deletedIds.length > 0) {
                                await supabase
                                    .from("project_bullets")
                                    .delete()
                                    .in("id", deletedIds);
                            }
                        })(),
                    );
                }
            }
        });

        // Deletes. Cascade in DB handles project_bullets.
        for (const prev of baseline.projects) {
            if (!currentProjectsById.has(prev.id)) {
                ops.push(supabase.from("projects").delete().eq("id", prev.id));
            }
        }

        // ---- WORK ----
        const prevWorkById = new Map(baseline.work.map((w) => [w.id, w]));
        const currentWorkById = new Map(state.work.map((w) => [w.id, w]));

        state.work.forEach((w, idx) => {
            const prev = prevWorkById.get(w.id);

            if (!prev) {
                ops.push(
                    supabase.from("work").insert({
                        id: w.id,
                        profile_id: profileId,
                        title: w.title,
                        date: w.date,
                        position: idx,
                    }),
                );
                if (w.bullets.length > 0) {
                    ops.push(
                        supabase.from("work_bullets").insert(
                            w.bullets.map((text, bIdx) => ({
                                work_id: w.id,
                                text,
                                original_text: text,
                                position: bIdx,
                            })),
                        ),
                    );
                }
            } else {
                const patch: Record<string, unknown> = {};
                if (prev.title !== w.title) patch.title = w.title;
                if (prev.date !== w.date) patch.date = w.date;
                const prevIdx = baseline.work.findIndex((j) => j.id === w.id);
                if (prevIdx !== idx) patch.position = idx;
                if (Object.keys(patch).length > 0) {
                    ops.push(supabase.from("work").update(patch).eq("id", w.id));
                }

                if (!bulletsEqual(prev.bullets, w.bullets)) {
                    ops.push(
                        (async () => {
                            const prevById = new Map(prev.bullets.map((b) => [b.id, b]));
                            const currById = new Map(w.bullets.map((b) => [b.id, b]));

                            // Insert new bullets (in current but not in prev).
                            const inserts = w.bullets
                                .map((b, idx) => ({ b, idx }))
                                .filter(({ b }) => !prevById.has(b.id));
                            if (inserts.length > 0) {
                                await supabase.from("work_bullets").insert(
                                    inserts.map(({ b, idx }) => ({
                                        id: b.id,
                                        work_id: w.id,
                                        text: b.text,
                                        original_text: b.text,
                                        position: idx,
                                    })),
                                );
                            }

                            // Update existing bullets where text or position changed.
                            for (let idx = 0; idx < w.bullets.length; idx++) {
                                const b = w.bullets[idx];
                                const prevBullet = prevById.get(b.id);
                                if (!prevBullet) continue; // already handled by insert
                                const prevIdx = prev.bullets.findIndex((q) => q.id === b.id);
                                const patch: Record<string, unknown> = {};
                                if (prevBullet.text !== b.text) patch.text = b.text;
                                if (prevIdx !== idx) patch.position = idx;
                                if (Object.keys(patch).length > 0) {
                                    await supabase
                                        .from("work_bullets")
                                        .update(patch)
                                        .eq("id", b.id);
                                }
                            }

                            // Delete bullets in prev but not in current.
                            const deletedIds = prev.bullets
                                .filter((b) => !currById.has(b.id))
                                .map((b) => b.id);
                            if (deletedIds.length > 0) {
                                await supabase
                                    .from("work_bullets")
                                    .delete()
                                    .in("id", deletedIds);
                            }
                        })(),
                    );
                }
            }
        });

        for (const prev of baseline.work) {
            if (!currentWorkById.has(prev.id)) {
                ops.push(supabase.from("work").delete().eq("id", prev.id));
            }
        }

        // ---- SKILLS ----
        // Skills are identified by category (string), not UUID.
        const currentCategories = Object.keys(state.skills);
        const prevCategories = Object.keys(baseline.skills);
        const currentCategorySet = new Set(currentCategories);
        const prevCategorySet = new Set(prevCategories);

        currentCategories.forEach((category, idx) => {
            const items = state.skills[category];
            if (!prevCategorySet.has(category)) {
                ops.push(
                    supabase.from("skills").insert({
                        profile_id: profileId,
                        category,
                        items,
                        position: idx,
                    }),
                );
            } else {
                const prevItems = lastSaved!.skills[category];
                const prevIdx = prevCategories.indexOf(category);
                const patch: Record<string, unknown> = {};
                if (prevItems !== items) patch.items = items;
                if (prevIdx !== idx) patch.position = idx;
                if (Object.keys(patch).length > 0) {
                    ops.push(
                        supabase
                            .from("skills")
                            .update(patch)
                            .eq("profile_id", profileId)
                            .eq("category", category),
                    );
                }
            }
        });

        for (const category of prevCategories) {
            if (!currentCategorySet.has(category)) {
                ops.push(
                    supabase
                        .from("skills")
                        .delete()
                        .eq("profile_id", profileId)
                        .eq("category", category),
                );
            }
        }

        if (ops.length === 0) return; // Nothing changed.

        await Promise.all(ops);

        // Successful save → bump the baseline.
        lastSaved = structuredClone(state);
    } catch (e) {
        console.error("Failed to save resume:", e);
        // Leave lastSaved alone so the next save retries the same diff.
    }
}

function bulletsEqual(a: Bullet[], b: Bullet[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id || a[i].text !== b[i].text) return false;
    }
    return true;
}

export { EMPTY_STATE };