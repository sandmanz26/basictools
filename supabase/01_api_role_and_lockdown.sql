-- HireFlow on Supabase: run this ONCE in the Supabase SQL editor, AFTER the schema (00_schema.sql) exists.
--
-- Why: HireFlow has its own API server (server/) that talks to Postgres directly. Nobody should reach these
-- tables through Supabase's auto-generated REST/GraphQL API with the public "anon" key. This script
--   1. turns on Row Level Security for every table (with no policies = anon/authenticated can read nothing), and
--   2. creates a dedicated role for the API server, instead of using the all-powerful "postgres" role.
--
-- Before running: replace CHANGE_ME_LONG_RANDOM_PASSWORD below (e.g. `openssl rand -base64 32`).

-- 1. Lock the public API out -------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 2. Role used by the API server ------------------------------------------------------------------------------
-- BYPASSRLS because the API enforces permissions itself (RBAC) and must see every row.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hireflow_api') then
    create role hireflow_api login password 'CHANGE_ME_LONG_RANDOM_PASSWORD' bypassrls;
  end if;
end $$;

grant usage on schema public to hireflow_api;
grant select, insert, update, delete on all tables    in schema public to hireflow_api;
grant usage, select                  on all sequences in schema public to hireflow_api;
alter default privileges in schema public grant select, insert, update, delete on tables    to hireflow_api;
alter default privileges in schema public grant usage, select                  on sequences to hireflow_api;

-- Re-run this whole script after every schema migration so new tables are locked down and granted too.
-- Check: every table should show rls = true, and anon/authenticated should have no privileges.
-- select tablename, rowsecurity as rls from pg_tables where schemaname = 'public' order by 1;
