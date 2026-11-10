-- Snellere versie van account_monthly: de volgers aan het eind van eerdere maanden
-- worden in één keer teruggerekend met een lopende som (window), in plaats van per
-- maand opnieuw door alle dagcijfers te lopen. Uitkomst is gelijk aan de vorige versie.
drop view if exists public.account_monthly;
create view public.account_monthly with (security_invoker = true) as
with m as (
  select
    account_id, location_id, platform,
    date_trunc('month', day)::date as month,
    (array_agg(followers_total order by day desc) filter (where followers_total is not null))[1] as followers_real,
    max(day) filter (where followers_total is not null) as snapshot_day,
    sum(follows) as follows, sum(unfollows) as unfollows,
    sum(coalesce(follows, 0) - coalesce(unfollows, 0)) as net,
    count(follows) as follow_days,
    sum(reach) as reach_daily_sum, sum(reach_followers) as reach_followers,
    sum(reach_non_followers) as reach_non_followers,
    sum(views) as views, sum(total_interactions) as total_interactions,
    count(views) as days_covered,
    (count(views) >= case
      when date_trunc('month', day) = date_trunc('month', current_date)
        then greatest((current_date - date_trunc('month', current_date)::date) - 2, 1)
      else extract(day from (date_trunc('month', day) + interval '1 month - 1 day'))::int
    end and coalesce(sum(views), 0) > 0) as complete
  from public.account_daily
  group by account_id, location_id, platform, date_trunc('month', day)
),
w as (
  select m.*,
    -- laatste bekende volgersstand van dit account
    (array_agg(followers_real) filter (where followers_real is not null) over (partition by account_id order by month desc
       rows between unbounded preceding and unbounded following))[1] as latest_total,
    max(snapshot_day) over (partition by account_id) as latest_day,
    -- som van de netto groei en van de gedekte dagen in alle latere maanden
    coalesce(sum(net) over (partition by account_id order by month desc rows between unbounded preceding and 1 preceding), 0) as net_after,
    coalesce(sum(follow_days) over (partition by account_id order by month desc rows between unbounded preceding and 1 preceding), 0) as days_after
  from m
)
select
  account_id, location_id, platform, month,
  coalesce(followers_real,
    case when latest_total is not null
          and days_after >= (latest_day - (month + interval '1 month')::date + 1) - 2
         then (latest_total - net_after)::bigint end) as followers_end,
  (followers_real is null and latest_total is not null
    and days_after >= (latest_day - (month + interval '1 month')::date + 1) - 2) as followers_estimated,
  follows, unfollows, reach_daily_sum, reach_followers, reach_non_followers,
  views, total_interactions, days_covered, complete
from w;

grant select on public.account_monthly to authenticated;
