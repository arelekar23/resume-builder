// Pure master <-> version conversion. No I/O, no Supabase import, so it stays
// unit-testable. versions.ts re-exports these.
import type { ResumeState } from "./api";
import type {
    ProjectEntry,
    WorkEntry,
    SkillsMap,
    Bullet,
} from "../data/resumeData";

export interface ProjectStateSnapshot {
    id: string;
    title: string;
    date: string;
    is_selected: boolean;
    position: number;
}

export interface WorkStateSnapshot {
    id: string;
    title: string;
    date: string;
    position: number;
}

export interface BulletStateSnapshot {
    id: string;
    kind: "work" | "project";
    // Parent project/work id. Absent on legacy snapshots written before
    // versions could carry net-new content.
    parent_id?: string;
    text: string;
    is_excluded: boolean;
    position: number;
}

export interface SkillStateSnapshot {
    category: string;
    items: string; // DB stores items as a single comma-separated string
    position: number;
    is_selected: boolean;
}

export interface StateSnapshot {
    projects_state: ProjectStateSnapshot[];
    work_state: WorkStateSnapshot[];
    bullets_state: BulletStateSnapshot[];
    skills_state: SkillStateSnapshot[];
    // The version's tailored summary. Overlays the master base; absent/"" falls
    // back to master. Column ships in a later migration (graceful fallback).
    summary: string;
}

// Editor state -> the snapshot arrays stored on a version row.
export function stateToSnapshot(state: ResumeState): StateSnapshot {
    return {
        projects_state: state.projects.map((p, i) => ({
            id: p.id,
            title: p.title,
            date: p.date,
            is_selected: state.selected_projects.includes(p.id),
            position: i,
        })),
        work_state: state.work.map((w, i) => ({
            id: w.id,
            title: w.title,
            date: w.date,
            position: i,
        })),
        bullets_state: [
            ...state.projects.flatMap((p) =>
                p.bullets.map((b, i) => ({
                    id: b.id,
                    kind: "project" as const,
                    parent_id: p.id,
                    text: b.text,
                    is_excluded: state.excluded_bullets.includes(b.id),
                    position: i,
                })),
            ),
            ...state.work.flatMap((w) =>
                w.bullets.map((b, i) => ({
                    id: b.id,
                    kind: "work" as const,
                    parent_id: w.id,
                    text: b.text,
                    is_excluded: state.excluded_bullets.includes(b.id),
                    position: i,
                })),
            ),
        ],
        skills_state: Object.keys(state.skills).map((category, i) => ({
            category,
            items: state.skills[category],
            position: i,
            is_selected: state.selected_skills.includes(category),
        })),
        summary: state.summary ?? "",
    };
}

// Master + version snapshot -> editor state for that version. Master is
// read-only. The snapshot is unioned with the master so a version can carry
// content added while it was active (new projects, work, and bullets) while
// rows absent from the snapshot still fall back to master values. Legacy
// snapshots (no parent_id, empty work_state) behave exactly as before.
export function overlayVersionOnMaster(
    master: ResumeState,
    snap: StateSnapshot,
): ResumeState {
    const projMap = new Map(snap.projects_state.map((p) => [p.id, p]));
    const workMap = new Map((snap.work_state ?? []).map((w) => [w.id, w]));
    const bMap = new Map(snap.bullets_state.map((b) => [b.id, b]));
    const sMap = new Map(snap.skills_state.map((s) => [s.category, s]));
    const POS = (n: number | undefined) => n ?? 9999;

    // Snapshot bullets grouped by their parent id (skip legacy entries with no
    // parent_id — those only overlay existing master bullets).
    const snapBulletsByParent = new Map<string, BulletStateSnapshot[]>();
    for (const b of snap.bullets_state) {
        if (!b.parent_id) continue;
        const list = snapBulletsByParent.get(b.parent_id) ?? [];
        list.push(b);
        snapBulletsByParent.set(b.parent_id, list);
    }

    // Master bullets (overlaid) unioned with snapshot-only bullets for a parent.
    const buildBullets = (parentId: string, masterBullets: Bullet[]): Bullet[] => {
        const seen = new Set<string>();
        const out: { bullet: Bullet; pos: number }[] = [];
        for (const b of masterBullets) {
            seen.add(b.id);
            out.push({
                bullet: { ...b, text: bMap.get(b.id)?.text ?? b.text },
                pos: POS(bMap.get(b.id)?.position),
            });
        }
        for (const sb of snapBulletsByParent.get(parentId) ?? []) {
            if (seen.has(sb.id)) continue;
            seen.add(sb.id);
            out.push({
                bullet: { id: sb.id, text: sb.text, original_text: "" },
                pos: POS(sb.position),
            });
        }
        return out.sort((a, b) => a.pos - b.pos).map((x) => x.bullet);
    };

    // Projects: master (overlaid) ∪ version-only projects.
    const projectEntries: { proj: ProjectEntry; pos: number }[] = master.projects.map(
        (p) => {
            const vp = projMap.get(p.id);
            return {
                proj: {
                    id: p.id,
                    title: vp?.title ?? p.title,
                    date: vp?.date ?? p.date,
                    bullets: buildBullets(p.id, p.bullets),
                },
                pos: POS(vp?.position),
            };
        },
    );
    const masterProjectIds = new Set(master.projects.map((p) => p.id));
    for (const vp of snap.projects_state) {
        if (masterProjectIds.has(vp.id)) continue;
        if (!snapBulletsByParent.has(vp.id)) continue; // avoid ghost rows
        projectEntries.push({
            proj: {
                id: vp.id,
                title: vp.title,
                date: vp.date,
                bullets: buildBullets(vp.id, []),
            },
            pos: POS(vp.position),
        });
    }
    const projects: ProjectEntry[] = projectEntries
        .sort((a, b) => a.pos - b.pos)
        .map((x) => x.proj);

    const selected_projects = projects
        .filter((p) => {
            const vp = projMap.get(p.id);
            return vp ? vp.is_selected : master.selected_projects.includes(p.id);
        })
        .map((p) => p.id);

    // Work: master (overlaid) ∪ version-only work.
    const workEntries: { job: WorkEntry; pos: number }[] = master.work.map((w) => {
        const vw = workMap.get(w.id);
        return {
            job: {
                id: w.id,
                title: vw?.title ?? w.title,
                date: vw?.date ?? w.date,
                bullets: buildBullets(w.id, w.bullets),
            },
            pos: POS(vw?.position),
        };
    });
    const masterWorkIds = new Set(master.work.map((w) => w.id));
    for (const vw of snap.work_state ?? []) {
        if (masterWorkIds.has(vw.id)) continue;
        if (!snapBulletsByParent.has(vw.id)) continue; // avoid ghost rows
        workEntries.push({
            job: {
                id: vw.id,
                title: vw.title,
                date: vw.date,
                bullets: buildBullets(vw.id, []),
            },
            pos: POS(vw.position),
        });
    }
    const work: WorkEntry[] = workEntries
        .sort((a, b) => a.pos - b.pos)
        .map((x) => x.job);

    const excluded_bullets: string[] = [];
    for (const entry of [...projects, ...work]) {
        for (const b of entry.bullets) {
            const vb = bMap.get(b.id);
            const excluded = vb
                ? vb.is_excluded
                : master.excluded_bullets.includes(b.id);
            if (excluded) excluded_bullets.push(b.id);
        }
    }

    // A saved skills snapshot is authoritative: its category list is used as-is
    // so row removals/additions stick across reloads. Fall back to master
    // categories only when the version has no skills snapshot yet.
    const cats = (
        snap.skills_state.length > 0
            ? Array.from(new Set(snap.skills_state.map((s) => s.category)))
            : Object.keys(master.skills)
    ).sort((a, b) => POS(sMap.get(a)?.position) - POS(sMap.get(b)?.position));
    const skills: SkillsMap = {};
    for (const c of cats) skills[c] = sMap.get(c)?.items ?? master.skills[c] ?? "";
    const selected_skills = cats.filter((c) => {
        const vs = sMap.get(c);
        return vs ? vs.is_selected : master.selected_skills.includes(c);
    });

    return {
        selected_projects,
        selected_skills,
        projects,
        skills,
        work,
        excluded_bullets,
        // Version summary overlays the master base; blank falls back to master.
        summary: snap.summary?.trim() ? snap.summary : master.summary,
    };
}

// The subset of a tailoring plan we overlay onto the master to build a version.
export interface TailoringPlanOverlay {
    projects?: {
        id: string;
        is_selected: boolean;
        position: number;
        bullets: { id: string; text: string; is_excluded: boolean; position: number }[];
    }[];
    work?: {
        id: string;
        bullets: { id: string; text: string; is_excluded: boolean; position: number }[];
    }[];
    skills?: {
        category: string;
        items: string[] | string;
        position: number;
        is_selected?: boolean;
    }[];
    summary?: string;
}

// A tailoring plan -> a version snapshot. Titles/dates come from the master
// (the AI doesn't rewrite them).
export function planToSnapshot(
    master: ResumeState,
    plan: TailoringPlanOverlay,
): StateSnapshot {
    const mProj = new Map(master.projects.map((p) => [p.id, p]));
    return {
        projects_state: (plan.projects ?? []).map((p) => ({
            id: p.id,
            title: mProj.get(p.id)?.title ?? "",
            date: mProj.get(p.id)?.date ?? "",
            is_selected: p.is_selected,
            position: p.position,
        })),
        work_state: master.work.map((w, i) => ({
            id: w.id,
            title: w.title,
            date: w.date,
            position: i,
        })),
        bullets_state: [
            ...(plan.projects ?? []).flatMap((p) =>
                p.bullets.map((b) => ({
                    id: b.id,
                    kind: "project" as const,
                    parent_id: p.id,
                    text: b.text,
                    is_excluded: b.is_excluded,
                    position: b.position,
                })),
            ),
            ...(plan.work ?? []).flatMap((w) =>
                w.bullets.map((b) => ({
                    id: b.id,
                    kind: "work" as const,
                    parent_id: w.id,
                    text: b.text,
                    is_excluded: b.is_excluded,
                    position: b.position,
                })),
            ),
        ],
        skills_state: (plan.skills ?? []).map((s, i) => ({
            category: s.category,
            items: Array.isArray(s.items) ? s.items.join(", ") : s.items,
            position: s.position ?? i,
            is_selected: s.is_selected ?? true,
        })),
        summary: plan.summary?.trim() ? plan.summary : master.summary,
    };
}

// Master state + a tailoring plan -> the tailored editor state (for a version).
export function applyPlanToMaster(
    master: ResumeState,
    plan: TailoringPlanOverlay,
): ResumeState {
    return overlayVersionOnMaster(master, planToSnapshot(master, plan));
}
