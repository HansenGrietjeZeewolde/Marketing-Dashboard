/* ============================================================
   app.js - hoofdorchestratie van het dashboard
   ------------------------------------------------------------
   Vervangt de oude localStorage-init. Flow:
     1. sessie vereisen (anders -> login.html)
     2. profiel + rol laden, rechten op de DOM toepassen
     3. vestigingen laden (Supabase), navigatie bouwen
     4. actieve vestiging -> posts/volgers/widgets uit Supabase in Store
     5. renderen + events koppelen

   localStorage wordt alleen gebruikt voor voorkeuren (laatste vestiging).
   ============================================================ */

import { requireSession, loadCurrentProfile, signOut, basePath } from './auth.js';
import { setProfile, isAdmin, applyPermissionsToDom, assertAdmin } from './permissions.js';
import { DashboardRepository } from './repository.js';
import { configReady } from './supabase-client.js';
import {
  Store, renderMetricCards, initMetricToggles, applyOvRange, setCustomOvRange,
  renderCharts, runCompare, renderCmpCharts, resetCompare, renderPostsTab,
  renderWidgets, setPostClickHandler, metricLabels, destroyAllCharts
} from './charts.js';
import {
  buildPdfImport, buildExcelImport, annotateDuplicates, commitImport
} from './imports.js';
import { fmtNum, fmtDuration, isReel, postTypeLabel } from './helpers.js';
import {
  readLocalData, alreadyMigrated, summarize, runMigration
} from './migration.js';

const PREF_KEY = 'marketingDashboardPrefs';

let COMPANIES = [];            // [{id,slug,name,accent_color}]
let companiesBySlug = {};
let activeCompanyId = null;
let currentProfile = null;
let pendingImport = null;      // payload voor de voorvertoning
let pendingImportFile = null;  // origineel bestand voor upload
let lastImportId = null;       // voor undo

/* ---- Voorkeuren (klein, mag lokaal) ---- */
function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; } }
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {} }

/* ============================================================
   INIT
   ============================================================ */
(async function init() {
  document.getElementById('buildStamp').textContent = 'Dashboard build: ' + (window.DASHBOARD_BUILD || 'supabase');

  if (!configReady()) {
    document.body.innerHTML =
      '<div style="max-width:560px;margin:80px auto;padding:24px;font-family:sans-serif">' +
      '<h2>Configuratie ontbreekt</h2><p>Vul eerst je Supabase-URL en anon-key in <code>js/config.js</code> in ' +
      '(of zet ze als omgevingsvariabelen via Vercel). Zie de README.</p></div>';
    return;
  }

  const session = await requireSession();
  if (!session) return;

  currentProfile = await loadCurrentProfile();
  if (!currentProfile) return;
  setProfile(currentProfile);
  applyPermissionsToDom();

  // Naam/rol tonen
  const who = document.getElementById('whoami');
  if (who) who.textContent = (currentProfile.full_name || currentProfile.email) + (isAdmin() ? ' · beheerder' : ' · alleen-lezen');

  // Vestigingen laden
  COMPANIES = await DashboardRepository.getCompanies();
  companiesBySlug = {};
  COMPANIES.forEach((c) => (companiesBySlug[c.slug] = c.id));
  if (COMPANIES.length === 0) {
    alert('Er zijn nog geen vestigingen. Voer seed.sql uit in Supabase.');
    return;
  }

  // Actieve vestiging bepalen: laatste voorkeur of eerste beschikbare
  const prefs = loadPrefs();
  activeCompanyId = COMPANIES.find((c) => c.id === prefs.lastCompanyId)?.id || COMPANIES[0].id;

  initMetricToggles();
  wireGlobalEvents();
  setPostClickHandler(openPostDetail);

  renderCompanyNav();
  await switchCompany(activeCompanyId);
  switchTab('overview');

  // Migratie aanbieden aan admins met lokale data
  maybeOfferMigration();
})();

/* ============================================================
   Vestiging wisselen -> data laden in Store
   ============================================================ */
async function switchCompany(companyId) {
  activeCompanyId = companyId;
  const company = COMPANIES.find((c) => c.id === companyId);
  Store.activeCompany = company;

  applyCompanyTheme(company);
  renderCompanyNav();

  const prefs = loadPrefs(); prefs.lastCompanyId = companyId; savePrefs(prefs);

  // Data ophalen (parallel)
  try {
    const [posts, followers, widgets] = await Promise.all([
      DashboardRepository.getPosts(companyId),
      DashboardRepository.getFollowerStats(companyId),
      DashboardRepository.getWidgets(companyId)
    ]);
    Store.posts = posts;
    Store.followerStats = followers;
    Store.widgets = widgets;
  } catch (e) {
    console.error(e);
    alert('Kon de data niet laden: ' + e.message);
    Store.posts = []; Store.followerStats = []; Store.widgets = [];
  }
  renderAll();
}

function applyCompanyTheme(company) {
  document.documentElement.style.setProperty('--accent', company.accent_color || '#2f5233');
  document.getElementById('companyTitle').textContent = company.name;
  document.getElementById('companyBadge').textContent = company.name;
}

function renderCompanyNav() {
  const bar = document.getElementById('companyBar');
  bar.innerHTML = COMPANIES.map((c) => '<button class="company-btn' + (c.id === activeCompanyId ? ' active' : '') + '" data-cid="' + c.id + '">' + c.name + '</button>').join('');
  const sel = document.getElementById('companySelect');
  sel.innerHTML = COMPANIES.map((c) => '<option value="' + c.id + '"' + (c.id === activeCompanyId ? ' selected' : '') + '>' + c.name + '</option>').join('');
  const up = document.getElementById('uploadCompany');
  if (up) up.innerHTML = COMPANIES.map((c) => '<option value="' + c.id + '"' + (c.id === activeCompanyId ? ' selected' : '') + '>' + c.name + '</option>').join('');
}

/* ============================================================
   Render-aggregaat
   ============================================================ */
function renderAll() {
  renderMetricCards();
  renderCharts();
  renderPostsTab(openPostDetail);
  renderManageList();
  renderWidgets(isAdmin(), deleteWidget);
  resetCompare();
  document.getElementById('aiPromptOut').value = '';
}

/* ============================================================
   Beheerlijsten (posts + volgers)
   ============================================================ */
function renderManageList() {
  const admin = isAdmin();
  const sorted = [...Store.posts].sort((a, b) => b.date.localeCompare(a.date));
  const mp = document.getElementById('managePostsList');
  if (mp) {
    mp.innerHTML = sorted.map((p) => '<div class="postrow"><span>' + p.date + ' - ' + p.platform + ' - ' + p.text.slice(0, 30) + '</span>' + (admin ? '<button class="delbtn" data-id="' + p.id + '">verwijderen</button>' : '') + '</div>').join('');
    if (admin) {
      mp.querySelectorAll('.delbtn').forEach((b) => b.addEventListener('click', async () => {
        if (!assertAdmin()) return;
        try { await DashboardRepository.deletePost(b.dataset.id); await switchCompany(activeCompanyId); }
        catch (e) { alert('Verwijderen mislukt: ' + e.message); }
      }));
    }
  }
  const fs = [...Store.followerStats].sort((a, b) => b.month.localeCompare(a.month));
  const fl = document.getElementById('followerList');
  fl.innerHTML = fs.map((f) => '<div class="postrow"><span>' + f.month + ' - FB: ' + fmtNum(f.fbTotal) + ' / +' + fmtNum(f.fbNew) + ' - IG: ' + fmtNum(f.igTotal) + ' / +' + fmtNum(f.igNew) + ' - doelgroep ' + (f.targetPct || 0) + '%</span>' + (admin ? '<button class="delbtn" data-id="' + f.id + '">verwijderen</button>' : '') + '</div>').join('');
  if (admin) {
    fl.querySelectorAll('.delbtn').forEach((b) => b.addEventListener('click', async () => {
      if (!assertAdmin()) return;
      try { await DashboardRepository.deleteFollowerStat(b.dataset.id); await switchCompany(activeCompanyId); }
      catch (e) { alert('Verwijderen mislukt: ' + e.message); }
    }));
  }
}

/* ============================================================
   Postdetail-modal
   ============================================================ */
function openPostDetail(id) {
  const p = Store.posts.find((x) => x.id === id); if (!p) return;
  document.getElementById('pmPlatform').textContent = p.platform + ' · ' + (isReel(p) ? '🎬 Reel' : 'Post');
  document.getElementById('pmDate').textContent = p.date + (p.time ? (' ' + p.time) : '');
  document.getElementById('pmText').textContent = p.text;
  const stats = [['Weergaven', fmtNum(p.views)], ['Bereik', fmtNum(p.reach)], ['Likes', fmtNum(p.likes)], ['Reacties', fmtNum(p.comments)], ['Nieuwe volgers', fmtNum(p.follows)], ['Doorgestuurd', fmtNum(p.shares)], ['Saves', fmtNum(p.saves)], ['Kijktijd', fmtDuration(p.watchDuration)], ['Engagement', fmtNum(p.engagement)]];
  document.getElementById('pmStats').innerHTML = stats.map((s) => '<div class="mc" style="padding:10px 12px"><p style="margin:0 0 2px;font-size:11px">' + s[0] + '</p><p style="margin:0;font-size:17px">' + s[1] + '</p></div>').join('');
  document.getElementById('postModalOverlay').style.display = 'flex';
}

/* ============================================================
   Tabs
   ============================================================ */
function switchTab(name) {
  document.querySelectorAll('.tabpane').forEach((p) => (p.style.display = 'none'));
  document.querySelectorAll('.tabbtn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('tab-' + name).style.display = 'block';
}

/* ============================================================
   Widgets: toevoegen / verwijderen
   ============================================================ */
async function addWidget() {
  if (!assertAdmin()) return;
  try {
    await DashboardRepository.createWidget(activeCompanyId, {
      metric: document.getElementById('wgMetric').value,
      groupBy: document.getElementById('wgGroup').value,
      chartType: document.getElementById('wgType').value,
      platformFilter: document.getElementById('wgPlatform').value
    });
    Store.widgets = await DashboardRepository.getWidgets(activeCompanyId);
    renderWidgets(isAdmin(), deleteWidget);
  } catch (e) { alert('Widget toevoegen mislukt: ' + e.message); }
}
async function deleteWidget(id) {
  if (!assertAdmin()) return;
  try {
    await DashboardRepository.deleteWidget(id);
    Store.widgets = await DashboardRepository.getWidgets(activeCompanyId);
    renderWidgets(isAdmin(), deleteWidget);
  } catch (e) { alert('Widget verwijderen mislukt: ' + e.message); }
}

/* ============================================================
   Volgers per maand toevoegen
   ============================================================ */
async function saveFollowerStat() {
  if (!assertAdmin()) return;
  const month = document.getElementById('fsMonth').value; if (!month) return;
  try {
    await DashboardRepository.upsertFollowerStats(activeCompanyId, {
      month,
      fbTotal: +document.getElementById('fsFbTotal').value || 0,
      fbNew: +document.getElementById('fsFbNew').value || 0,
      igTotal: +document.getElementById('fsIgTotal').value || 0,
      igNew: +document.getElementById('fsIgNew').value || 0,
      targetPct: +document.getElementById('fsTarget').value || 0
    });
    await switchCompany(activeCompanyId);
    ['fsMonth', 'fsFbTotal', 'fsFbNew', 'fsIgTotal', 'fsIgNew', 'fsTarget'].forEach((id) => (document.getElementById(id).value = ''));
  } catch (e) { alert('Opslaan mislukt: ' + e.message); }
}

/* ============================================================
   Import-voorvertoning
   ============================================================ */
function openPreview(payload, file) {
  pendingImport = payload;
  pendingImportFile = file || null;
  const { companyId, posts, diagnostics, meta } = payload;

  annotateDuplicates(payload).then((counts) => {
    const company = COMPANIES.find((c) => c.id === companyId);
    document.getElementById('previewSummary').innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px">' +
      '<div><span class="hint">Vestiging</span><br><b>' + company.name + '</b></div>' +
      '<div><span class="hint">Platform</span><br><b>' + (meta.platform || 'gemengd/auto') + '</b></div>' +
      '<div><span class="hint">Bestand</span><br><b>' + meta.fileName + '</b></div>' +
      '<div><span class="hint">Gevonden</span><br><b>' + posts.length + '</b></div>' +
      '<div><span class="hint">Geldig</span><br><b>' + counts.validCount + '</b></div>' +
      '<div><span class="hint">Waarschuwingen</span><br><b>' + counts.warnCount + '</b></div>' +
      '<div><span class="hint">Vermoedelijke duplicaten</span><br><b>' + counts.dupCount + '</b></div>' +
      '</div>';

    const cols = [['date', 'Datum'], ['time', 'Tijd'], ['platform', 'Platform'], ['postType', 'Type'], ['text', 'Caption'],
      ['comments', 'Reacties'], ['engagement', 'Engagement'], ['follows', 'Follows'], ['likes', 'Likes'], ['reach', 'Bereik'],
      ['watchDuration', 'Kijktijd'], ['saves', 'Saves'], ['shares', 'Shares'], ['views', 'Weergaven']];
    let html = '<tr>' + cols.map((c) => '<th>' + c[1] + '</th>').join('') + '<th>Status</th></tr>';
    posts.forEach((p) => {
      html += '<tr>' + cols.map(([k]) => {
        let v;
        if (k === 'watchDuration') v = p.watchDuration === null ? '—' : fmtDuration(p.watchDuration);
        else if (k === 'postType') v = p.postType === 'reel' ? '🎬 Reel' : 'Post';
        else if (k === 'text') v = (p.text || '').slice(0, 40) || '<span class="warn-cell">leeg</span>';
        else if (['reach', 'views', 'likes', 'comments', 'shares', 'saves', 'engagement', 'follows'].includes(k)) v = p[k] === null ? '—' : fmtNum(p[k]);
        else v = p[k] === null ? '—' : p[k];
        const bad = (k === 'date' && !p.date) || (k === 'text' && !p.text);
        return '<td' + (bad ? ' class="warn-cell"' : '') + '>' + v + '</td>';
      }).join('');
      let status = '<span class="pill pill-ok">ok</span>';
      if (p._dup) status = '<span class="pill pill-dup">duplicaat</span>';
      else if (p._warnings && p._warnings.length) status = '<span class="pill pill-warn">' + p._warnings[0] + '</span>';
      html += '<td>' + status + '</td></tr>';
    });
    document.getElementById('previewTable').innerHTML = html;

    const d = diagnostics || {};
    const colLines = Object.keys(d.headerCols || {}).map((k) => '  ' + k + ': x=' + Math.round(d.headerCols[k])).join('\n');
    document.getElementById('previewDiag').textContent =
      'Parserprofiel: ' + (d.profile || '-') + '\n' +
      'Ruwe tekstitems: ' + (d.rawItems || 0) + '\n' +
      'Gevormde regels: ' + (d.lines || 0) + '\n' +
      'Herkende records: ' + (d.records || 0) + '\n' +
      'Kolomkoppen + x-posities:\n' + (colLines || '  (n.v.t. — Excel-/tabelimport)') + '\n' +
      'Overgeslagen regels: ' + ((d.skipped || []).length) + '\n' +
      (d.skipped || []).map((s) => '  y=' + s.y + ': ' + s.reason).join('\n') +
      ((d.unmatchedCols && d.unmatchedCols.length) ? '\nNiet-gekoppelde kolommen: ' + d.unmatchedCols.join(', ') : '');

    document.getElementById('previewOverlay').style.display = 'flex';
  });
}
function closePreview() { document.getElementById('previewOverlay').style.display = 'none'; pendingImport = null; pendingImportFile = null; }

async function doCommitImport() {
  if (!pendingImport) return;
  if (!assertAdmin()) { closePreview(); return; }
  const cid = pendingImport.companyId;
  try {
    const res = await commitImport(pendingImport, pendingImportFile);
    lastImportId = res.importId;
    document.getElementById('undoLastImportBtn').disabled = false;
    closePreview();
    await switchCompany(cid);
    const company = COMPANIES.find((c) => c.id === cid);
    const status = res.added + ' posts geïmporteerd voor ' + company.name +
      (res.skippedDup ? (' (' + res.skippedDup + ' duplicaten overgeslagen)') : '') + '.';
    document.getElementById('pdfStatus').textContent = status;
    document.getElementById('xlsxStatus').textContent = status;
  } catch (e) {
    alert('Importeren mislukt: ' + e.message + '\n(Alleen beheerders mogen importeren.)');
  }
}

/* ============================================================
   Uploads (PDF / Excel)
   ============================================================ */
async function handlePdfUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  if (!assertAdmin()) { e.target.value = ''; return; }
  const companyId = document.getElementById('uploadCompany').value;
  const st = document.getElementById('pdfStatus'); st.textContent = 'Bezig met uitlezen...';
  try {
    const payload = await buildPdfImport(companyId, file);
    if (payload.error || payload.posts.length === 0) {
      st.textContent = payload.error || 'Geen posts herkend in dit PDF-bestand.';
      if (payload.diagnostics && (payload.diagnostics.rawItems || 0) > 0) openPreview({ ...payload, posts: [] }, null);
      e.target.value = ''; return;
    }
    openPreview(payload, file);
    st.textContent = 'Voorvertoning geopend — controleer en klik op Importeren.';
  } catch (err) { st.textContent = 'Kon de PDF niet uitlezen: ' + err.message; }
  e.target.value = '';
}
async function handleExcelUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  if (!assertAdmin()) { e.target.value = ''; return; }
  const companyId = document.getElementById('uploadCompany').value;
  try {
    const payload = await buildExcelImport(companyId, file);
    if (payload.error || payload.posts.length === 0) {
      document.getElementById('xlsxStatus').textContent = payload.error || 'Geen herkenbare tabel gevonden.';
      e.target.value = ''; return;
    }
    openPreview(payload, file);
    document.getElementById('xlsxStatus').textContent = 'Voorvertoning geopend — controleer en klik op Importeren.';
  } catch (err) { document.getElementById('xlsxStatus').textContent = 'Kon het bestand niet lezen: ' + err.message; }
  e.target.value = '';
}

/* ============================================================
   Undo / verwijderen
   ============================================================ */
async function undoLastImport() {
  if (!lastImportId) return;
  if (!assertAdmin()) return;
  try {
    const n = await DashboardRepository.revertImport(lastImportId);
    lastImportId = null;
    document.getElementById('undoLastImportBtn').disabled = true;
    await switchCompany(activeCompanyId);
    document.getElementById('undoStatus').textContent = n + ' posts van de laatste import verwijderd.';
  } catch (e) { alert('Terugdraaien mislukt: ' + e.message); }
}
function clearCompany() {
  if (!assertAdmin()) return;
  const company = COMPANIES.find((c) => c.id === activeCompanyId);
  showConfirm('Data verwijderen', 'Dit verwijdert ALLE posts en volgersdata van <b>' + company.name + '</b> uit de centrale database. Andere vestigingen blijven ongemoeid.', [
    {
      label: 'Verwijderen', danger: true, onClick: async () => {
        try {
          await DashboardRepository.deletePostsByCompany(activeCompanyId);
          await DashboardRepository.deleteFollowerStatsByCompany(activeCompanyId);
          await switchCompany(activeCompanyId);
          document.getElementById('undoStatus').textContent = 'Alle data van ' + company.name + ' is verwijderd.';
        } catch (e) { alert('Verwijderen mislukt: ' + e.message); }
      }
    },
    { label: 'Annuleren', secondary: true }
  ]);
}

/* ============================================================
   Back-up export / import (JSON) — vanuit de centrale database
   ============================================================ */
async function exportBackup() {
  try {
    const out = { schemaVersion: 3, source: 'supabase', build: window.DASHBOARD_BUILD, exportedAt: new Date().toISOString(), companies: {} };
    for (const c of COMPANIES) {
      const [posts, followers, widgets] = await Promise.all([
        DashboardRepository.getPosts(c.id),
        DashboardRepository.getFollowerStats(c.id),
        DashboardRepository.getWidgets(c.id)
      ]);
      out.companies[c.slug] = { name: c.name, posts, followerStats: followers, widgets };
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'marketing-dashboard-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(url);
  } catch (e) { alert('Export mislukt: ' + e.message); }
}

/* ============================================================
   Migratie localStorage -> Supabase
   ============================================================ */
function maybeOfferMigration() {
  if (!isAdmin()) return;
  if (alreadyMigrated()) return;
  const local = readLocalData();
  if (!local) return;
  const totals = summarize(local);
  const anything = Object.values(totals).some((t) => t.posts || t.followers || t.widgets);
  if (!anything) return;

  const rows = COMPANIES.map((c) => {
    const t = totals[c.slug] || { posts: 0, followers: 0, widgets: 0 };
    return '<tr><td>' + c.name + '</td><td>' + t.posts + '</td><td>' + t.followers + '</td><td>' + t.widgets + '</td></tr>';
  }).join('');
  const body = '<p class="hint" style="margin-bottom:8px">Er is lokale data (' + local.format + ') gevonden in deze browser. Wil je die eenmalig overzetten naar de centrale database? Je lokale data blijft bewaard.</p>' +
    '<table><tr><th>Vestiging</th><th>Posts</th><th>Volgers</th><th>Widgets</th></tr>' + rows + '</table>';
  showConfirm('Lokale data migreren', body, [
    {
      label: 'Nu migreren', onClick: async () => {
        try {
          const report = await runMigration(local, companiesBySlug, null);
          const lines = COMPANIES.map((c) => { const r = report[c.slug] || {}; return c.name + ': +' + (r.postsAdded || 0) + ' posts, ' + (r.followers || 0) + ' volgers, ' + (r.widgets || 0) + ' widgets'; }).join('<br>');
          await switchCompany(activeCompanyId);
          showConfirm('Migratie voltooid', lines + '<br><br><span class="hint">Je lokale data is niet verwijderd.</span>', [{ label: 'Prima', onClick: () => { } }]);
        } catch (e) { alert('Migratie mislukt: ' + e.message); }
      }
    },
    { label: 'Later', secondary: true }
  ]);
}

/* ============================================================
   AI-analyse-prompt
   ============================================================ */
function generateAiPrompt() {
  const company = COMPANIES.find((c) => c.id === activeCompanyId);
  const focus = document.getElementById('aiFocus').value;
  const now = new Date(); let start = new Date(now); let label = 'de afgelopen maand';
  if (focus === 'month') { start.setMonth(start.getMonth() - 1); label = 'de afgelopen maand'; }
  if (focus === '3months') { start.setMonth(start.getMonth() - 3); label = 'de afgelopen 3 maanden'; }
  if (focus === 'halfyear') { start.setMonth(start.getMonth() - 6); label = 'het afgelopen half jaar'; }
  if (focus === 'year') { start = new Date('2025-07-01'); label = 'het jaar sinds juli 2025'; }
  const s = start.toISOString().slice(0, 10), e = now.toISOString().slice(0, 10);
  const inR = Store.posts.filter((p) => p.date >= s && p.date <= e);
  const platforms = [...new Set(inR.map((p) => p.platform))];
  const t = inR.reduce((a, p) => ({ likes: a.likes + p.likes, comments: a.comments + p.comments, shares: a.shares + p.shares, follows: a.follows + (p.follows || 0), reach: a.reach + p.reach, views: a.views + p.views, engagement: a.engagement + p.engagement }), { likes: 0, comments: 0, shares: 0, reach: 0, views: 0, engagement: 0, follows: 0 });
  const sorted = [...inR].sort((a, b) => b.engagement - a.engagement);
  const fmtP = (p) => p.date + ' (' + p.platform + ', ' + postTypeLabel(p) + '): "' + p.text + '" - engagement ' + fmtNum(p.engagement) + ', likes ' + fmtNum(p.likes) + ', reacties ' + fmtNum(p.comments) + ', doorsturen ' + fmtNum(p.shares) + ', bereik ' + fmtNum(p.reach) + ', weergaven ' + fmtNum(p.views);
  const best = sorted.slice(0, 3).map(fmtP), worst = sorted.slice(-3).reverse().map(fmtP);
  const missing = [];
  if (!inR.some((p) => p.reach > 0)) missing.push('bereik ontbreekt of is 0');
  if (!Store.followerStats.some((f) => f.igTotal || f.fbTotal)) missing.push('volgersaantallen niet ingevuld');
  const prompt =
    'Vestiging: ' + company.name + '\n' +
    'Analyseperiode: ' + label + ' (' + s + ' t/m ' + e + ')\n' +
    'Beschikbare platformen: ' + (platforms.join(', ') || 'geen') + '\n' +
    'Aantal geanalyseerde posts: ' + inR.length + '\n' +
    (missing.length ? ('Ontbrekende gegevens: ' + missing.join('; ') + '\n') : '') +
    '\nAnalyseer onze social media resultaten voor deze vestiging over bovenstaande periode.\n\n' +
    'Totalen: ' + inR.length + ' posts, ' + fmtNum(t.engagement) + ' engagement, ' + fmtNum(t.likes) + ' likes, ' + fmtNum(t.comments) + ' reacties, ' + fmtNum(t.shares) + ' keer doorgestuurd, ' + fmtNum(t.reach) + ' bereik, ' + fmtNum(t.views) + ' weergaven.\n\n' +
    'Best presterende posts:\n- ' + (best.join('\n- ') || 'geen data') + '\n\n' +
    'Slechtst presterende posts:\n- ' + (worst.join('\n- ') || 'geen data') + '\n\n' +
    'Wil je: 1) opvallende pieken of dalen benoemen met een mogelijke verklaring (evenementen, acties, seizoen), 2) concrete learnings geven over wat wel en niet werkt, en 3) 2-3 concrete aanbevelingen voor volgende maand.';
  document.getElementById('aiPromptOut').value = prompt;
}

/* ============================================================
   Bevestigingsmodal
   ============================================================ */
function showConfirm(title, bodyHtml, buttons) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').innerHTML = bodyHtml;
  const box = document.getElementById('confirmBtns'); box.innerHTML = '';
  buttons.forEach((b) => {
    const btn = document.createElement('button'); btn.textContent = b.label;
    if (b.secondary) btn.className = 'secondary';
    if (b.danger) { btn.style.background = 'var(--red)'; btn.style.borderColor = 'var(--red)'; btn.style.color = '#fff'; }
    btn.addEventListener('click', () => { document.getElementById('confirmOverlay').style.display = 'none'; b.onClick && b.onClick(); });
    box.appendChild(btn);
  });
  document.getElementById('confirmOverlay').style.display = 'flex';
}

/* ============================================================
   Events koppelen (één keer)
   ============================================================ */
function wireGlobalEvents() {
  document.getElementById('tabbar').addEventListener('click', (e) => { const b = e.target.closest('.tabbtn'); if (b) switchTab(b.dataset.tab); });
  document.getElementById('companyBar').addEventListener('click', (e) => { const b = e.target.closest('.company-btn'); if (b) switchCompany(b.dataset.cid); });
  document.getElementById('companySelect').addEventListener('change', (e) => switchCompany(e.target.value));

  document.getElementById('ovSort').addEventListener('change', renderCharts);
  document.getElementById('ovRangeBtns').addEventListener('click', (e) => { const b = e.target.closest('.ov-range-btn'); if (b) applyOvRange(b.dataset.range); });
  document.getElementById('ovApplyCustom').addEventListener('click', () => {
    const s = document.getElementById('ovStart').value, e = document.getElementById('ovEnd').value; if (!s || !e) return;
    document.querySelectorAll('.ov-range-btn[data-range]').forEach((b) => b.classList.remove('active'));
    setCustomOvRange(s, e);
  });

  document.getElementById('postsPlatformFilter').addEventListener('change', () => renderPostsTab(openPostDetail));
  document.getElementById('postsTypeFilter').addEventListener('change', () => renderPostsTab(openPostDetail));
  document.getElementById('postsMetric').addEventListener('change', () => renderPostsTab(openPostDetail));

  document.getElementById('cmpBtn').addEventListener('click', runCompare);
  document.getElementById('cmpViewBtns').addEventListener('click', (e) => {
    const b = e.target.closest('.ov-range-btn'); if (!b) return;
    document.querySelectorAll('#cmpViewBtns .ov-range-btn').forEach((x) => x.classList.remove('active')); b.classList.add('active');
    if (b.dataset.view === 'table') { document.getElementById('cmpResult').style.display = 'block'; document.getElementById('cmpChartResult').style.display = 'none'; }
    else { document.getElementById('cmpResult').style.display = 'none'; document.getElementById('cmpChartResult').style.display = 'block'; renderCmpCharts(); }
  });

  document.getElementById('addWidgetBtn').addEventListener('click', addWidget);
  document.getElementById('addFollowerBtn').addEventListener('click', saveFollowerStat);

  // Modals
  document.getElementById('pmClose').addEventListener('click', () => { document.getElementById('postModalOverlay').style.display = 'none'; });
  document.getElementById('postModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'postModalOverlay') document.getElementById('postModalOverlay').style.display = 'none'; });
  document.getElementById('previewClose').addEventListener('click', closePreview);
  document.getElementById('previewCancel').addEventListener('click', closePreview);
  document.getElementById('previewOverlay').addEventListener('click', (e) => { if (e.target.id === 'previewOverlay') closePreview(); });
  document.getElementById('previewCommit').addEventListener('click', doCommitImport);
  document.getElementById('previewDownloadLog').addEventListener('click', () => {
    if (!pendingImport) return;
    const blob = new Blob([JSON.stringify({ meta: pendingImport.meta, diagnostics: pendingImport.diagnostics, posts: pendingImport.posts }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'import-foutlog-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('confirmX').addEventListener('click', () => { document.getElementById('confirmOverlay').style.display = 'none'; });
  document.getElementById('confirmOverlay').addEventListener('click', (e) => { if (e.target.id === 'confirmOverlay') document.getElementById('confirmOverlay').style.display = 'none'; });

  // Uploads
  document.getElementById('pdfUpload').addEventListener('change', handlePdfUpload);
  document.getElementById('xlsxUpload').addEventListener('change', handleExcelUpload);

  // Beheer
  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('undoLastImportBtn').addEventListener('click', undoLastImport);
  document.getElementById('clearCompanyBtn').addEventListener('click', clearCompany);

  // AI
  document.getElementById('aiGenBtn').addEventListener('click', generateAiPrompt);
  document.getElementById('aiCopyBtn').addEventListener('click', () => {
    const ta = document.getElementById('aiPromptOut'); ta.select();
    navigator.clipboard.writeText(ta.value).then(() => { document.getElementById('aiCopyBtn').textContent = 'Gekopieerd!'; setTimeout(() => { document.getElementById('aiCopyBtn').textContent = 'Kopieer naar klembord'; }, 1500); });
  });

  // Uitloggen + gebruikersbeheer-link
  const logout = document.getElementById('logoutBtn');
  if (logout) logout.addEventListener('click', async () => { await signOut(); window.location.replace(basePath() + 'login.html'); });
}
