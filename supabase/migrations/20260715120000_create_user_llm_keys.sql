-- =========================================================================
-- USER LLM KEYS  (BYO-key vault, envelope-encrypted at rest)
-- =========================================================================
-- Stores each user's own LLM provider credentials so the raw API key is NEVER
-- kept in the browser. The key leaves the browser exactly once (at save time),
-- is encrypted server-side, and is NEVER returned to the client afterward.
--
-- Envelope encryption (AES-256-GCM):
--   key_cipher  = the API key encrypted under a per-user random Data Key (DEK)
--   dek_wrapped = that DEK encrypted ("wrapped") under a single server-held
--                 master Key-Encryption-Key (env: LLM_KEY_ENC_SECRET)
-- Per-user DEKs mean no single key protects everyone; rotating the master KEK
-- re-wraps DEKs without touching ciphertext.
--
-- ACCESS: this table is read/written ONLY by the server-side API routes using
-- the Supabase service role. RLS is enabled with NO policies and privileges are
-- revoked from anon/authenticated, so the browser can never read the ciphertext
-- (defense in depth — the ciphertext is useless without the server-only KEK).
-- =========================================================================

create table user_llm_keys (
    profile_id uuid primary key references profiles(id) on delete cascade,
    provider text not null,
    model text not null,
    base_url text,
    key_cipher text not null,   -- base64(iv || authTag || ciphertext) of the API key under the DEK
    dek_wrapped text not null,  -- base64(iv || authTag || ciphertext) of the DEK under the master KEK
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create trigger user_llm_keys_set_updated_at
    before update on user_llm_keys
    for each row execute function set_updated_at();

-- Enable RLS with NO policies (default-deny for anon/authenticated) and revoke
-- table privileges outright. Only the service role, used exclusively by the
-- API routes, bypasses RLS and can touch this table.
alter table user_llm_keys enable row level security;
revoke all on user_llm_keys from anon, authenticated;
