-- =========================================================================
-- EDUCATION
-- =========================================================================

create table education (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    school text not null,
    degree text not null,
    details text,
    date text not null,
    position int not null default 0,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index education_profile_position_idx on education(profile_id, position);

create trigger education_set_updated_at
    before update on education
    for each row execute function set_updated_at();

alter table education enable row level security;

create policy "Users manage own education"
    on education for all
    using (profile_id = auth.uid())
    with check (profile_id = auth.uid());

-- =========================================================================
-- WORK
-- =========================================================================

create table work (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    title text not null,
    date text not null,
    position int not null default 0,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index work_profile_position_idx on work(profile_id, position);

create trigger work_set_updated_at
    before update on work
    for each row execute function set_updated_at();

alter table work enable row level security;

create policy "Users manage own work"
    on work for all
    using (profile_id = auth.uid())
    with check (profile_id = auth.uid());

create table work_bullets (
    id uuid primary key default gen_random_uuid(),
    work_id uuid not null references work(id) on delete cascade,
    text text not null,
    original_text text not null,
    position int not null default 0,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index work_bullets_work_position_idx on work_bullets(work_id, position);

create trigger work_bullets_set_updated_at
    before update on work_bullets
    for each row execute function set_updated_at();

alter table work_bullets enable row level security;

create policy "Users manage own work bullets"
    on work_bullets for all
    using (
        exists (
            select 1 from work
            where work.id = work_bullets.work_id
              and work.profile_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from work
            where work.id = work_bullets.work_id
              and work.profile_id = auth.uid()
        )
    );

-- =========================================================================
-- PROJECTS
-- =========================================================================

create table projects (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    title text not null,
    date text not null,
    position int not null default 0,
    is_selected boolean not null default false,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index projects_profile_position_idx on projects(profile_id, position);
create index projects_profile_selected_idx on projects(profile_id) where is_selected;

create trigger projects_set_updated_at
    before update on projects
    for each row execute function set_updated_at();

alter table projects enable row level security;

create policy "Users manage own projects"
    on projects for all
    using (profile_id = auth.uid())
    with check (profile_id = auth.uid());

create table project_bullets (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references projects(id) on delete cascade,
    text text not null,
    original_text text not null,
    position int not null default 0,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index project_bullets_project_position_idx on project_bullets(project_id, position);

create trigger project_bullets_set_updated_at
    before update on project_bullets
    for each row execute function set_updated_at();

alter table project_bullets enable row level security;

create policy "Users manage own project bullets"
    on project_bullets for all
    using (
        exists (
            select 1 from projects
            where projects.id = project_bullets.project_id
              and projects.profile_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from projects
            where projects.id = project_bullets.project_id
              and projects.profile_id = auth.uid()
        )
    );

-- =========================================================================
-- SKILLS
-- =========================================================================

create table skills (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    category text not null,
    items text not null,
    position int not null default 0,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index skills_profile_position_idx on skills(profile_id, position);

create trigger skills_set_updated_at
    before update on skills
    for each row execute function set_updated_at();

alter table skills enable row level security;

create policy "Users manage own skills"
    on skills for all
    using (profile_id = auth.uid())
    with check (profile_id = auth.uid());