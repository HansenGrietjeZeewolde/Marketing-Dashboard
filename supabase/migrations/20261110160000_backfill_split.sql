-- Een taak die vastliep (rekenlimiet, of langer dan 5 minuten 'running') wordt in tweeën
-- gesplitst voordat hij opnieuw wordt opgepakt, tot een minimum van 4 dagen per taak.
create or replace function public.backfill_claim(n int)
returns setof public.backfill_jobs
language plpgsql security definer set search_path = public as $$
declare j record; mid date;
begin
  for j in
    select * from public.backfill_jobs
    where ((status = 'running' and updated_at < now() - interval '5 minutes')
        or (status = 'error' and (last_error ilike '%546%' or last_error ilike '%compute%' or last_error ilike '%worker%' or last_error ilike '%status 5%')))
      and period_end - period_start >= 8
    for update skip locked
  loop
    mid := j.period_start + ((j.period_end - j.period_start) / 2);
    update public.backfill_jobs set period_end = mid, status = 'pending', attempts = 0, last_error = null, updated_at = now() where id = j.id;
    insert into public.backfill_jobs (account_id, period_start, period_end) values (j.account_id, mid, j.period_end)
      on conflict (account_id, period_start) do nothing;
  end loop;

  return query
  update public.backfill_jobs b set status = 'running', attempts = attempts + 1, updated_at = now()
  where b.id in (
    select id from public.backfill_jobs
    where attempts < 6
      and ((status = 'pending') or (status = 'running' and updated_at < now() - interval '5 minutes'))
    order by period_start desc, id
    limit n
    for update skip locked)
  returning b.*;
end $$;
revoke all on function public.backfill_claim(int) from public, anon, authenticated;
grant execute on function public.backfill_claim(int) to service_role;
