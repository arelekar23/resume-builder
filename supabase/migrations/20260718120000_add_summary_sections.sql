-- =========================================================================
-- SUMMARY + SECTION ORDER
-- =========================================================================
-- Adds a resume summary (per-version, with a master base) and a master-level
-- section order. Additive + idempotent so it is safe to re-run and won't break
-- the live app.
--   profiles.summary        : master-base summary text
--   profiles.section_order  : ordered list of section keys for rendering
--   resume_versions.summary : the version's tailored summary (overlays the base)
-- Section keys: summary | education | skills | experience | projects
-- (the name/contact header is always first and is not reorderable).
-- =========================================================================

alter table profiles
    add column if not exists summary text;

alter table profiles
    add column if not exists section_order jsonb not null
    default '["summary","education","skills","experience","projects"]'::jsonb;

alter table resume_versions
    add column if not exists summary text;
