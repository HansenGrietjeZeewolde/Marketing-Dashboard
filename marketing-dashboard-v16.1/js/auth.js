/* ============================================================
   Authenticatie & sessie
   ------------------------------------------------------------
   Wikkelt Supabase Auth. Levert:
     - signIn / signOut / sendPasswordReset / updatePassword
     - getSession / requireSession (redirect naar login.html)
     - loadCurrentProfile (rol, is_active, gekoppelde vestigingen)
   ============================================================ */

import { getSupabase } from './supabase-client.js';

let _profileCache = null;

export async function signIn(email, password) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const sb = getSupabase();
  _profileCache = null;
  await sb.auth.signOut();
}

export async function sendPasswordReset(email) {
  const sb = getSupabase();
  const redirectTo = window.location.origin + basePath() + 'login.html?reset=1';
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const sb = getSupabase();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getSession() {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

/* Stuurt naar login.html als er geen (actieve) sessie is. Geeft de
   sessie terug wanneer die er wel is. */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.replace(basePath() + 'login.html');
    return null;
  }
  return session;
}

/* Haalt het profiel van de ingelogde gebruiker op, inclusief de
   vestigingen waaraan hij gekoppeld is. Gecached per pagina-load. */
export async function loadCurrentProfile(force = false) {
  if (_profileCache && !force) return _profileCache;
  const sb = getSupabase();
  const session = await getSession();
  if (!session) return null;

  const { data: profile, error } = await sb
    .from('profiles')
    .select('id,email,full_name,role,is_active')
    .eq('id', session.user.id)
    .single();

  if (error) throw error;

  // Gedeactiveerde accounts worden direct uitgelogd.
  if (!profile || profile.is_active === false) {
    await signOut();
    window.location.replace(basePath() + 'login.html?inactive=1');
    return null;
  }

  const { data: members, error: mErr } = await sb
    .from('company_members')
    .select('company_id')
    .eq('user_id', session.user.id);
  if (mErr) throw mErr;

  _profileCache = {
    ...profile,
    isAdmin: profile.role === 'admin',
    memberCompanyIds: (members || []).map((m) => m.company_id)
  };
  return _profileCache;
}

export function onAuthChange(cb) {
  const sb = getSupabase();
  return sb.auth.onAuthStateChange((event, session) => cb(event, session));
}

/* Basispad bepalen zodat redirects werken op zowel root-deploy (Vercel)
   als subpad-deploy (GitHub Pages: /Marketing-Dashboard/). */
export function basePath() {
  const p = window.location.pathname;
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(0, idx + 1) : '/';
}
