-- =========================================================================
-- BULLET TAGS
-- =========================================================================
-- Private drafting labels on master bullets (e.g. a role focus) so the user
-- can see which bullets suit which kind of application. Never rendered on the
-- resume. Versions carry their own copy inside bullets_state (jsonb), so no
-- resume_versions change is needed. Additive + idempotent.
-- =========================================================================

alter table project_bullets
    add column if not exists tags text[] not null default '{}';

alter table work_bullets
    add column if not exists tags text[] not null default '{}';
