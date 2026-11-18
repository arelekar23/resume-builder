export type Bullet = {
    id: string;
    text: string;
    original_text: string;
    // Private drafting labels (e.g. role focus). Never rendered on the resume.
    tags?: string[];
};

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
