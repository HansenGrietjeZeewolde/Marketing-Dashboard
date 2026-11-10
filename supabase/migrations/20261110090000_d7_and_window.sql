-- 1) Stand na 7 dagen per post, zodat posts eerlijk vergeleken kunnen worden
--    (een post van gisteren heeft nog geen tijd gehad om weergaven te verzamelen).
--    We nemen de eerste momentopname vanaf 7 dagen na plaatsing, met maximaal
--    3 dagen speling voor een gemiste nacht. Geen momentopname = leeg.
create or replace view public.post_stats with (security_invoker = true) as
select
  p.id, p.account_id, p.location_id, p.platform, p.external_id, p.published_at,
  (p.published_at at time zone 'Europe/Amsterdam') as published_local,
  p.media_type, p.caption, p.permalink, p.thumbnail_url, p.source,
  m.captured_on, m.views, m.reach, m.likes, m.comments, m.shares, m.saves,
  m.follows, m.profile_visits, m.clicks, m.watch_time_avg_sec, m.watch_time_total_sec,
  coalesce(m.total_interactions,
           coalesce(m.likes, 0) + coalesce(m.comments, 0) + coalesce(m.shares, 0) + coalesce(m.saves, 0)
  ) as interactions,
  d7.views as views_d7,
  d7.reach as reach_d7,
  coalesce(d7.total_interactions,
           d7.likes + d7.comments + coalesce(d7.shares, 0) + coalesce(d7.saves, 0)) as interactions_d7
from public.posts p
left join lateral (
  select * from public.post_metrics pm
  where pm.post_id = p.id
  order by pm.captured_on desc
  limit 1
) m on true
left join lateral (
  select * from public.post_metrics pm
  where pm.post_id = p.id
    and pm.captured_on >= (p.published_at at time zone 'Europe/Amsterdam')::date + 7
    and pm.captured_on <= (p.published_at at time zone 'Europe/Amsterdam')::date + 10
  order by pm.captured_on
  limit 1
) d7 on true;

grant select on public.post_stats to authenticated;

-- 2) Ophaalvenster: dagelijks de laatste 35 dagen, op zondag de laatste 90 dagen,
--    zodat ook late groei (een reel die pas later oppikt) nog meetelt.
select cron.unschedule('meta-sync-nachtelijk');

select cron.schedule('meta-sync-nachtelijk', '30 2 * * 1-6', $job$
  select net.http_post(
    url := 'https://saitgqruilgryftbxhtk.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meta_sync_secret')),
    body := '{"days":35}'::jsonb, timeout_milliseconds := 150000);
$job$);

select cron.schedule('meta-sync-wekelijks-90d', '30 2 * * 0', $job$
  select net.http_post(
    url := 'https://saitgqruilgryftbxhtk.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meta_sync_secret')),
    body := '{"days":90}'::jsonb, timeout_milliseconds := 150000);
$job$);
