import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only BYO-key vault. The user's LLM key is envelope-encrypted
// (AES-256-GCM: per-user DEK encrypts the key, KEK from LLM_KEY_ENC_SECRET wraps
// the DEK) in the user_llm_keys table. Never returned to the client, never logged.

export interface StoredLLM {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
}

export interface KeyStatus {
    configured: boolean;
    provider?: string;
    model?: string;
    baseUrl?: string;
}

const IV_LEN = 12; // GCM standard nonce length
const TAG_LEN = 16;

function kek(): Buffer {
    const raw = process.env.LLM_KEY_ENC_SECRET;
    if (!raw) {
        throw new Error(
            "Server misconfigured: LLM_KEY_ENC_SECRET is not set (32-byte base64 master key).",
        );
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error(
            "Server misconfigured: LLM_KEY_ENC_SECRET must decode to exactly 32 bytes.",
        );
    }
    return key;
}

// Output is base64( iv || authTag || ciphertext ).
function encryptGcm(key: Buffer, plaintext: Buffer): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
}

function decryptGcm(key: Buffer, blob: string): Buffer {
    const buf = Buffer.from(blob, "base64");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function seal(apiKey: string): { keyCipher: string; dekWrapped: string } {
    const dek = randomBytes(32);
    const keyCipher = encryptGcm(dek, Buffer.from(apiKey, "utf8"));
    const dekWrapped = encryptGcm(kek(), dek);
    return { keyCipher, dekWrapped };
}

function open(row: { key_cipher: string; dek_wrapped: string }): string {
    const dek = decryptGcm(kek(), row.dek_wrapped);
    return decryptGcm(dek, row.key_cipher).toString("utf8");
}

// Service-role client bypasses RLS — only for the locked-down user_llm_keys
// table, and only after the caller's identity has been verified.
function serviceClient(): SupabaseClient {
    const url = process.env.VITE_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRole) {
        throw new Error(
            "Server misconfigured: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.",
        );
    }
    return createClient(url, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

// Trust boundary: the JWT is verified here and everything key-related is keyed
// off the id proven here, never off a client-supplied id.
export async function getUserId(authHeader: string | undefined): Promise<string | null> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length);
    const url = process.env.VITE_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;
    const client = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
}

export async function saveUserKey(
    userId: string,
    input: { provider: string; apiKey: string; model: string; baseUrl?: string },
): Promise<void> {
    const { keyCipher, dekWrapped } = seal(input.apiKey);
    const { error } = await serviceClient()
        .from("user_llm_keys")
        .upsert(
            {
                profile_id: userId,
                provider: input.provider,
                model: input.model,
                base_url: input.baseUrl ?? null,
                key_cipher: keyCipher,
                dek_wrapped: dekWrapped,
            },
            { onConflict: "profile_id" },
        );
    if (error) throw new Error(error.message);
}

// Decrypted key included — server-side use only, never serialized to the client.
export async function loadUserKey(userId: string): Promise<StoredLLM | null> {
    const { data, error } = await serviceClient()
        .from("user_llm_keys")
        .select("provider, model, base_url, key_cipher, dek_wrapped")
        .eq("profile_id", userId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
        provider: data.provider,
        model: data.model,
        baseUrl: data.base_url ?? undefined,
        apiKey: open(data),
    };
}

// Non-secret status for the UI — provider/model only, never the key.
export async function getUserKeyStatus(userId: string): Promise<KeyStatus> {
    const { data, error } = await serviceClient()
        .from("user_llm_keys")
        .select("provider, model, base_url")
        .eq("profile_id", userId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { configured: false };
    return {
        configured: true,
        provider: data.provider,
        model: data.model,
        baseUrl: data.base_url ?? undefined,
    };
}

export async function deleteUserKey(userId: string): Promise<void> {
    const { error } = await serviceClient()
        .from("user_llm_keys")
        .delete()
        .eq("profile_id", userId);
    if (error) throw new Error(error.message);
}
