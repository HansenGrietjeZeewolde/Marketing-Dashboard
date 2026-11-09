// =====================================================================
// Verbinding met Supabase zonder extra bibliotheek: inloggen (Auth),
// gegevens lezen/schrijven (REST) en Edge Functions aanroepen.
// =====================================================================
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const STORE = 'hg.session';
let session = load();

function load() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}
function save(s) {
  session = s;
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch { /* privémodus */ }
}
function fromAuthResponse(body) {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: body.expires_at || Math.floor(Date.now() / 1000) + (body.expires_in || 3600),
    user: body.user
  };
}

async function authFetch(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.msg || body.error_description || body.message || 'Inloggen mislukt');
  return body;
}

export const auth = {
  get user() { return session?.user || null; },

  async signIn(email, password) {
    save(fromAuthResponse(await authFetch('token?grant_type=password', { email, password })));
    return session.user;
  },

  async resetPassword(email) {
    const redirect = location.origin + location.pathname;
    await authFetch(`recover?redirect_to=${encodeURIComponent(redirect)}`, { email });
  },

  async setPassword(password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.msg || body.message || 'Wachtwoord opslaan mislukt');
  },

  // Supabase stuurt na "wachtwoord vergeten" of een uitnodiging terug met
  // #access_token=…&refresh_token=…&type=recovery in de URL.
  takeSessionFromUrl() {
    if (!location.hash.includes('access_token=')) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    save({
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token'),
      expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600),
      user: null
    });
    history.replaceState(null, '', location.pathname);
    return p.get('type');
  },

  async loadUser() {
    if (!session) return null;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await token()}` }
    });
    if (!res.ok) { save(null); return null; }
    session.user = await res.json();
    save(session);
    return session.user;
  },

  async signOut() {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token}` }
      });
    } catch { /* toch uitloggen */ }
    save(null);
  }
};

async function token() {
  if (!session) throw new Error('Niet ingelogd');
  if (session.expires_at - 60 < Date.now() / 1000) {
    try {
      save({ ...fromAuthResponse(await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token })), user: session.user });
    } catch (e) {
      save(null);
      throw new Error('Je sessie is verlopen. Log opnieuw in.');
    }
  }
  return session.access_token;
}

async function call(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || body?.error || `Fout ${res.status}`);
  return body;
}

// db.select('post_stats', { select: '*', order: 'published_at.desc' })
export const db = {
  select(table, params = {}) {
    const q = new URLSearchParams(params);
    return call(`${SUPABASE_URL}/rest/v1/${table}?${q}`);
  },
  insert(table, row) {
    return call(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
    });
  },
  update(table, filter, values) {
    return call(`${SUPABASE_URL}/rest/v1/${table}?${new URLSearchParams(filter)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(values)
    });
  },
  remove(table, filter) {
    return call(`${SUPABASE_URL}/rest/v1/${table}?${new URLSearchParams(filter)}`, { method: 'DELETE' });
  }
};

export function invoke(fn, payload) {
  return call(`${SUPABASE_URL}/functions/v1/${fn}`, { method: 'POST', body: JSON.stringify(payload || {}) });
}
