-- ============================================================
--  Marketing dashboard - Supabase schema
--  Sprookjeslocaties (Hans & Grietje en zusterlocaties)
--
--  Volgorde van uitvoeren in Supabase:
--    1. schema.sql   (dit bestand - tabellen + helpers)
--    2. policies.sql (RLS aanzetten + policies)
--    3. seed.sql     (vier vestigingen)
--
--  Kijktijd wordt intern in SECONDEN opgeslagen (watch_duration_seconds).
--  De frontend toont kijktijd altijd in minuten.
-- ============================================================

-- Benodigde extensies (gen_random_uuid) --------------------------------------
create extension if not exists "pgcrypto";

-- ============================================================
--  PROFILES  (1-op-1 met auth.users)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text        not null,
  full_name   text,
  role        text        not null default 'viewer'
                          check (role in ('admin','viewer')),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
--  COMPANIES  (vestigingen)
-- ============================================================
create table if not exists public.companies (
  id           uuid primary key default gen_random_uuid(),
  slug         text        not null unique,
  name         text        not null,
  accent_color text,
  created_at   timestamptz not null default now()
);

-- ============================================================
--  COMPANY_MEMBERS  (welke gebruiker mag welke vestiging zien)
-- ============================================================
create table if not exists public.company_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id)  on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, company_id)
);

-- ============================================================
--  IMPORTS  (importgeschiedenis + diagnostiek)
--  Vooruit gedefinieerd zodat posts ernaar kan verwijzen.
-- ============================================================
create table if not exists public.imports (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  user_id           uuid references public.profiles(id) on delete set null,
  file_name         text,
  file_type         text,               -- 'pdf' | 'xlsx' | 'json'
  storage_path      text,               -- pad in bucket marketing-imports (optioneel)
  parser_profile    text,
  status            text not null default 'pending'
                        check (status in ('pending','completed','reverted','failed')),
  records_found     integer not null default 0,
  records_valid     integer not null default 0,
  records_imported  integer not null default 0,
  records_skipped   integer not null default 0,
  records_replaced  integer not null default 0,
  diagnostics       jsonb,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

-- ============================================================
--  POSTS
--  Kijktijd in seconden. Reels: post_type='reel' AND watch_duration_seconds>0.
-- ============================================================
create table if not exists public.posts (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  platform               text not null check (platform in ('Facebook','Instagram')),
  published_date         date,
  published_time         text,
  caption                text,
  post_type              text not null default 'post'
                             check (post_type in ('post','reel')),
  comments               numeric,
  engagement             numeric,
  follows                numeric,
  likes                  numeric,
  reach                  numeric,
  watch_duration_seconds numeric,
  saves                  numeric,
  shares                 numeric,
  views                  numeric,
  dedup_key              text not null,
  source_import_id       uuid references public.imports(id) on delete set null,
  source_file_name       text,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (company_id, dedup_key)
);

create index if not exists posts_company_date_idx
  on public.posts (company_id, published_date);
create index if not exists posts_import_idx
  on public.posts (source_import_id);

-- ============================================================
--  FOLLOWER_STATS  (volgers per maand; uniek per vestiging+maand)
-- ============================================================
create table if not exists public.follower_stats (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  month             text not null,               -- 'YYYY-MM'
  facebook_total    numeric,
  facebook_new      numeric,
  instagram_total   numeric,
  instagram_new     numeric,
  target_percentage numeric,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, month)
);

-- ============================================================
--  WIDGETS
-- ============================================================
create table if not exists public.widgets (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  metric           text not null,
  platform_filter  text not null default 'all',
  group_by         text not null default 'platform',
  chart_type       text not null default 'bar',
  sort_order       integer not null default 0,
  settings         jsonb,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
--  DASHBOARD_SETTINGS  (per vestiging kleine instellingen)
-- ============================================================
create table if not exists public.dashboard_settings (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  key         text not null,
  value       jsonb,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, key)
);

-- ============================================================
--  IMPORT_POSTS  (koppeltabel om imports veilig terug te draaien)
-- ============================================================
create table if not exists public.import_posts (
  id         uuid primary key default gen_random_uuid(),
  import_id  uuid not null references public.imports(id) on delete cascade,
  post_id    uuid references public.posts(id) on delete set null,
  action     text not null default 'insert'
                 check (action in ('insert','replace','skip')),
  created_at timestamptz not null default now()
);

create index if not exists import_posts_import_idx
  on public.import_posts (import_id);

-- ============================================================
--  HELPERFUNCTIES
--  SECURITY DEFINER + vaste search_path zodat RLS-policies
--  de rol kunnen bepalen ZONDER recursief profiles te bevragen
--  onder de policy van de aanroepende gebruiker.
-- ============================================================

-- is_admin(): true als de ingelogde gebruiker actief admin is.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  );
$$;

-- is_active_user(): true als de ingelogde gebruiker bestaat en actief is.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true
  );
$$;

-- is_member_of(company): true als de gebruiker admin is OF via
-- company_members aan de vestiging gekoppeld is. Ook SECURITY DEFINER
-- om recursie op company_members-policies te vermijden.
create or replace function public.is_member_of(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.company_members m
      join public.profiles p on p.id = m.user_id
      where m.user_id = auth.uid()
        and m.company_id = target_company
        and p.is_active = true
    );
$$;

-- ============================================================
--  TRIGGERS
-- ============================================================

-- updated_at automatisch bijwerken.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_posts on public.posts;
create trigger trg_touch_posts before update on public.posts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_follower on public.follower_stats;
create trigger trg_touch_follower before update on public.follower_stats
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_widgets on public.widgets;
create trigger trg_touch_widgets before update on public.widgets
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_settings on public.dashboard_settings;
create trigger trg_touch_settings before update on public.dashboard_settings
  for each row execute function public.touch_updated_at();

-- Nieuw auth.users-account -> automatisch profiel (default viewer, inactief
-- tot een admin activeert). Zo bestaat er altijd een profielrij.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'viewer'),
    coalesce((new.raw_user_meta_data->>'is_active')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
