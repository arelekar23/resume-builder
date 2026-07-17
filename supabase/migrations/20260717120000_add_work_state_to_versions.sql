-- =========================================================================
-- ADD work_state TO resume_versions
-- =========================================================================
-- Versions were originally an overlay keyed by existing master row ids, so a
-- version could not carry content that did not exist in the master:
--   - new projects / new bullets added while a version was active were dropped
--     on reload (bullets_state had no parent linkage), and
--   - new work (experience) entries had nowhere to live at all.
--
-- work_state mirrors projects_state so a version can hold net-new experience
-- entries, and bullets_state now carries a parent_id so new bullets round-trip.
-- Additive + idempotent: existing rows default to an empty array.
-- =========================================================================

alter table resume_versions
    add column if not exists work_state jsonb not null default '[]'::jsonb;
