-- Accountcijfers per maand alleen gebruiken als de maand (vrijwel) helemaal gedekt is.
-- Instagram levert dagcijfers per dag; de sync vult ontbrekende dagen stap voor stap aan.
-- Zolang een maand niet compleet is, valt het dashboard terug op de optelsom per post.
create or replace view public.account_monthly with (security_invoker = true) as
select
  account_id, location_id, platform,
  date_trunc('month', day)::date as month,
  (array_agg(followers_total order by day desc) filter (where followers_total is not null))[1] as followers_end,
  sum(follows) as follows,
  sum(unfollows) as unfollows,
  sum(reach) as reach_daily_sum,
  sum(reach_followers) as reach_followers,
  sum(reach_non_followers) as reach_non_followers,
  sum(views) as views,
  sum(total_interactions) as total_interactions,
  count(views) as days_covered,
  count(views) >= case
    when date_trunc('month', day) = date_trunc('month', current_date)
      then greatest((current_date - date_trunc('month', current_date)::date) - 2, 1)
    else extract(day from (date_trunc('month', day) + interval '1 month - 1 day'))::int
  end as complete
from public.account_daily d
group by account_id, location_id, platform, date_trunc('month', day);

grant select on public.account_monthly to authenticated;
