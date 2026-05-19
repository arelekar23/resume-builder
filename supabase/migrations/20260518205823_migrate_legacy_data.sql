-- One-time data migration from resume_state JSONB blob to normalized tables.
-- Takes the 'default' row's data and inserts it for the given profile_id.

create or replace function migrate_resume_state_to_profile(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    blob jsonb;
    selected_ids text[];
    project_record jsonb;
    work_record jsonb;
    bullet text;
    skill_key text;
    skill_value text;
    project_external_id text;
    project_uuid uuid;
    work_uuid uuid;
    pos int;
    bullet_pos int;
begin
    -- Pull the blob
    select data into blob from resume_state where id = 'default';

    if blob is null then
        raise exception 'No resume_state row found with id = default';
    end if;

    -- Extract selected_projects array (used to set is_selected on projects)
    select array(select jsonb_array_elements_text(blob->'selected_projects'))
    into selected_ids;

    -- Insert skills
    pos := 0;
    for skill_key, skill_value in select * from jsonb_each_text(blob->'skills') loop
        insert into skills (profile_id, category, items, position)
        values (target_profile_id, skill_key, skill_value, pos);
        pos := pos + 1;
    end loop;

    -- Insert work + bullets
    pos := 0;
    for work_record in select * from jsonb_array_elements(blob->'work') loop
        insert into work (profile_id, title, date, position)
        values (
            target_profile_id,
            work_record->>'title',
            work_record->>'date',
            pos
        )
        returning id into work_uuid;

        bullet_pos := 0;
        for bullet in select * from jsonb_array_elements_text(work_record->'bullets') loop
            insert into work_bullets (work_id, text, original_text, position)
            values (work_uuid, bullet, bullet, bullet_pos);
            bullet_pos := bullet_pos + 1;
        end loop;

        pos := pos + 1;
    end loop;

    -- Insert projects + bullets
    pos := 0;
    for project_record in select * from jsonb_array_elements(blob->'projects') loop
        project_external_id := project_record->>'id';

        insert into projects (profile_id, title, date, position, is_selected)
        values (
            target_profile_id,
            project_record->>'title',
            project_record->>'date',
            pos,
            project_external_id = any(selected_ids)
        )
        returning id into project_uuid;

        bullet_pos := 0;
        for bullet in select * from jsonb_array_elements_text(project_record->'bullets') loop
            insert into project_bullets (project_id, text, original_text, position)
            values (project_uuid, bullet, bullet, bullet_pos);
            bullet_pos := bullet_pos + 1;
        end loop;

        pos := pos + 1;
    end loop;
end;
$$;