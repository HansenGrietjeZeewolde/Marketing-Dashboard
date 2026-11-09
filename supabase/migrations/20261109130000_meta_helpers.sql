-- Hulpfuncties voor de Edge Functions. Alleen de service role mag ze
-- aanroepen; zo blijven tokens in het afgeschermde schema 'private'.

create or replace function public.meta_save_state(p_state text, p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.oauth_states where created_at < now() - interval '1 hour';
  insert into private.oauth_states (state, user_id) values (p_state, p_user);
$$;

create or replace function public.meta_take_state(p_state text)
returns uuid language sql security definer set search_path = '' as $$
  delete from private.oauth_states
  where state = p_state and created_at > now() - interval '15 minutes'
  returning user_id;
$$;

create or replace function public.meta_save_token(p_account uuid, p_token text, p_expires timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.meta_tokens (account_id, access_token, expires_at, updated_at)
  values (p_account, p_token, p_expires, now())
  on conflict (account_id) do update
    set access_token = excluded.access_token, expires_at = excluded.expires_at, updated_at = now();
$$;

create or replace function public.meta_accounts_for_sync()
returns table (account_id uuid, location_id text, platform text, external_id text, access_token text)
language sql security definer set search_path = '' as $$
  select a.id, a.location_id, a.platform, a.external_id, t.access_token
  from public.social_accounts a
  join private.meta_tokens t on t.account_id = a.id
  where a.connected and a.external_id is not null;
$$;

revoke execute on function public.meta_save_state(text, uuid), public.meta_take_state(text),
  public.meta_save_token(uuid, text, timestamptz), public.meta_accounts_for_sync()
  from public, anon, authenticated;
grant execute on function public.meta_save_state(text, uuid), public.meta_take_state(text),
  public.meta_save_token(uuid, text, timestamptz), public.meta_accounts_for_sync()
  to service_role;
