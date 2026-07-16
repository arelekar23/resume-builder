// Pure master <-> version conversion. No I/O, no Supabase import, so it stays
// unit-testable. versions.ts re-exports these.
import type { ResumeState } from "./api";
import type { ProjectEntry, WorkEntry, SkillsMap } from "../data/resumeData";

export interface ProjectStateSnapshot {
    id: string;
    title: string;
    date: string;
    is_selected: boolean;
    position: number;
}

export interface BulletStateSnapshot {
    id: string;
    kind: "work" | "project";
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
    bullets_state: BulletStateSnapshot[];
    skills_state: SkillStateSnapshot[];
}

// Editor state -> the three snapshot arrays stored on a version row.
export function stateToSnapshot(state: ResumeState): StateSnapshot {
    return {
        projects_state: state.projects.map((p, i) => ({
            id: p.id,
            title: p.title,
            date: p.date,
            is_selected: state.selected_projects.includes(p.id),
            position: i,
        })),
        bullets_state: [
            ...state.projects.flatMap((p) =>
                p.bullets.map((b, i) => ({
                    id: b.id,
                    kind: "project" as const,
                    text: b.text,
                    is_excluded: state.excluded_bullets.includes(b.id),
                    position: i,
                })),
            ),
            ...state.work.flatMap((w) =>
                w.bullets.map((b, i) => ({
                    id: b.id,
                    kind: "work" as const,
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
    };
}

// Master + version snapshot -> editor state for that version. Master is
// read-only; rows absent from the snapshot fall back to master values.
export function overlayVersionOnMaster(
    master: ResumeState,
    snap: StateSnapshot,
): ResumeState {
    const projMap = new Map(snap.projects_state.map((p) => [p.id, p]));
    const bMap = new Map(snap.bullets_state.map((b) => [b.id, b]));
    const sMap = new Map(snap.skills_state.map((s) => [s.category, s]));
    const POS = (n: number | undefined) => n ?? 9999;

    const orderBullets = (bullets: ProjectEntry["bullets"]) =>
        bullets
            .map((b) => ({
                bullet: { ...b, text: bMap.get(b.id)?.text ?? b.text },
                pos: POS(bMap.get(b.id)?.position),
            }))
            .sort((a, b) => a.pos - b.pos)
            .map((x) => x.bullet);

    const projects: ProjectEntry[] = master.projects
        .map((p) => {
            const vp = projMap.get(p.id);
            return {
                proj: {
                    id: p.id,
                    title: vp?.title ?? p.title,
                    date: vp?.date ?? p.date,
                    bullets: orderBullets(p.bullets),
                } as ProjectEntry,
                pos: POS(vp?.position),
            };
        })
        .sort((a, b) => a.pos - b.pos)
        .map((x) => x.proj);

    const selected_projects = master.projects
        .filter((p) => {
            const vp = projMap.get(p.id);
            return vp ? vp.is_selected : master.selected_projects.includes(p.id);
        })
        .map((p) => p.id);

    const work: WorkEntry[] = master.work.map((w) => ({
        id: w.id,
        title: w.title,
        date: w.date,
        bullets: orderBullets(w.bullets),
    }));

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
        bullets_state: [
            ...(plan.projects ?? []).flatMap((p) =>
                p.bullets.map((b) => ({
                    id: b.id,
                    kind: "project" as const,
                    text: b.text,
                    is_excluded: b.is_excluded,
                    position: b.position,
                })),
            ),
            ...(plan.work ?? []).flatMap((w) =>
                w.bullets.map((b) => ({
                    id: b.id,
                    kind: "work" as const,
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
    };
}

// Master state + a tailoring plan -> the tailored editor state (for a version).
export function applyPlanToMaster(
    master: ResumeState,
    plan: TailoringPlanOverlay,
): ResumeState {
    return overlayVersionOnMaster(master, planToSnapshot(master, plan));
}
