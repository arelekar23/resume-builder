-- Profiles table: one row per authenticated user
-- Linked 1:1 with auth.users via shared UUID

create table profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    email text,
    phone text,
    location text,
    linkedin_url text,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- Auto-create a profiles row whenever a new user signs up
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (
        new.id,
        new.email,
        new.raw_user_meta_data->>'full_name'
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- Auto-update the updated_at timestamp on any row change
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_set_updated_at
    before update on profiles
    for each row execute function set_updated_at();

-- Enable RLS so users can only see/edit their own profile
alter table profiles enable row level security;

create policy "Users can view own profile"
    on profiles for select
    using (auth.uid() = id);

create policy "Users can update own profile"
    on profiles for update
    using (auth.uid() = id);