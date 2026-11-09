// =====================================================================
// Hoofdprogramma: inloggen, gegevens laden, schermen tonen, knoppen.
// Adressen:  #/overzicht/alle?m=2026-07&p=samen   #/analyse/hg   #/beheer
// =====================================================================
import { auth, db, invoke } from './api.js';
import { availableMonths, prevMonth, nextMonth } from './data.js';
import { header, filters } from './ui.js';
import { renderLogin } from './views/login.js';
import { renderOverzicht } from './views/overzicht.js';
import { renderAnalyse } from './views/analyse.js';
import { renderBeheer } from './views/beheer.js';

const app = document.getElementById('app');
let profile = null;
let data = null;

// ---------------- gegevens ----------------
async function loadData() {
  const isAdmin = profile.role === 'admin';
  const [posts, accountMonthly, summaries, events, members, audience, accounts] = await Promise.all([
    db.select('post_stats', {
      select: 'id,location_id,platform,published_local,media_type,caption,permalink,thumbnail_url,views,reach,likes,comments,shares,saves,follows,interactions,watch_time_avg_sec',
      order: 'published_local.desc', limit: '10000'
    }),
    db.select('account_monthly', { select: '*' }),
    db.select('ai_summaries', { select: 'month,location_key,screen,bullets,created_at' }),
    db.select('events', { select: 'id,location_id,starts_on,ends_on,title', order: 'starts_on' }),
    db.select('location_members', { select: 'user_id,location_id' }),
    db.select('audience', { select: 'location_id,captured_on,kind,dimension,value,count', order: 'captured_on.desc', limit: '2000' }),
    db.select('social_accounts', { select: 'id,location_id,platform,handle,connected,last_synced_at' })
  ]);
  const allowed = isAdmin ? ['hg', 'kbb', 'hbvp', 'bb'] : members.filter((m) => m.user_id === profile.id).map((m) => m.location_id);
  data = { posts, accountMonthly, summaries, events, members, audience, accounts, allowed, profiles: [], syncRuns: [] };
  if (isAdmin) {
    [data.profiles, data.syncRuns] = await Promise.all([
      db.select('profiles', { select: 'id,email,role', order: 'email' }),
      db.select('sync_runs', { select: '*', order: 'started_at.desc', limit: '10' })
    ]);
  }
}

// ---------------- routering ----------------
function parseRoute() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [view = 'overzicht', place = 'alle'] = path.split('/');
  return { view, place, query: new URLSearchParams(qs || '') };
}

function render() {
  if (!profile) return;
  const { view: rawView, place, query } = parseRoute();
  // Bladeren kan van 12 maanden terug (of de eerste maand met data) tot en met
  // de huidige maand, ook als er voor een maand nog niets binnen is.
  const withData = availableMonths(data.posts);
  const thisMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  let first = thisMonth;
  for (let i = 0; i < 11; i++) first = prevMonth(first);
  if (withData[0] && withData[0] < first) first = withData[0];
  const months = [];
  for (let m = first; m <= thisMonth; m = nextMonth(m)) months.push(m);
  const latest = withData[withData.length - 1] || thisMonth;
  const state = {
    month: months.includes(query.get('m')) ? query.get('m') : latest,
    platform: ['samen', 'facebook', 'instagram'].includes(query.get('p')) ? query.get('p') : 'samen'
  };
  let view = ['overzicht', 'analyse', 'beheer'].includes(rawView) ? rawView : 'overzicht';
  if (view === 'analyse' && profile.role === 'management') view = 'overzicht';
  if (view === 'beheer' && profile.role !== 'admin') view = 'overzicht';

  let locationId = ['alle', ...data.allowed].includes(place) ? place : (data.allowed.length > 1 ? 'alle' : data.allowed[0]);
  if (!locationId) {
    app.innerHTML = `<div class="wrap">${header({ view, location: 'alle', state, profile })}
      <p class="empty">Je account heeft nog geen toegang tot een locatie. Vraag een beheerder om je toegang te geven.</p></div>`;
    return;
  }
  if (locationId === 'alle' && data.allowed.length === 1) locationId = data.allowed[0];

  const ctx = { data, location: locationId, state, profile, query };
  const body = view === 'beheer' ? renderBeheer(ctx) : view === 'analyse' ? renderAnalyse(ctx) : renderOverzicht(ctx);
  app.innerHTML = `<div class="wrap">
    ${header({ view, location: locationId, state, profile })}
    ${view === 'beheer' ? '' : filters({ view, location: locationId, state, months, allowed: data.allowed })}
    <main id="main" style="display:flex;flex-direction:column;gap:28px">${body}</main>
    <footer>Bron: Meta (Facebook en Instagram). Bereik is per post opgeteld; cijfers lopen tot 48 uur achter. Tijden in Nederlandse tijd.</footer>
  </div>`;
  document.title = `${view === 'analyse' ? 'Analyse' : view === 'beheer' ? 'Beheer' : 'Overzicht'} · H&G marketingdashboard`;
  app.dataset.view = view;
  app.dataset.location = locationId;
  app.dataset.month = state.month;
}

// ---------------- inloggen ----------------
function showLogin(mode = 'login', message = '') {
  profile = null;
  app.innerHTML = renderLogin(mode, message);
  document.title = 'Inloggen · H&G marketingdashboard';
}

async function start() {
  const type = auth.takeSessionFromUrl();
  if (type === 'recovery' || type === 'invite') return showLogin('reset');
  const user = await auth.loadUser();
  if (!user) return showLogin();
  app.innerHTML = '<p class="loading">Gegevens laden…</p>';
  try {
    const rows = await db.select('profiles', { select: 'id,email,role', id: `eq.${user.id}` });
    profile = rows[0];
    if (!profile) throw new Error('Geen profiel gevonden voor dit account.');
    await loadData();
    render();
  } catch (e) {
    showLogin('login', '!' + e.message);
  }
}

// ---------------- knoppen en formulieren ----------------
app.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const msg = form.parentElement.querySelector('.form-msg') || form.querySelector('.form-msg');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    if (form.dataset.form === 'login') { await auth.signIn(f.email, f.password); await start(); return; }
    if (form.dataset.form === 'forgot') { await auth.resetPassword(f.email); showLogin('login', 'Als dit adres bekend is, staat er een mail met een link in je inbox.'); return; }
    if (form.dataset.form === 'reset') { await auth.setPassword(f.password); await start(); return; }
    if (form.dataset.form === 'event') {
      await db.insert('events', { title: f.title.trim(), starts_on: f.starts_on, ends_on: f.ends_on || null, location_id: f.location_id || null });
      data.events = await db.select('events', { select: 'id,location_id,starts_on,ends_on,title', order: 'starts_on' });
      render();
      return;
    }
  } catch (err) {
    if (msg) { msg.textContent = err.message; msg.className = (msg.className.replace(/\b(ok|error)\b/g, '') + ' error').trim(); }
  } finally {
    button.disabled = false;
  }
});

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return;
  const action = el.dataset.action;
  if (action === 'to-forgot') return showLogin('forgot');
  if (action === 'to-login') return showLogin('login');
  if (action === 'logout') { await auth.signOut(); return showLogin(); }

  if (action === 'copy') {
    const list = document.getElementById(el.dataset.target);
    if (!list) return;
    const text = [...list.querySelectorAll('li')].map((li) => '• ' + li.textContent.trim()).join('\n');
    try { await navigator.clipboard.writeText(text); el.textContent = 'Gekopieerd'; }
    catch { el.textContent = 'Kopiëren lukte niet'; }
    setTimeout(() => { el.textContent = 'Kopieer voor presentatie'; }, 2000);
    return;
  }

  if (action === 'ai') {
    const status = el.closest('section').querySelector('.ai-status');
    el.disabled = true; status.textContent = 'AI maakt een samenvatting…';
    try {
      await invoke('ai-summary', { month: app.dataset.month + '-01', location: app.dataset.location, screen: app.dataset.view });
      data.summaries = await db.select('ai_summaries', { select: 'month,location_key,screen,bullets,created_at' });
      render();
    } catch (err) { status.textContent = err.message; el.disabled = false; }
    return;
  }

  if (action === 'del-event') {
    if (!el.dataset.confirm) { el.dataset.confirm = '1'; el.textContent = 'Zeker weten?'; return; }
    try {
      await db.remove('events', { id: `eq.${el.dataset.id}` });
      data.events = data.events.filter((x) => x.id !== el.dataset.id);
      render();
    } catch (err) { el.textContent = err.message; }
    return;
  }

  if (action === 'meta-connect') {
    el.disabled = true;
    try { const { url } = await invoke('meta-connect', { action: 'start' }); location.href = url; }
    catch (err) { document.querySelector('.sync-msg').textContent = err.message; el.disabled = false; }
    return;
  }

  if (action === 'meta-sync') {
    const status = document.querySelector('.sync-msg');
    el.disabled = true; status.textContent = 'Bezig met ophalen bij Meta… (dit kan een minuut duren)';
    try {
      const res = await invoke('meta-sync', { days: 90 });
      status.textContent = `Klaar: ${res.accounts} accounts, resultaat ${res.status}.`;
      await loadData(); render();
    } catch (err) { status.textContent = err.message; el.disabled = false; }
  }
});

app.addEventListener('change', async (e) => {
  const el = e.target;
  const status = document.querySelector('.user-msg');
  try {
    if (el.dataset.action === 'role') {
      await db.update('profiles', { id: `eq.${el.dataset.id}` }, { role: el.value });
      status.textContent = 'Rol opgeslagen.';
    }
    if (el.dataset.action === 'member') {
      if (el.checked) await db.insert('location_members', { user_id: el.dataset.id, location_id: el.dataset.loc });
      else await db.remove('location_members', { user_id: `eq.${el.dataset.id}`, location_id: `eq.${el.dataset.loc}` });
      status.textContent = 'Toegang opgeslagen.';
    }
  } catch (err) {
    if (status) status.textContent = err.message;
  }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
start();
