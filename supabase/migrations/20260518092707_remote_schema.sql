drop extension if exists "pg_net";


  create table "public"."resume_state" (
    "id" text not null,
    "data" jsonb not null,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."resume_state" enable row level security;

CREATE UNIQUE INDEX resume_state_pkey ON public.resume_state USING btree (id);

alter table "public"."resume_state" add constraint "resume_state_pkey" PRIMARY KEY using index "resume_state_pkey";

grant delete on table "public"."resume_state" to "anon";

grant insert on table "public"."resume_state" to "anon";

grant references on table "public"."resume_state" to "anon";

grant select on table "public"."resume_state" to "anon";

grant trigger on table "public"."resume_state" to "anon";

grant truncate on table "public"."resume_state" to "anon";

grant update on table "public"."resume_state" to "anon";

grant delete on table "public"."resume_state" to "authenticated";

grant insert on table "public"."resume_state" to "authenticated";

grant references on table "public"."resume_state" to "authenticated";

grant select on table "public"."resume_state" to "authenticated";

grant trigger on table "public"."resume_state" to "authenticated";

grant truncate on table "public"."resume_state" to "authenticated";

grant update on table "public"."resume_state" to "authenticated";

grant delete on table "public"."resume_state" to "service_role";

grant insert on table "public"."resume_state" to "service_role";

grant references on table "public"."resume_state" to "service_role";

grant select on table "public"."resume_state" to "service_role";

grant trigger on table "public"."resume_state" to "service_role";

grant truncate on table "public"."resume_state" to "service_role";

grant update on table "public"."resume_state" to "service_role";


  create policy "anon can read default row"
  on "public"."resume_state"
  as permissive
  for select
  to public
using ((id = 'default'::text));



  create policy "anon can update default row"
  on "public"."resume_state"
  as permissive
  for update
  to public
using ((id = 'default'::text));



