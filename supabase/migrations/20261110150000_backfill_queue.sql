-- Eenmalig de historie ophalen (2025 en 2026) zonder de limieten van Supabase of Meta
-- te raken: een wachtrij met één taak per account per maand. Elke minuut pakt de
-- functie meta-sync er een paar op (mode "backfill-step").
create table if not exists public.backfill_jobs (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  period_start date not null,
  period_end date not null,          -- exclusief
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  attempts int not null default 0,
  posts int,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (account_id, period_start)
);
alter table public.backfill_jobs enable row level security;
create policy "beheerders zien de wachtrij" on public.backfill_jobs for select to authenticated using (public.is_admin());

-- Pakt n taken op (of taken die al 5 minuten 'running' hangen).
create or replace function public.backfill_claim(n int)
returns setof public.backfill_jobs
language sql security definer set search_path = public as $$
  update public.backfill_jobs j set status = 'running', attempts = attempts + 1, updated_at = now()
  where j.id in (
    select id from public.backfill_jobs
    where attempts < 6
      and ((status = 'pending') or (status = 'running' and updated_at < now() - interval '5 minutes'))
    order by period_start desc, id
    limit n
    for update skip locked)
  returning j.*;
$$;
revoke all on function public.backfill_claim(int) from public, anon, authenticated;
grant execute on function public.backfill_claim(int) to service_role;

-- Taken: alle gekoppelde accounts, januari 2025 tot en met de huidige maand.
insert into public.backfill_jobs (account_id, period_start, period_end)
select a.id, m::date, (m + interval '1 month')::date
from public.social_accounts a
cross join generate_series(date '2025-01-01', date_trunc('month', current_date), interval '1 month') m
where a.connected
on conflict do nothing;

-- Elke minuut een stap, alleen zolang er nog taken open staan.
select cron.schedule('meta-backfill', '* * * * *', $job$
  select net.http_post(
    url := 'https://saitgqruilgryftbxhtk.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meta_sync_secret')),
    body := '{"mode":"backfill-step","n":3}'::jsonb, timeout_milliseconds := 150000)
  where exists (select 1 from public.backfill_jobs where status in ('pending','running') and attempts < 6);
$job$);

-- De import uit de exports van juni/juli 2026 vervalt: alles komt nu uit Meta.
delete from public.posts where source = 'import';
