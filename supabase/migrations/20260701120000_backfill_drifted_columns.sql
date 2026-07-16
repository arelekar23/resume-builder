-- =========================================================================
-- BACKFILL DRIFTED COLUMNS
-- =========================================================================
-- These columns were added directly in the Supabase dashboard and are used
-- throughout the app (api/analyze.ts, src/utils/api.ts, loadState/saveState)
-- but were never captured in a migration. Without them, `supabase db reset`
-- produces a schema that breaks the app.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) so this is safe to run against the
-- live DB where the columns already exist, and against a fresh reset where
-- they don't. Defaults match the app's expectations:
--   - skills.is_selected: which skill rows appear on the current resume
--   - *_bullets.is_excluded: which bullets are hidden on the current resume
-- =========================================================================

alter table skills
    add column if not exists is_selected boolean not null default false;

alter table project_bullets
    add column if not exists is_excluded boolean not null default false;

alter table work_bullets
    add column if not exists is_excluded boolean not null default false;
