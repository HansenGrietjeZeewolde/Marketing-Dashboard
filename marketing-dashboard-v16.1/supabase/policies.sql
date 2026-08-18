-- ============================================================
--  Marketing dashboard - Row Level Security policies
--
--  Kernregels:
--    * Admin  -> SELECT/INSERT/UPDATE/DELETE op alles.
--    * Viewer -> ALLEEN SELECT, en alleen van vestigingen waaraan
--                hij via company_members gekoppeld is.
--    * Zonder actieve sessie -> niets zichtbaar.
--
--  Beveiliging wordt AFGEDWONGEN in de database, niet in de UI.
--  Een viewer die rechtstreeks de Supabase-client, de browserconsole
--  of een API-verzoek gebruikt, kan hierdoor nog steeds niets schrijven.
--
--  Voer dit uit NA schema.sql.
-- ============================================================

-- RLS aanzetten op alle tabellen --------------------------------------------
alter table public.profiles           enable row level security;
alter table public.companies          enable row level security;
alter table public.company_members    enable row level security;
alter table public.posts              enable row level security;
alter table public.follower_stats     enable row level security;
alter table public.widgets            enable row level security;
alter table public.dashboard_settings enable row level security;
alter table public.imports            enable row level security;
alter table public.import_posts       enable row level security;

-- Zekerheidshalve oude policies droppen (idempotent) ------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ============================================================
--  PROFILES
--  - Iedere actieve gebruiker mag zijn EIGEN profiel lezen.
--  - Admin mag alle profielen lezen en beheren.
--  - Schrijven op profiles gebeurt server-side (service role) via de
--    users-API; daarom hier GEEN insert/update/delete voor gewone rollen,
--    behalve dat een admin binnen de app rollen mag bijwerken.
-- ============================================================
create policy profiles_select_self on public.profiles
  for select using ( id = auth.uid() or public.is_admin() );

create policy profiles_update_admin on public.profiles
  for update using ( public.is_admin() )
  with check ( public.is_admin() );

-- (Geen insert/delete-policy: inserts komen van de handle_new_user-trigger
--  (SECURITY DEFINER) of de service-role-API; delete gebeurt server-side.)

-- ============================================================
--  COMPANIES
--  - Iedere actieve gebruiker mag de lijst met vestigingen lezen
--    (nodig voor de vestigingsnavigatie). Data-scheiding gebeurt op
--    de inhoudstabellen, niet op de namenlijst.
--  - Alleen admin mag vestigingen aanmaken/wijzigen/verwijderen.
-- ============================================================
create policy companies_select on public.companies
  for select using ( public.is_active_user() );

create policy companies_insert_admin on public.companies
  for insert with check ( public.is_admin() );
create policy companies_update_admin on public.companies
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy companies_delete_admin on public.companies
  for delete using ( public.is_admin() );

-- ============================================================
--  COMPANY_MEMBERS
--  - Gebruiker mag zijn eigen koppelingen zien; admin ziet alles.
--  - Alleen admin mag koppelingen beheren.
-- ============================================================
create policy members_select on public.company_members
  for select using ( user_id = auth.uid() or public.is_admin() );

create policy members_insert_admin on public.company_members
  for insert with check ( public.is_admin() );
create policy members_update_admin on public.company_members
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy members_delete_admin on public.company_members
  for delete using ( public.is_admin() );

-- ============================================================
--  POSTS
--  - SELECT: lid van de vestiging (of admin).
--  - INSERT/UPDATE/DELETE: alleen admin.
-- ============================================================
create policy posts_select on public.posts
  for select using ( public.is_member_of(company_id) );

create policy posts_insert_admin on public.posts
  for insert with check ( public.is_admin() );
create policy posts_update_admin on public.posts
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy posts_delete_admin on public.posts
  for delete using ( public.is_admin() );

-- ============================================================
--  FOLLOWER_STATS
-- ============================================================
create policy follower_select on public.follower_stats
  for select using ( public.is_member_of(company_id) );

create policy follower_insert_admin on public.follower_stats
  for insert with check ( public.is_admin() );
create policy follower_update_admin on public.follower_stats
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy follower_delete_admin on public.follower_stats
  for delete using ( public.is_admin() );

-- ============================================================
--  WIDGETS
-- ============================================================
create policy widgets_select on public.widgets
  for select using ( public.is_member_of(company_id) );

create policy widgets_insert_admin on public.widgets
  for insert with check ( public.is_admin() );
create policy widgets_update_admin on public.widgets
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy widgets_delete_admin on public.widgets
  for delete using ( public.is_admin() );

-- ============================================================
--  DASHBOARD_SETTINGS
-- ============================================================
create policy settings_select on public.dashboard_settings
  for select using ( public.is_member_of(company_id) );

create policy settings_insert_admin on public.dashboard_settings
  for insert with check ( public.is_admin() );
create policy settings_update_admin on public.dashboard_settings
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy settings_delete_admin on public.dashboard_settings
  for delete using ( public.is_admin() );

-- ============================================================
--  IMPORTS
--  - SELECT: lid van de vestiging (viewer mag importgeschiedenis zien).
--  - Schrijven: alleen admin.
-- ============================================================
create policy imports_select on public.imports
  for select using ( public.is_member_of(company_id) );

create policy imports_insert_admin on public.imports
  for insert with check ( public.is_admin() );
create policy imports_update_admin on public.imports
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy imports_delete_admin on public.imports
  for delete using ( public.is_admin() );

-- ============================================================
--  IMPORT_POSTS
--  - SELECT: lid van de bijbehorende vestiging (via de import).
--  - Schrijven: alleen admin.
-- ============================================================
create policy import_posts_select on public.import_posts
  for select using (
    exists (
      select 1 from public.imports i
      where i.id = import_posts.import_id
        and public.is_member_of(i.company_id)
    )
  );

create policy import_posts_insert_admin on public.import_posts
  for insert with check ( public.is_admin() );
create policy import_posts_update_admin on public.import_posts
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy import_posts_delete_admin on public.import_posts
  for delete using ( public.is_admin() );

-- ============================================================
--  STORAGE-POLICIES  (bucket: marketing-imports, PRIVATE)
--  Maak de bucket eerst aan (zie README). Alleen admins mogen
--  bestanden in deze bucket zien/uploaden/verwijderen.
-- ============================================================
-- LET OP: de bucket zelf maak je via het Supabase-dashboard of de API
-- (name = 'marketing-imports', public = false). Onderstaande policies
-- regelen de toegang op storage.objects.

drop policy if exists storage_imports_select_admin on storage.objects;
drop policy if exists storage_imports_insert_admin on storage.objects;
drop policy if exists storage_imports_update_admin on storage.objects;
drop policy if exists storage_imports_delete_admin on storage.objects;

create policy storage_imports_select_admin on storage.objects
  for select using ( bucket_id = 'marketing-imports' and public.is_admin() );
create policy storage_imports_insert_admin on storage.objects
  for insert with check ( bucket_id = 'marketing-imports' and public.is_admin() );
create policy storage_imports_update_admin on storage.objects
  for update using ( bucket_id = 'marketing-imports' and public.is_admin() )
  with check ( bucket_id = 'marketing-imports' and public.is_admin() );
create policy storage_imports_delete_admin on storage.objects
  for delete using ( bucket_id = 'marketing-imports' and public.is_admin() );
