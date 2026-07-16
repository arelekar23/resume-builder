import { supabase } from "../lib/supabase";
import type { ProjectEntry, WorkEntry, SkillsMap, Bullet } from "../data/resumeData";

export interface ResumeState {
    selected_projects: string[];
    selected_skills: string[];
    projects: ProjectEntry[];
    skills: SkillsMap;
    work: WorkEntry[];
    excluded_bullets: string[];
}

const EMPTY_STATE: ResumeState = {
    selected_projects: [],
    selected_skills: [],
    projects: [],
    skills: {},
    work: [],
    excluded_bullets: []
};

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

// Assemble the master resume from the normalized tables. Returns empty state
// for new users.
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
                .select("id, project_id, text, original_text,position, is_excluded")
                .order("position", { ascending: true }),
            supabase
                .from("work")
                .select("id, title, date, position")
                .eq("profile_id", profileId)
                .order("position", { ascending: true }),
            supabase
                .from("work_bullets")
                .select("id, work_id, text, original_text, position, is_excluded")
                .order("position", { ascending: true }),
            supabase
                .from("skills")
                .select("category, items, position, is_selected")
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

        const excluded_bullets: string[] = [
            ...(projectBulletRows ?? []).filter((b) => b.is_excluded).map((b) => b.id),
            ...(workBulletRows ?? []).filter((b) => b.is_excluded).map((b) => b.id),
        ];

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

        const selected_skills: string[] = (skillRows ?? [])
            .filter((s) => s.is_selected)
            .map((s) => s.category);

        const state: ResumeState = { selected_projects, selected_skills, projects, skills, work, excluded_bullets };
        lastSaved = structuredClone(state);
        return state;
    } catch (e) {
        console.error("Failed to load resume:", e);
        return null;
    }
}

// Diff-based save: only writes rows changed since the last load/save.
export async function saveState(state: ResumeState): Promise<void> {
    try {
        const profileId = await getProfileId();
        if (!profileId) return;

        // No baseline (e.g. load failed) — skip rather than overwrite.
        if (!lastSaved) {
            console.warn("saveState skipped: no baseline state loaded");
            return;
        }
        const baseline = lastSaved;
        const ops: PromiseLike<unknown>[] = [];
        const selectedSet = new Set(state.selected_projects);
        const prevSelectedSet = new Set(baseline.selected_projects);

        const prevProjectsById = new Map(baseline.projects.map((p) => [p.id, p]));
        const currentProjectsById = new Map(state.projects.map((p) => [p.id, p]));

        state.projects.forEach((p, idx) => {
            const prev = prevProjectsById.get(p.id);
            const isSelectedNow = selectedSet.has(p.id);
            const wasSelectedBefore = prevSelectedSet.has(p.id);

            if (!prev) {
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

                            for (let idx = 0; idx < p.bullets.length; idx++) {
                                const b = p.bullets[idx];
                                const prevBullet = prevById.get(b.id);
                                if (!prevBullet) continue;
                                const prevIdx = prev.bullets.findIndex((q) => q.id === b.id);
                                const isExcludedNow = state.excluded_bullets.includes(b.id);
                                const wasExcluded = baseline.excluded_bullets.includes(b.id);
                                const patch: Record<string, unknown> = {};
                                if (prevBullet.text !== b.text) patch.text = b.text;
                                if (prevIdx !== idx) patch.position = idx;
                                if (wasExcluded !== isExcludedNow) patch.is_excluded = isExcludedNow;
                                if (Object.keys(patch).length > 0) {
                                    await supabase
                                        .from("project_bullets")
                                        .update(patch)
                                        .eq("id", b.id);
                                }
                            }

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
                for (const b of p.bullets) {
                    const isExcludedNow = state.excluded_bullets.includes(b.id);
                    const wasExcluded = baseline.excluded_bullets.includes(b.id);
                    if (wasExcluded !== isExcludedNow) {
                        ops.push(
                            supabase
                                .from("project_bullets")
                                .update({ is_excluded: isExcludedNow })
                                .eq("id", b.id),
                        );
                    }
                }
            }
        });

        // DB cascade handles project_bullets.
        for (const prev of baseline.projects) {
            if (!currentProjectsById.has(prev.id)) {
                ops.push(supabase.from("projects").delete().eq("id", prev.id));
            }
        }

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

                            for (let idx = 0; idx < w.bullets.length; idx++) {
                                const b = w.bullets[idx];
                                const prevBullet = prevById.get(b.id);
                                if (!prevBullet) continue;
                                const prevIdx = prev.bullets.findIndex((q) => q.id === b.id);
                                const isExcludedNow = state.excluded_bullets.includes(b.id);
                                const wasExcluded = baseline.excluded_bullets.includes(b.id);
                                const patch: Record<string, unknown> = {};
                                if (prevBullet.text !== b.text) patch.text = b.text;
                                if (prevIdx !== idx) patch.position = idx;
                                if (wasExcluded !== isExcludedNow) patch.is_excluded = isExcludedNow;
                                if (Object.keys(patch).length > 0) {
                                    await supabase
                                        .from("work_bullets")
                                        .update(patch)
                                        .eq("id", b.id);
                                }
                            }

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
                for (const b of w.bullets) {
                    const isExcludedNow = state.excluded_bullets.includes(b.id);
                    const wasExcluded = baseline.excluded_bullets.includes(b.id);
                    if (wasExcluded !== isExcludedNow) {
                        ops.push(
                            supabase
                                .from("work_bullets")
                                .update({ is_excluded: isExcludedNow })
                                .eq("id", b.id),
                        );
                    }
                }
            }
        });

        for (const prev of baseline.work) {
            if (!currentWorkById.has(prev.id)) {
                ops.push(supabase.from("work").delete().eq("id", prev.id));
            }
        }

        // Skills are keyed by category string, not UUID.
        const currentCategories = Object.keys(state.skills);
        const prevCategories = Object.keys(baseline.skills);
        const currentCategorySet = new Set(currentCategories);
        const prevCategorySet = new Set(prevCategories);

        currentCategories.forEach((category, idx) => {
            const items = state.skills[category];
            const isSelectedNow = state.selected_skills.includes(category);

            if (!prevCategorySet.has(category)) {
                ops.push(
                    supabase.from("skills").insert({
                        profile_id: profileId,
                        category,
                        items,
                        position: idx,
                        is_selected: isSelectedNow,
                    }),
                );
            } else {
                const prevItems = lastSaved!.skills[category];
                const wasSelected = (lastSaved!.selected_skills ?? []).includes(category);
                const prevIdx = prevCategories.indexOf(category);
                const patch: Record<string, unknown> = {};
                if (prevItems !== items) patch.items = items;
                if (prevIdx !== idx) patch.position = idx;
                if (wasSelected !== isSelectedNow) patch.is_selected = isSelectedNow;
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

        if (ops.length === 0) return;

        await Promise.all(ops);
        lastSaved = structuredClone(state);
    } catch (e) {
        console.error("Failed to save resume:", e);
        // Keep lastSaved so the next save retries the same diff.
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