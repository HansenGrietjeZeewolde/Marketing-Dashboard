-- Nachtelijke synchronisatie met Meta (02:30 UTC = 03:30/04:30 Nederlandse tijd).
-- Het geheim staat in Supabase Vault; de functie meta-sync controleert het via
-- meta_check_sync_secret, zodat er nergens een sleutel gekopieerd hoeft te worden.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'meta_sync_secret', 'Geheim voor de nachtelijke Meta-synchronisatie');

create or replace function public.meta_check_sync_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'meta_sync_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function public.meta_check_sync_secret(text) from public, anon, authenticated;
grant execute on function public.meta_check_sync_secret(text) to service_role;

select cron.schedule('meta-sync-nachtelijk', '30 2 * * *', $job$
  select net.http_post(
    url := 'https://saitgqruilgryftbxhtk.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meta_sync_secret')),
    body := '{"days":35}'::jsonb,
    timeout_milliseconds := 150000);
$job$);
