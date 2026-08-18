/* ============================================================
   Serverless functie: /api/users  (Vercel Node.js runtime)
   ------------------------------------------------------------
   Beheert gebruikers met de SERVICE-ROLE key. Deze functie draait
   ALLEEN server-side; de service-role key staat als omgevingsvariabele
   (SUPABASE_SERVICE_ROLE_KEY) en komt nooit in de browser.

   Elk verzoek:
     1. leest het Bearer-token (de sessie van de aanroeper);
     2. verifieert wie dat is via de Auth-API;
     3. controleert server-side in de database dat die gebruiker
        role='admin' EN is_active=true heeft;
     4. voert pas daarna de actie uit.

   Een viewer die dit endpoint rechtstreeks aanroept, wordt in stap 3
   geweigerd — ongeacht wat de frontend doet.

   Acties (POST body.action):
     - invite    { email, full_name, role }
     - set_role  { user_id, role }
     - set_active{ user_id, is_active }
   GET zonder body: lijst van alle gebruikers.
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function requireAdmin(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw httpError(401, 'Geen token.');

  const sb = admin();
  // Wie is dit? (verifieert het token bij de Auth-server)
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) throw httpError(401, 'Ongeldige sessie.');
  const uid = userData.user.id;

  // Server-side rolcheck in de database.
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('role,is_active')
    .eq('id', uid)
    .single();
  if (pErr || !profile) throw httpError(403, 'Geen profiel.');
  if (profile.role !== 'admin' || profile.is_active !== true) {
    throw httpError(403, 'Alleen beheerders mogen gebruikers beheren.');
  }
  return { uid, sb };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return send(res, 500, { error: 'Server niet geconfigureerd (SUPABASE_URL / SERVICE_ROLE ontbreekt).' });
    }
    const { uid, sb } = await requireAdmin(req);

    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('profiles')
        .select('id,email,full_name,role,is_active,created_at')
        .order('created_at', { ascending: true });
      if (error) throw httpError(500, error.message);
      return send(res, 200, data);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const action = body.action;

      if (action === 'invite') {
        if (!body.email) throw httpError(400, 'E-mailadres vereist.');
        const role = body.role === 'admin' ? 'admin' : 'viewer';
        // Uitnodigen via e-mail; metadata bepaalt naam/rol en zet actief.
        const redirectTo = originFrom(req) + '/login.html';
        const { data, error } = await sb.auth.admin.inviteUserByEmail(body.email, {
          data: { full_name: body.full_name || '', role, is_active: true },
          redirectTo
        });
        if (error) throw httpError(400, error.message);
        // Zorg dat het profiel de juiste rol/actief-status heeft (de trigger
        // maakt het profiel; hier forceren we naam/rol/actief).
        if (data?.user?.id) {
          await sb.from('profiles').upsert({
            id: data.user.id, email: body.email,
            full_name: body.full_name || '', role, is_active: true
          }, { onConflict: 'id' });
        }
        return send(res, 200, { ok: true, user_id: data?.user?.id || null });
      }

      if (action === 'set_role') {
        if (!body.user_id) throw httpError(400, 'user_id vereist.');
        const role = body.role === 'admin' ? 'admin' : 'viewer';
        if (body.user_id === uid && role !== 'admin') {
          throw httpError(400, 'Je kunt je eigen beheerdersrol niet intrekken.');
        }
        const { error } = await sb.from('profiles').update({ role }).eq('id', body.user_id);
        if (error) throw httpError(500, error.message);
        return send(res, 200, { ok: true });
      }

      if (action === 'set_active') {
        if (!body.user_id) throw httpError(400, 'user_id vereist.');
        if (body.user_id === uid && body.is_active === false) {
          throw httpError(400, 'Je kunt je eigen account niet deactiveren.');
        }
        const { error } = await sb.from('profiles')
          .update({ is_active: !!body.is_active })
          .eq('id', body.user_id);
        if (error) throw httpError(500, error.message);
        return send(res, 200, { ok: true });
      }

      throw httpError(400, 'Onbekende actie.');
    }

    return send(res, 405, { error: 'Methode niet toegestaan.' });
  } catch (e) {
    const status = e.status || 500;
    return send(res, status, { error: e.message || 'Serverfout.' });
  }
};

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function send(res, status, payload) { res.statusCode = status; res.end(JSON.stringify(payload)); }
function originFrom(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host;
}
async function readBody(req) {
  if (req.body) { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(httpError(400, 'Ongeldige JSON.')); } });
    req.on('error', reject);
  });
}
