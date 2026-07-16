-- The resume header shows a GitHub link, but the profiles table only had
-- linkedin_url. Add github_url so personal info is fully DB-driven (no hardcoding).
alter table profiles
    add column if not exists github_url text;
