/* ============================================================
   Eenmalige migratie localStorage -> Supabase (alleen admins)
   ------------------------------------------------------------
   Herkent oude v13/v15-data (STATE_KEY_V2 en de legacy-sleutel),
   toont aantallen per vestiging, en uploadt na bevestiging naar
   Supabase. Dedupliceert op dezelfde sleutel als de imports.
   Lokale data wordt NIET automatisch verwijderd. Dubbele migratie
   wordt voorkomen via een vlag in localStorage.
   ============================================================ */

import { DashboardRepository } from './repository.js';
import { dedupKey } from './helpers.js';
import { normalizeText } from './parse-primitives.js';

const STATE_KEY_V2 = 'marketingDashboardStateV2';
const LEGACY_KEY = 'hg-marketing-dashboard';
const MIGRATION_FLAG = 'marketingDashboardMigratedToSupabase';

const SLUG_ORDER = ['hans-grietje', 'de-betovering', 'heksenblotevoetenpad', 'grote-kabouterbos'];

/* Leest de oude localStorage-state (indien aanwezig) en normaliseert
   naar { slug: { posts:[], followerStats:[], widgets:[] } }. */
export function readLocalData() {
  let raw = null;
  try { raw = localStorage.getItem(STATE_KEY_V2); } catch (e) {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.companies) {
        const out = {};
        SLUG_ORDER.forEach((slug) => {
          const c = parsed.companies[slug] || {};
          out[slug] = {
            posts: c.posts || [],
            followerStats: c.followerStats || [],
            widgets: c.widgets || []
          };
        });
        return { format: 'v2', data: out };
      }
    } catch (e) {}
  }
  // legacy: alles onder hans-grietje
  try { raw = localStorage.getItem(LEGACY_KEY); } catch (e) {}
  if (raw) {
    try {
      const legacy = JSON.parse(raw);
      const out = {};
      SLUG_ORDER.forEach((slug) => (out[slug] = { posts: [], followerStats: [], widgets: [] }));
      out['hans-grietje'] = {
        posts: legacy.posts || [],
        followerStats: legacy.followerStats || [],
        widgets: legacy.widgets || []
      };
      return { format: 'legacy', data: out };
    } catch (e) {}
  }
  return null;
}

export function alreadyMigrated() {
  try { return localStorage.getItem(MIGRATION_FLAG) === '1'; } catch (e) { return false; }
}

/* Telt per vestiging wat er te migreren valt. */
export function summarize(local) {
  const out = {};
  SLUG_ORDER.forEach((slug) => {
    const c = local.data[slug];
    out[slug] = {
      posts: c.posts.length,
      followers: c.followerStats.length,
      widgets: c.widgets.length
    };
  });
  return out;
}

/* Voert de migratie uit. companiesBySlug map: slug -> company.id (uuid).
   Rapporteert per vestiging hoeveel is toegevoegd/overgeslagen. */
export async function runMigration(local, companiesBySlug, onProgress) {
  const report = {};
  for (const slug of SLUG_ORDER) {
    const companyId = companiesBySlug[slug];
    if (!companyId) { report[slug] = { error: 'vestiging niet gevonden' }; continue; }
    const c = local.data[slug];

    // Posts: normaliseer + dedup-sleutel, filter bestaande weg.
    const existing = await DashboardRepository.existingDedupKeys(companyId);
    const seen = new Set();
    const toInsert = [];
    c.posts.forEach((raw) => {
      const p = normalizeLocalPost(raw);
      p.dedupKey = dedupKey(companyId, p);
      if (existing.has(p.dedupKey) || seen.has(p.dedupKey)) return;
      seen.add(p.dedupKey);
      toInsert.push(p);
    });
    let insertedPosts = [];
    if (toInsert.length) {
      insertedPosts = await DashboardRepository.createPosts(companyId, toInsert, null);
    }

    // Volgers per maand.
    let insertedFollowers = 0;
    for (const f of c.followerStats) {
      try {
        await DashboardRepository.upsertFollowerStats(companyId, {
          month: f.month,
          fbTotal: numOrNull(f.fbTotal), fbNew: numOrNull(f.fbNew),
          igTotal: numOrNull(f.igTotal), igNew: numOrNull(f.igNew),
          targetPct: numOrNull(f.targetPct)
        });
        insertedFollowers++;
      } catch (e) { /* bestaat al */ }
    }

    // Widgets.
    let insertedWidgets = 0;
    for (const w of c.widgets) {
      try {
        await DashboardRepository.createWidget(companyId, {
          metric: w.metric, platformFilter: w.platformFilter || 'all',
          groupBy: w.groupBy || 'platform', chartType: w.chartType || 'bar'
        });
        insertedWidgets++;
      } catch (e) {}
    }

    report[slug] = {
      postsAdded: insertedPosts.length,
      postsSkipped: c.posts.length - insertedPosts.length,
      followers: insertedFollowers,
      widgets: insertedWidgets
    };
    if (onProgress) onProgress(slug, report[slug]);
  }

  try { localStorage.setItem(MIGRATION_FLAG, '1'); } catch (e) {}
  return report;
}

function normalizeLocalPost(p) {
  const num = (v) => (v === null || v === undefined || isNaN(+v) ? 0 : +v);
  const watch = (p.watchDuration === null || p.watchDuration === undefined || isNaN(+p.watchDuration)) ? null : +p.watchDuration;
  return {
    platform: p.platform || 'Instagram',
    date: p.date || null,
    time: p.time || null,
    text: normalizeText(p.text) || '',
    postType: p.postType || (watch && watch > 0 ? 'reel' : 'post'),
    comments: num(p.comments), engagement: num(p.engagement), follows: num(p.follows),
    likes: num(p.likes), reach: num(p.reach), saves: num(p.saves),
    shares: num(p.shares), views: num(p.views),
    watchDuration: watch,
    sourceFileName: 'localStorage-migratie'
  };
}
function numOrNull(v) { return (v === null || v === undefined || isNaN(+v)) ? null : +v; }
