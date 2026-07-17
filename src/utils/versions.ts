import { supabase } from "../lib/supabase";
import type { ResumeState } from "./api";
import {
    stateToSnapshot,
    overlayVersionOnMaster,
    type StateSnapshot,
} from "./versionConversion";

export {
    stateToSnapshot,
    overlayVersionOnMaster,
    type StateSnapshot,
    type ProjectStateSnapshot,
    type WorkStateSnapshot,
    type BulletStateSnapshot,
    type SkillStateSnapshot,
} from "./versionConversion";

// The work_state column ships in a later migration. Until it's applied, writes
// that include it fail with "column does not exist" (Postgres 42703); detect
// that so we can retry without the column and keep versioning working.
function isMissingWorkStateColumn(error: {
    code?: string;
    message?: string;
} | null): boolean {
    if (!error) return false;
    return (
        error.code === "42703" ||
        (error.message?.includes("work_state") ?? false)
    );
}

// A version is a per-company overlay stored as JSONB. The master lives in the
// normalized tables (loadState). Loading a version never mutates the master:
// the editor builds state in memory from master + overlay and saves edits back
// into the version's JSONB.

export interface ResumeVersion {
    id: string;
    profile_id: string;
    name: string;
    company_name: string | null;
    created_at: string;
    updated_at: string;
}

export interface ResumeVersionWithSnapshot extends ResumeVersion, StateSnapshot {}

const VERSION_META_COLUMNS =
    "id, profile_id, name, company_name, created_at, updated_at";

async function getProfileId(): Promise<string | null> {
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

export async function listVersions(): Promise<ResumeVersion[]> {
    const profileId = await getProfileId();
    if (!profileId) return [];
    const { data, error } = await supabase
        .from("resume_versions")
        .select(VERSION_META_COLUMNS)
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });
    if (error) {
        console.error("Failed to list versions:", error);
        return [];
    }
    return (data ?? []) as ResumeVersion[];
}

export async function getVersion(
    id: string,
): Promise<ResumeVersionWithSnapshot | null> {
    const { data, error } = await supabase
        .from("resume_versions")
        .select("*")
        .eq("id", id)
        .single();
    if (error) {
        console.error("Failed to fetch version:", error);
        return null;
    }
    return data as ResumeVersionWithSnapshot;
}

// Build editor state from master + the version's snapshot; never touches the
// master tables.
export async function buildVersionEditorState(
    id: string,
    master: ResumeState,
): Promise<ResumeState | null> {
    const version = await getVersion(id);
    if (!version) return null;
    return overlayVersionOnMaster(master, {
        projects_state: version.projects_state ?? [],
        work_state: version.work_state ?? [],
        bullets_state: version.bullets_state ?? [],
        skills_state: version.skills_state ?? [],
    });
}

export async function saveVersion(
    name: string,
    companyName: string | null,
    state: ResumeState,
): Promise<ResumeVersion | null> {
    const profileId = await getProfileId();
    if (!profileId) return null;
    const snapshot = stateToSnapshot(state);
    const base = { profile_id: profileId, name, company_name: companyName };
    let { data, error } = await supabase
        .from("resume_versions")
        .insert({ ...base, ...snapshot })
        .select(VERSION_META_COLUMNS)
        .single();
    if (error && isMissingWorkStateColumn(error)) {
        console.warn(
            "resume_versions.work_state column missing — apply migration " +
                "20260717120000_add_work_state_to_versions. Saving without it; " +
                "net-new experience entries won't persist until it's applied.",
        );
        const { work_state, ...rest } = snapshot;
        void work_state;
        ({ data, error } = await supabase
            .from("resume_versions")
            .insert({ ...base, ...rest })
            .select(VERSION_META_COLUMNS)
            .single());
    }
    if (error) {
        console.error("Failed to save version:", error);
        throw new Error(error.message);
    }
    return data as ResumeVersion;
}

// Autosave the editor state into an existing version.
export async function saveVersionState(
    id: string,
    state: ResumeState,
): Promise<boolean> {
    const profileId = await getProfileId();
    if (!profileId) return false;
    const snapshot = stateToSnapshot(state);
    let { error } = await supabase
        .from("resume_versions")
        .update(snapshot)
        .eq("id", id)
        .eq("profile_id", profileId);
    if (error && isMissingWorkStateColumn(error)) {
        console.warn(
            "resume_versions.work_state column missing — apply migration " +
                "20260717120000_add_work_state_to_versions. Saving without it; " +
                "net-new experience entries won't persist until it's applied.",
        );
        const { work_state, ...rest } = snapshot;
        void work_state;
        ({ error } = await supabase
            .from("resume_versions")
            .update(rest)
            .eq("id", id)
            .eq("profile_id", profileId));
    }
    if (error) {
        console.error("Failed to save version state:", error);
        return false;
    }
    return true;
}

export async function renameVersion(
    id: string,
    patch: { name?: string; company_name?: string | null },
): Promise<boolean> {
    const fields: Record<string, unknown> = {};
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.company_name !== undefined) fields.company_name = patch.company_name;
    if (Object.keys(fields).length === 0) return true;
    const { error } = await supabase
        .from("resume_versions")
        .update(fields)
        .eq("id", id);
    if (error) {
        console.error("Failed to rename version:", error);
        return false;
    }
    return true;
}

export async function duplicateVersion(
    id: string,
    newName: string,
): Promise<ResumeVersion | null> {
    const profileId = await getProfileId();
    if (!profileId) return null;
    const source = await getVersion(id);
    if (!source) return null;
    const base = {
        profile_id: profileId,
        name: newName,
        company_name: source.company_name,
        projects_state: source.projects_state,
        bullets_state: source.bullets_state,
        skills_state: source.skills_state,
    };
    let { data, error } = await supabase
        .from("resume_versions")
        .insert({ ...base, work_state: source.work_state ?? [] })
        .select(VERSION_META_COLUMNS)
        .single();
    if (error && isMissingWorkStateColumn(error)) {
        console.warn(
            "resume_versions.work_state column missing — apply migration " +
                "20260717120000_add_work_state_to_versions.",
        );
        ({ data, error } = await supabase
            .from("resume_versions")
            .insert(base)
            .select(VERSION_META_COLUMNS)
            .single());
    }
    if (error) {
        console.error("Failed to duplicate version:", error);
        return null;
    }
    return data as ResumeVersion;
}

export async function deleteVersion(id: string): Promise<boolean> {
    const { error } = await supabase
        .from("resume_versions")
        .delete()
        .eq("id", id);
    if (error) {
        console.error("Failed to delete version:", error);
        return false;
    }
    return true;
}
