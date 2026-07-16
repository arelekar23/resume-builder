import { supabase } from "../lib/supabase";

// Client side of the BYO-key vault. The raw API key is sent to /api/keys ONCE
// (on save), encrypted server-side, and never stored in or returned to the
// browser. Only non-secret status (provider/model/baseUrl + a "configured"
// flag) is cached in localStorage, purely so the UI can gate features without a
// round-trip. The server is always the source of truth.

const PREFS_KEY = "resumeBuilder.llmPrefs";

// One-time cleanup: the old design stored the raw API key in localStorage under
// this key. Purge it so no plaintext key lingers in any returning browser.
try {
    localStorage.removeItem("resumeBuilder.llmConfig");
} catch {
    /* ignore */
}

export interface KeyStatus {
    configured: boolean;
    provider?: string;
    model?: string;
    baseUrl?: string;
}

export function getCachedStatus(): KeyStatus {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return { configured: false };
        const s = JSON.parse(raw) as KeyStatus;
        return s && typeof s.configured === "boolean" ? s : { configured: false };
    } catch {
        return { configured: false };
    }
}

function setCachedStatus(s: KeyStatus): void {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(s));
    } catch {
        /* ignore quota / disabled storage */
    }
}

function clearCachedStatus(): void {
    try {
        localStorage.removeItem(PREFS_KEY);
    } catch {
        /* ignore */
    }
}

export function isConfigured(): boolean {
    return getCachedStatus().configured;
}

async function authHeaders(): Promise<HeadersInit> {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Your session has expired. Please sign in again.");
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
    };
}

async function errorMessage(res: Response): Promise<string> {
    const raw = await res.text().catch(() => "");
    try {
        const j = JSON.parse(raw);
        if (j?.error) return typeof j.error === "string" ? j.error : JSON.stringify(j.error);
    } catch {
        /* fall through */
    }
    return raw.slice(0, 300) || `Request failed (${res.status})`;
}

// Fetch authoritative status from the server and refresh the local cache.
export async function fetchKeyStatus(): Promise<KeyStatus> {
    try {
        const res = await fetch("/api/keys", { headers: await authHeaders() });
        if (!res.ok) return getCachedStatus();
        const s = (await res.json()) as KeyStatus;
        setCachedStatus(s);
        return s;
    } catch {
        return getCachedStatus();
    }
}

export async function saveKey(input: {
    provider: "anthropic" | "openai";
    apiKey: string;
    model: string;
    baseUrl?: string;
}): Promise<void> {
    const res = await fetch("/api/keys", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    setCachedStatus({
        configured: true,
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl,
    });
}

export async function deleteKey(): Promise<void> {
    const res = await fetch("/api/keys", {
        method: "DELETE",
        headers: await authHeaders(),
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    clearCachedStatus();
}
