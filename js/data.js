// =====================================================================
// Gegevens laden en uitrekenen. Alle berekeningen zijn losse functies
// zonder browser-afhankelijkheden, zodat ze ook in Node te testen zijn.
// =====================================================================

export const LOCATIONS = [
  { id: 'hg', name: 'Hans & Grietje', short: 'Hans & Grietje', abbr: 'H&G', color: '#E41C2D', sub: 'Pannenkoekenhuis en Speelpark' },
  { id: 'kbb', name: 'Het Grote Kabouterbos', short: 'Kabouterbos', abbr: 'KBB', color: '#D99A1F', sub: 'Dronten' },
  { id: 'hbvp', name: 'Heksenblotevoetenpad', short: 'Heksenblotevoetenpad', abbr: 'HBVP', color: '#3F7A46', sub: 'Zeewolde' },
  { id: 'bb', name: 'De Betovering', short: 'Betovering', abbr: 'BB', color: '#6B4596', sub: '' }
];
export const loc = (id) => LOCATIONS.find((l) => l.id === id);

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const MON = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

export const monthLabel = (m) => { const [y, mo] = m.split('-'); return `${MONTHS[+mo - 1][0].toUpperCase()}${MONTHS[+mo - 1].slice(1)} ${y}`; };
export const monthName = (m) => MONTHS[+m.split('-')[1] - 1];
export const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
export const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };

// published_local komt als "2026-07-04T18:02:00" (Nederlandse tijd)
export const monthOf = (p) => p.published_local.slice(0, 7);
export const hourOf = (p) => Number(p.published_local.slice(11, 13));
export function dayLabel(p) {
  const d = p.published_local.slice(0, 10);
  const wd = DAYS[new Date(d + 'T12:00:00Z').getUTCDay()];
  return `${wd} ${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;
}
export const timeLabel = (p) => p.published_local.slice(11, 16);

export const TYPE_LABEL = { reel: 'Reel', photo: 'Foto', carousel: 'Carrousel', video: 'Video', story: 'Story', text: 'Tekst', link: 'Link', other: 'Overig' };
export const TYPE_PLURAL = { reel: 'Reels', photo: "Foto's", carousel: 'Carrousels', video: "Video's", story: 'Stories', text: 'Tekstposts', link: 'Linkposts', other: 'Overige posts' };
export const PLATFORM_LABEL = { facebook: 'Facebook', instagram: 'Instagram' };

// ---------- selectie ----------
export function selectPosts(posts, { location = 'alle', month, platform = 'samen' }) {
  return posts.filter((p) =>
    (location === 'alle' || p.location_id === location) &&
    (!month || monthOf(p) === month) &&
    (platform === 'samen' || p.platform === platform));
}

export function availableMonths(posts) {
  return [...new Set(posts.map(monthOf))].sort();
}

// ---------- kerncijfers ----------
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const has = (rows, k) => rows.some((r) => r[k] !== null && r[k] !== undefined);

export function totals(posts) {
  const reach = sum(posts, 'reach');
  const interactions = sum(posts, 'interactions');
  return {
    posts: posts.length,
    views: sum(posts, 'views'),
    reach,
    interactions,
    likes: sum(posts, 'likes'),
    comments: sum(posts, 'comments'),
    shares: sum(posts, 'shares'),
    saves: has(posts, 'saves') ? sum(posts, 'saves') : null,
    er: reach ? interactions / reach : null
  };
}

export function followers(accountMonthly, { location = 'alle', month, platform = 'samen' }) {
  const rows = accountMonthly.filter((r) =>
    (location === 'alle' || r.location_id === location) && r.month.slice(0, 7) === month &&
    (platform === 'samen' || r.platform === platform));
  const withTotal = rows.filter((r) => r.followers_end !== null && r.followers_end !== undefined);
  // Welke accounts horen bij deze selectie (ongeacht de maand)? Ontbreekt de stand van
  // een van die accounts in deze maand, dan is het totaal maar een deel.
  const key = (r) => `${r.location_id}|${r.platform}`;
  const expected = new Set(accountMonthly.filter((r) =>
    (location === 'alle' || r.location_id === location) && (platform === 'samen' || r.platform === platform)).map(key));
  const have = new Set(withTotal.map(key));
  const missing = [...expected].filter((k) => !have.has(k));
  // Maandsommen (nieuwe volgers, bereik bij volgers) alleen als elke rij een complete maand is.
  const full = rows.length > 0 && rows.every((r) => r.complete !== false);
  return {
    total: withTotal.length ? sum(withTotal, 'followers_end') : null,
    estimated: withTotal.some((r) => r.followers_estimated),
    missingPlatforms: [...new Set(missing.map((k) => k.split('|')[1]))],
    gained: full && has(rows, 'follows') ? sum(rows, 'follows') : null,
    lost: full && has(rows, 'unfollows') ? sum(rows, 'unfollows') : null,
    reachFollowers: full && has(rows, 'reach_followers') ? sum(rows, 'reach_followers') : null,
    reachNonFollowers: full && has(rows, 'reach_non_followers') ? sum(rows, 'reach_non_followers') : null,
    byLocation: Object.fromEntries(LOCATIONS.map((l) => {
      const r = withTotal.filter((x) => x.location_id === l.id);
      return [l.id, r.length ? sum(r, 'followers_end') : null];
    }))
  };
}

// Vergelijk alleen locatie+platform-combinaties die in beide maanden data
// hebben; anders lijkt een maand met ontbrekende exports een grote daling.
// Kerncijfers per kalendermaand. Per locatie+platform gebruiken we de cijfers
// van het hele account (account_monthly: alles wat in die maand bekeken is,
// ook oudere posts) als Meta die levert; anders de optelsom van de posts die in
// die maand geplaatst zijn. `basis` zegt welke van de twee het werd.
const PLATFORMS = ['facebook', 'instagram'];
const ACCOUNT_FIELD = { views: 'views', reach: 'reach_daily_sum', interactions: 'total_interactions' };
export function monthKpis(posts, accountMonthly, { location = 'alle', month, platform = 'samen' }) {
  const locs = LOCATIONS.filter((l) => location === 'alle' || l.id === location);
  const plats = PLATFORMS.filter((p) => platform === 'samen' || p === platform);
  const parts = [];
  for (const l of locs) for (const pl of plats) {
    const ps = posts.filter((p) => p.location_id === l.id && p.platform === pl && monthOf(p) === month);
    // Alleen accountcijfers gebruiken als Meta de hele maand (tot nu toe) geleverd heeft.
    const acc = accountMonthly.find((r) => r.location_id === l.id && r.platform === pl && r.month.slice(0, 7) === month && r.complete !== false);
    const part = { location_id: l.id, platform: pl, posts: ps.length, src: {} };
    // Meta levert sommige accountcijfers pas vanaf een bepaalde datum en geeft daarvoor 0
    // (bijv. Facebook-bereik vóór april 2025). Een 0 of leeg cijfer telt als 'niet geleverd'.
    // Bereik en interacties horen bij elkaar (engagement rate): allebei van het account, of allebei van de posts.
    const ok = (f) => acc && acc[f] !== null && acc[f] !== undefined && Number(acc[f]) > 0;
    const use = { views: ok('views'), reach: ok('reach_daily_sum') && ok('total_interactions') };
    use.interactions = use.reach;
    for (const [m, f] of Object.entries(ACCOUNT_FIELD)) {
      if (use[m]) { part[m] = Number(acc[f]); part.src[m] = 'account'; }
      else { part[m] = sum(ps, m); part.src[m] = 'posts'; }
    }
    part.hasData = ps.length > 0 || Object.values(part.src).includes('account');
    parts.push(part);
  }
  return kpiSum(parts.filter((p) => p.hasData));
}
function kpiSum(parts) {
  const views = sum(parts, 'views'), reach = sum(parts, 'reach'), interactions = sum(parts, 'interactions');
  const srcs = parts.flatMap((p) => Object.values(p.src));
  const basis = !srcs.length ? 'posts' : srcs.every((s) => s === 'account') ? 'account' : srcs.every((s) => s === 'posts') ? 'posts' : 'mixed';
  const byLocation = (metric) => {
    const total = sum(parts, metric);
    return LOCATIONS.map((l) => {
      const v = sum(parts.filter((p) => p.location_id === l.id), metric);
      return { ...l, value: v, share: total ? v / total : 0 };
    });
  };
  return { parts, keys: parts.map((p) => `${p.location_id}|${p.platform}`), posts: sum(parts, 'posts'),
    views, reach, interactions, er: reach ? interactions / reach : null, basis, byLocation };
}
// Vergelijk twee maanden alleen over de accounts die in beide maanden cijfers hebben.
export function comparableKpis(cur, prev) {
  const both = cur.keys.filter((k) => prev.keys.includes(k));
  const pick = (k) => k.parts.filter((p) => both.includes(`${p.location_id}|${p.platform}`));
  return { c: kpiSum(pick(cur)), p: kpiSum(pick(prev)), partial: both.length > 0 && both.length < cur.keys.length, any: both.length > 0 };
}
export const BASIS_LABEL = {
  account: 'Hele account in deze kalendermaand',
  posts: 'Opgeteld over de posts van deze maand',
  mixed: 'Deels hele account, deels opgeteld per post'
};

export function comparable(cur, prev) {
  const key = (p) => `${p.location_id}|${p.platform}`;
  const both = new Set(cur.map(key).filter((k) => prev.some((p) => key(p) === k)));
  return [cur.filter((p) => both.has(key(p))), prev.filter((p) => both.has(key(p)))];
}

// procentuele verandering; null als er niets te vergelijken valt
export function delta(cur, prev) {
  if (cur === null || prev === null || prev === undefined || prev === 0) return null;
  return (cur - prev) / prev;
}

// aandeel per locatie in een metric
export function shares(posts, metric) {
  const total = sum(posts, metric);
  return LOCATIONS.map((l) => {
    const v = sum(posts.filter((p) => p.location_id === l.id), metric);
    return { ...l, value: v, share: total ? v / total : 0 };
  });
}

// ---------- weken binnen een maand (maandag t/m zondag) ----------
export function weeks(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = [];
  let start = 1;
  for (let d = 1; d <= last; d++) {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd === 0 || d === last) {
      out.push({ from: start, to: d, label: start === d ? `${d} ${MON[m - 1]}` : `${start}–${d} ${MON[m - 1]}` });
      start = d + 1;
    }
  }
  return out;
}

export function weeklyReach(posts, month) {
  return weeks(month).map((w) => {
    const v = sum(posts.filter((p) => monthOf(p) === month && (() => {
      const d = Number(p.published_local.slice(8, 10)); return d >= w.from && d <= w.to;
    })()), 'reach');
    return { ...w, value: v };
  });
}

// ---------- posts ----------
export const byReach = (a, b) => (b.reach || 0) - (a.reach || 0) || (b.interactions || 0) - (a.interactions || 0);
const byReachD7 = (a, b) => (b.reach_d7 || 0) - (a.reach_d7 || 0) || (b.interactions_d7 || 0) - (a.interactions_d7 || 0);
export const hasD7 = (p) => p.reach_d7 !== null && p.reach_d7 !== undefined;
export function topAndBottom(posts, n = 3, mode = 'totaal') {
  const sorted = mode === 'd7' ? posts.filter(hasD7).sort(byReachD7) : posts.filter((p) => p.reach !== null).sort(byReach);
  const top = sorted.slice(0, n);
  const bottom = sorted.slice(-n).reverse().filter((p) => !top.includes(p));
  return { top, bottom };
}

export function byType(posts) {
  const groups = {};
  for (const p of posts) (groups[p.media_type] ??= []).push(p);
  return Object.entries(groups).map(([type, rows]) => ({
    type, label: TYPE_LABEL[type] || type, plural: TYPE_PLURAL[type] || type, count: rows.length,
    avgReach: sum(rows, 'reach') / rows.length,
    avgInteractions: sum(rows, 'interactions') / rows.length
  })).sort((a, b) => b.avgReach - a.avgReach);
}

export const SLOTS = [
  { id: 'ochtend', label: 'Ochtend', hint: 'voor 12 u', test: (h) => h < 12 },
  { id: 'middag', label: 'Middag', hint: '12–17 u', test: (h) => h >= 12 && h < 17 },
  { id: 'avond', label: 'Avond', hint: 'na 17 u', test: (h) => h >= 17 }
];
export function bySlot(posts) {
  return SLOTS.map((s) => {
    const rows = posts.filter((p) => s.test(hourOf(p)));
    return { ...s, count: rows.length, avgReach: rows.length ? sum(rows, 'reach') / rows.length : null };
  });
}

// Dezelfde caption meer dan eens in één maand (dubbel geplaatst)
export function duplicates(posts) {
  const seen = {};
  for (const p of posts) {
    const key = `${p.location_id}|${p.platform}|${(p.caption || '').slice(0, 60)}`;
    if (!p.caption) continue;
    (seen[key] ??= []).push(p);
  }
  return Object.values(seen).filter((g) => g.length > 1);
}

// ---------- automatische samenvatting (zonder AI) ----------
const pct = (x) => `${Math.round(Math.abs(x) * 100)}%`;
const n0 = (x) => Math.round(x).toLocaleString('nl-NL');

export function autoInsights({ posts, prevPosts, location, screen }) {
  const out = [];
  if (!posts.length) return out;
  const t = totals(posts);
  const best = [...posts].sort(byReach)[0];

  if (location === 'alle') {
    const s = shares(posts, 'reach').sort((a, b) => b.share - a.share)[0];
    if (s.share > 0.5) out.push(`${s.name} leverde ${pct(s.share)} van al het bereik deze maand.`);
    const ers = LOCATIONS.map((l) => ({ l, t: totals(posts.filter((x) => x.location_id === l.id)) }))
      .filter((x) => x.t.posts && x.t.er !== null).sort((a, b) => b.t.er - a.t.er);
    if (ers.length > 1) out.push(`De hoogste engagement rate had ${ers[0].l.name}: ${(ers[0].t.er * 100).toFixed(2).replace('.', ',')}%, tegen ${(t.er * 100).toFixed(2).replace('.', ',')}% gemiddeld.`);
  }
  if (best && t.reach) {
    out.push(`De beste post was een ${(TYPE_LABEL[best.media_type] || '').toLowerCase()} van ${dayLabel(best)} met ${n0(best.reach)} bereik: ${pct(best.reach / t.reach)} van het bereik van de maand.`);
  }
  const types = byType(posts).filter((x) => x.count >= 2);
  if (types.length >= 2) {
    const [a, b] = types;
    out.push(`${TYPE_PLURAL[a.type] || a.label} haalden gemiddeld meer bereik dan ${(TYPE_PLURAL[b.type] || b.label).toLowerCase()}: ${n0(a.avgReach)} tegen ${n0(b.avgReach)} per post.`);
  }
  const [cc, pc] = comparable(posts, prevPosts);
  if (pc.length) {
    const tc = totals(cc), tp = totals(pc);
    const d = delta(tc.reach, tp.reach);
    const scope = cc.length === posts.length ? '' : ' (alleen accounts met cijfers in beide maanden)';
    if (d !== null && Math.abs(d) >= 0.05) out.push(`Het bereik was ${pct(d)} ${d > 0 ? 'hoger' : 'lager'} dan vorige maand: ${n0(tc.reach)} tegen ${n0(tp.reach)}${scope}.`);
  }
  if (screen === 'analyse') {
    const slots = bySlot(posts).filter((s) => s.count);
    if (slots.length > 1) {
      const bestSlot = [...slots].sort((a, b) => b.avgReach - a.avgReach)[0];
      out.push(`Posts in de ${bestSlot.label.toLowerCase()} haalden gemiddeld het meeste bereik (${n0(bestSlot.avgReach)}).`);
    } else if (slots.length === 1) {
      out.push(`Alle posts gingen in de ${slots[0].label.toLowerCase()} online; probeer een ander moment om te vergelijken.`);
    }
    const dup = duplicates(posts);
    if (dup.length) out.push(`${dup.length === 1 ? 'Eén post is' : dup.length + ' posts zijn'} twee keer geplaatst; dat verdeelt het bereik.`);
  }
  return out.slice(0, 4);
}
