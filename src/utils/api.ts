import { supabase } from "../lib/supabase";
import type { ProjectEntry, WorkEntry, SkillsMap } from "../data/resumeData";

export interface ResumeState {
    selected_projects: string[];
    projects: ProjectEntry[];
    skills: SkillsMap;
    work: WorkEntry[];
}

export async function loadState(): Promise<ResumeState | null> {
    try {
        const { data, error } = await supabase
            .from("resume_state")
            .select("data")
            .eq("id", "default")
            .single();

        if (error) {
            console.error("Failed to load state:", error);
            return null;
        }
        return (data?.data as ResumeState) ?? null;
    } catch (e) {
        console.error("Failed to load state:", e);
        return null;
    }
}

export async function saveState(state: ResumeState): Promise<void> {
    try {
        const { error } = await supabase
            .from("resume_state")
            .update({ data: state, updated_at: new Date().toISOString() })
            .eq("id", "default");

        if (error) console.error("Failed to save state:", error);
    } catch (e) {
        console.error("Failed to save state:", e);
    }
}