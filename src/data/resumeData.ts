export type Bullet = { id: string; text: string };

export interface ProjectEntry {
    id: string;
    title: string;
    date: string;
    bullets: Bullet[];
}

export interface WorkEntry {
    id: string;
    title: string;
    date: string;
    bullets: Bullet[];
}

export type SkillsMap = Record<string, string>;
