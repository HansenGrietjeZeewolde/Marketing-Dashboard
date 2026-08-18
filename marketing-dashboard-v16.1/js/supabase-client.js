/* ============================================================
   Supabase-client (singleton)
   ------------------------------------------------------------
   Laadt de supabase-js v2 UMD-bundel vanaf de CDN en maakt één
   gedeelde client aan met de publieke anon-key.

   Gebruik overal: import { getSupabase } from './supabase-client.js'
   ============================================================ */

let _client = null;

export function getSupabase() {
  if (_client) return _client;

  const cfg = window.APP_CONFIG;
  if (!cfg || !window.supabase || !window.supabase.createClient) {
    throw new Error(
      'Supabase is niet geladen. Controleer of de supabase-js CDN-tag in de HTML staat en of config.js is ingevuld.'
    );
  }

  _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return _client;
}

export function configReady() {
  return !!window.APP_CONFIG_READY;
}
