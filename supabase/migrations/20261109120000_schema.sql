-- =====================================================================
--  H&G marketingdashboard — databaseschema
--  ---------------------------------------------------------------------
--  Opgezet rond wat de Meta Graph API levert (Facebook-pagina's en
--  Instagram-zakelijke accounts), zodat de nachtelijke koppeling de
--  cijfers één-op-één kan wegschrijven.
--
--  Lagen:
--    locations         de vier vestigingen
--    social_accounts   Facebookpagina / Instagram-account per vestiging
--    posts             één rij per post (Meta media-/post-ID)
--    post_metrics      cijfers per post per ophaaldag (historie blijft)
--    account_daily     cijfers per account per dag (volgers, bereik ...)
--    audience          doelgroep (leeftijd, geslacht, stad, land)
--    events            evenementen/acties voor de AI-laag
--    ai_summaries      opgeslagen AI-samenvattingen per maand/locatie
--    profiles, location_members  gebruikers, rollen en toegang
--    private.*         tokens en koppel-status (niet via de API leesbaar)
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Vestigingen
-- ---------------------------------------------------------------------
create table public.locations (
  id          text primary key,                 -- 'hg', 'kbb', 'hbvp', 'bb'
  name        text not null,
  short_name  text not null,
  color       text not null,
  sort_order  int  not null
);

insert into public.locations (id, name, short_name, color, sort_order) values
  ('hg',   'Hans & Grietje',         'Hans & Grietje',       '#E41C2D', 1),
  ('kbb',  'Het Grote Kabouterbos',  'Kabouterbos',          '#D99A1F', 2),
  ('hbvp', 'Heksenblotevoetenpad',   'Heksenblotevoetenpad', '#3F7A46', 3),
  ('bb',   'De Betovering',          'Betovering',           '#6B4596', 4);

-- ---------------------------------------------------------------------
-- Gebruikers en rollen
--   admin       alles, inclusief beheer en Meta koppelen
--   marketing   overzicht + analyse + evenementen
--   management  alleen het overzicht
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'management'
                check (role in ('admin', 'marketing', 'management')),
  created_at  timestamptz not null default now()
);

create table public.location_members (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  location_id text not null references public.locations(id) on delete cascade,
  primary key (user_id, location_id)
);

-- ---------------------------------------------------------------------
-- Social-accounts
-- ---------------------------------------------------------------------
create table public.social_accounts (
  id              uuid primary key default gen_random_uuid(),
  location_id     text not null references public.locations(id) on delete cascade,
  platform        text not null check (platform in ('facebook', 'instagram')),
  external_id     text,                  -- Facebook Page ID / Instagram user ID
  handle          text,                  -- paginanaam / @gebruikersnaam
  connected       boolean not null default false,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  unique (location_id, platform),
  unique (platform, external_id)
);

-- ---------------------------------------------------------------------
-- Posts en cijfers per post
-- ---------------------------------------------------------------------
create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.social_accounts(id) on delete cascade,
  location_id    text not null references public.locations(id) on delete cascade,
  platform       text not null check (platform in ('facebook', 'instagram')),
  external_id    text not null,          -- Meta post-/media-ID (of 'import:...')
  published_at   timestamptz not null,
  media_type     text not null default 'other'
                   check (media_type in ('photo','video','reel','carousel','story','text','link','other')),
  caption        text,
  permalink      text,
  thumbnail_url  text,
  duration_sec   numeric,
  source         text not null default 'api' check (source in ('api', 'import')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (account_id, external_id)
);
create index posts_location_published_idx on public.posts (location_id, published_at desc);

-- Meta geeft "lifetime"-cijfers die nog groeien. Elke ophaaldag een rij,
-- zodat je de ontwikkeling van een post kunt volgen. Het dashboard leest
-- de laatste stand (view post_stats).
create table public.post_metrics (
  post_id               uuid not null references public.posts(id) on delete cascade,
  captured_on           date not null,
  views                 int,     -- IG views / FB post_media_view
  reach                 int,     -- IG reach / FB post_total_media_view_unique (kijkers)
  likes                 int,     -- IG likes / FB reacties totaal
  comments              int,
  shares                int,
  saves                 int,     -- alleen Instagram
  follows               int,     -- nieuwe volgers via deze post (IG feed)
  profile_visits        int,
  reposts               int,
  clicks                int,     -- FB post_clicks
  total_interactions    int,     -- IG total_interactions / FB reacties+opmerkingen+deelacties
  reactions             jsonb,   -- FB reacties per soort
  video_views           int,
  watch_time_total_sec  numeric,
  watch_time_avg_sec    numeric,
  primary key (post_id, captured_on)
);

-- ---------------------------------------------------------------------
-- Cijfers per account per dag
-- ---------------------------------------------------------------------
create table public.account_daily (
  account_id           uuid not null references public.social_accounts(id) on delete cascade,
  location_id          text not null references public.locations(id) on delete cascade,
  platform             text not null,
  day                  date not null,
  followers_total      int,     -- stand aan het eind van de dag
  follows              int,     -- nieuwe volgers
  unfollows            int,
  reach                int,
  reach_followers      int,     -- IG: bereik onder volgers
  reach_non_followers  int,     -- IG: bereik onder niet-volgers
  views                int,
  accounts_engaged     int,
  total_interactions   int,
  profile_link_taps    int,
  primary key (account_id, day)
);
create index account_daily_location_day_idx on public.account_daily (location_id, day);

-- ---------------------------------------------------------------------
-- Doelgroep (Meta levert top 45 per dimensie, vanaf 100 volgers)
-- ---------------------------------------------------------------------
create table public.audience (
  account_id   uuid not null references public.social_accounts(id) on delete cascade,
  location_id  text not null references public.locations(id) on delete cascade,
  captured_on  date not null,
  kind         text not null check (kind in ('followers', 'engaged')),
  dimension    text not null check (dimension in ('age', 'gender', 'city', 'country')),
  value        text not null,
  count        int  not null,
  primary key (account_id, captured_on, kind, dimension, value)
);

-- ---------------------------------------------------------------------
-- Evenementen en AI-samenvattingen
-- ---------------------------------------------------------------------
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  location_id  text references public.locations(id) on delete cascade,  -- leeg = alle locaties
  starts_on    date not null,
  ends_on      date,
  title        text not null check (char_length(title) between 1 and 200),
  notes        text check (char_length(notes) <= 2000),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.ai_summaries (
  id            uuid primary key default gen_random_uuid(),
  month         date not null check (extract(day from month) = 1),
  location_key  text not null,          -- 'alle' of een locatie-id
  screen        text not null check (screen in ('overzicht', 'analyse')),
  bullets       jsonb not null,
  model         text,
  created_at    timestamptz not null default now(),
  unique (month, location_key, screen)
);

-- ---------------------------------------------------------------------
-- Privé: tokens en koppelstatus (alleen voor Edge Functions met service role)
-- ---------------------------------------------------------------------
create table private.meta_tokens (
  account_id    uuid primary key references public.social_accounts(id) on delete cascade,
  access_token  text not null,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now()
);

create table private.oauth_states (
  state       text primary key,
  user_id     uuid not null,
  created_at  timestamptz not null default now()
);

create table public.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'ok', 'partial', 'error')),
  triggered_by text,
  details      jsonb
);

-- ---------------------------------------------------------------------
-- Hulpfuncties voor rechten (security definer, vaste search_path)
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_see_location(loc text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or exists (select 1 from public.location_members m
                 where m.user_id = auth.uid() and m.location_id = loc);
$$;

create or replace function public.can_edit_events()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin', 'marketing') from public.profiles where id = auth.uid()), false);
$$;

revoke execute on function public.my_role(), public.is_admin(),
  public.can_see_location(text), public.can_edit_events() from public, anon;
grant execute on function public.my_role(), public.is_admin(),
  public.can_see_location(text), public.can_edit_events() to authenticated;

-- Nieuwe gebruiker → profiel. Het H&G-beheeraccount wordt automatisch
-- beheerder met toegang tot alle locaties; iedereen anders begint als
-- 'management' zonder locaties tot een beheerder toegang geeft.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email,
          case when lower(new.email) = 'hansengrietjezeewolde@outlook.com' then 'admin' else 'management' end)
  on conflict (id) do nothing;
  if lower(new.email) = 'hansengrietjezeewolde@outlook.com' then
    insert into public.location_members (user_id, location_id)
    select new.id, l.id from public.locations l
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at bijhouden op posts
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.locations         enable row level security;
alter table public.profiles          enable row level security;
alter table public.location_members  enable row level security;
alter table public.social_accounts   enable row level security;
alter table public.posts             enable row level security;
alter table public.post_metrics      enable row level security;
alter table public.account_daily     enable row level security;
alter table public.audience          enable row level security;
alter table public.events            enable row level security;
alter table public.ai_summaries      enable row level security;
alter table public.sync_runs         enable row level security;
alter table private.meta_tokens      enable row level security;
alter table private.oauth_states     enable row level security;

create policy "locaties zichtbaar voor ingelogden" on public.locations
  for select to authenticated using (true);

create policy "eigen profiel of beheerder" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "beheerder wijzigt profielen" on public.profiles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "eigen toegang of beheerder" on public.location_members
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "beheerder geeft toegang" on public.location_members
  for insert to authenticated with check ((select public.is_admin()));
create policy "beheerder neemt toegang af" on public.location_members
  for delete to authenticated using ((select public.is_admin()));

create policy "accounts per locatie" on public.social_accounts
  for select to authenticated using (public.can_see_location(location_id));
create policy "posts per locatie" on public.posts
  for select to authenticated using (public.can_see_location(location_id));
create policy "postcijfers per locatie" on public.post_metrics
  for select to authenticated using (exists (
    select 1 from public.posts p where p.id = post_id and public.can_see_location(p.location_id)));
create policy "dagcijfers per locatie" on public.account_daily
  for select to authenticated using (public.can_see_location(location_id));
create policy "doelgroep per locatie" on public.audience
  for select to authenticated using (public.can_see_location(location_id));

create policy "evenementen lezen" on public.events
  for select to authenticated using (location_id is null or public.can_see_location(location_id));
create policy "evenementen toevoegen" on public.events
  for insert to authenticated with check ((select public.can_edit_events())
    and (location_id is null or public.can_see_location(location_id)));
create policy "evenementen wijzigen" on public.events
  for update to authenticated using ((select public.can_edit_events()))
  with check ((select public.can_edit_events()) and (location_id is null or public.can_see_location(location_id)));
create policy "evenementen verwijderen" on public.events
  for delete to authenticated using ((select public.can_edit_events()));

create policy "samenvattingen lezen" on public.ai_summaries
  for select to authenticated using (
    (location_key = 'alle' and exists (select 1 from public.location_members m where m.user_id = (select auth.uid())))
    or (select public.is_admin())
    or public.can_see_location(location_key));

create policy "synchronisaties zien (beheer)" on public.sync_runs
  for select to authenticated using ((select public.is_admin()));
-- private.* heeft bewust géén policies: alleen de service role kan erbij.

-- ---------------------------------------------------------------------
-- Views voor het dashboard (security_invoker: RLS van de lezer geldt)
-- ---------------------------------------------------------------------
create view public.post_stats with (security_invoker = true) as
select
  p.id, p.account_id, p.location_id, p.platform, p.external_id, p.published_at,
  (p.published_at at time zone 'Europe/Amsterdam') as published_local,
  p.media_type, p.caption, p.permalink, p.thumbnail_url, p.source,
  m.captured_on, m.views, m.reach, m.likes, m.comments, m.shares, m.saves,
  m.follows, m.profile_visits, m.clicks, m.watch_time_avg_sec, m.watch_time_total_sec,
  coalesce(m.total_interactions,
           coalesce(m.likes, 0) + coalesce(m.comments, 0) + coalesce(m.shares, 0) + coalesce(m.saves, 0)
  ) as interactions
from public.posts p
left join lateral (
  select * from public.post_metrics pm
  where pm.post_id = p.id
  order by pm.captured_on desc
  limit 1
) m on true;

create view public.account_monthly with (security_invoker = true) as
select
  d.account_id, d.location_id, d.platform,
  date_trunc('month', d.day)::date as month,
  (array_agg(d.followers_total order by d.day desc) filter (where d.followers_total is not null))[1] as followers_end,
  sum(d.follows)              as follows,
  sum(d.unfollows)            as unfollows,
  sum(d.reach)                as reach_daily_sum,
  sum(d.reach_followers)      as reach_followers,
  sum(d.reach_non_followers)  as reach_non_followers,
  sum(d.views)                as views,
  sum(d.total_interactions)   as total_interactions
from public.account_daily d
group by d.account_id, d.location_id, d.platform, date_trunc('month', d.day);

grant select on public.post_stats, public.account_monthly to authenticated;
