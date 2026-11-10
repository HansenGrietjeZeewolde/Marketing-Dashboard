-- Volgers aan het eind van een maand. Meta geeft alleen de stand van vandaag;
-- voor eerdere maanden rekenen we terug met de dagelijkse nieuwe en vertrokken
-- volgers (alleen als die dagen vrijwel compleet zijn). followers_estimated = teruggerekend.
drop view if exists public.account_monthly;
create view public.account_monthly with (security_invoker = true) as
with m as (
  select
    account_id, location_id, platform,
    date_trunc('month', day)::date as month,
    (array_agg(followers_total order by day desc) filter (where followers_total is not null))[1] as followers_real,
    sum(follows) as follows, sum(unfollows) as unfollows,
    sum(reach) as reach_daily_sum, sum(reach_followers) as reach_followers,
    sum(reach_non_followers) as reach_non_followers,
    sum(views) as views, sum(total_interactions) as total_interactions,
    count(views) as days_covered,
    count(views) >= case
      when date_trunc('month', day) = date_trunc('month', current_date)
        then greatest((current_date - date_trunc('month', current_date)::date) - 2, 1)
      else extract(day from (date_trunc('month', day) + interval '1 month - 1 day'))::int
    end as complete
  from public.account_daily
  group by account_id, location_id, platform, date_trunc('month', day)
),
latest as (
  select distinct on (account_id) account_id, day, followers_total
  from public.account_daily where followers_total is not null
  order by account_id, day desc
)
select
  m.account_id, m.location_id, m.platform, m.month,
  coalesce(m.followers_real, est.v) as followers_end,
  (m.followers_real is null and est.v is not null) as followers_estimated,
  m.follows, m.unfollows, m.reach_daily_sum, m.reach_followers, m.reach_non_followers,
  m.views, m.total_interactions, m.days_covered, m.complete
from m
left join latest l on l.account_id = m.account_id
left join lateral (
  select case
    when l.day is not null
     and count(d.follows) >= (l.day - (m.month + interval '1 month')::date + 1) - 2
    then l.followers_total - sum(coalesce(d.follows, 0) - coalesce(d.unfollows, 0))
  end as v
  from public.account_daily d
  where d.account_id = m.account_id
    and d.day >= (m.month + interval '1 month')::date
    and d.day <= l.day
) est on m.followers_real is null;

grant select on public.account_monthly to authenticated;
