/* ============================================================
   Gebruikersbeheer (alleen admins)
   ------------------------------------------------------------
   De frontend gebruikt NOOIT de service-role key. Alle acties die
   verhoogde rechten nodig hebben (uitnodigen, rol wijzigen,
   activeren/deactiveren) gaan via de serverless functie /api/users,
   die het access-token van de admin verifieert en server-side de
   service-role key gebruikt.

   Vestiging-koppelingen (company_members) gaan wél rechtstreeks via
   de Supabase-client, want RLS staat dat alleen admins toe.
   ============================================================ */

import { getSupabase } from './supabase-client.js';
import { basePath } from './auth.js';

async function authHeader() {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Geen sessie.');
  return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
}

function apiUrl() {
  // /api/users draait op dezelfde host (Vercel). Op GitHub Pages bestaat
  // deze functie niet; gebruikersbeheer werkt dan niet (zie README).
  return basePath().replace(/\/[^/]*$/, '/') + 'api/users';
}

export const UsersAdmin = {
  async list() {
    const res = await fetch(apiUrl(), { method: 'GET', headers: await authHeader() });
    if (!res.ok) throw new Error(await errText(res));
    return res.json();
  },
  async invite(email, fullName, role) {
    const res = await fetch(apiUrl(), {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ action: 'invite', email, full_name: fullName, role })
    });
    if (!res.ok) throw new Error(await errText(res));
    return res.json();
  },
  async setRole(userId, role) {
    const res = await fetch(apiUrl(), {
      method: 'POST', headers: await authHeader(),
      body: JSON.stringify({ action: 'set_role', user_id: userId, role })
    });
    if (!res.ok) throw new Error(await errText(res));
    return res.json();
  },
  async setActive(userId, isActive) {
    const res = await fetch(apiUrl(), {
      method: 'POST', headers: await authHeader(),
      body: JSON.stringify({ action: 'set_active', user_id: userId, is_active: isActive })
    });
    if (!res.ok) throw new Error(await errText(res));
    return res.json();
  },

  /* Vestiging-koppelingen (direct via RLS, admin-only). */
  async getMemberships(userId) {
    const sb = getSupabase();
    const { data, error } = await sb.from('company_members').select('company_id').eq('user_id', userId);
    if (error) throw error;
    return (data || []).map((r) => r.company_id);
  },
  async addMembership(userId, companyId) {
    const sb = getSupabase();
    const { error } = await sb.from('company_members').insert({ user_id: userId, company_id: companyId });
    if (error) throw error;
  },
  async removeMembership(userId, companyId) {
    const sb = getSupabase();
    const { error } = await sb.from('company_members').delete().eq('user_id', userId).eq('company_id', companyId);
    if (error) throw error;
  }
};

async function errText(res) {
  try { const j = await res.json(); return j.error || ('HTTP ' + res.status); }
  catch (e) { return 'HTTP ' + res.status; }
}
