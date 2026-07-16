-- =========================================================================
-- RESUME VERSIONS
-- =========================================================================
-- A resume_version is a named snapshot of the user's *tailored* state at a
-- point in time (e.g. "Simple AI - Founding Engineer"). It is NOT the master:
-- the master lives in *_bullets.original_text and is never captured here.
--
-- A snapshot stores only the tailorable fields, keyed by the existing row id
-- (or, for skills, by category). This mirrors exactly what api/analyze.ts's
-- apply step writes:
--   projects_state : [{ id, is_selected, position }]
--   bullets_state  : [{ id, kind: 'work'|'project', text, is_excluded, position }]
--   skills_state   : [{ category, items, position, is_selected }]
--
-- Loading a version overlays these fields back onto the current rows by id.
-- Rows added to the master after a version was created simply aren't touched
-- by that version (best-effort overlay), which is the intended behavior.
-- =========================================================================

create table resume_versions (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    name text not null,
    company_name text,
    projects_state jsonb not null default '[]'::jsonb,
    bullets_state jsonb not null default '[]'::jsonb,
    skills_state jsonb not null default '[]'::jsonb,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- List a user's versions newest-first.
create index resume_versions_profile_created_idx
    on resume_versions(profile_id, created_at desc);

create trigger resume_versions_set_updated_at
    before update on resume_versions
    for each row execute function set_updated_at();

alter table resume_versions enable row level security;

-- Same ownership pattern as every other user-owned table: a row is visible /
-- writable only when its profile_id matches the caller's auth.uid().
create policy "Users manage own resume versions"
    on resume_versions for all
    using (profile_id = auth.uid())
    with check (profile_id = auth.uid());
