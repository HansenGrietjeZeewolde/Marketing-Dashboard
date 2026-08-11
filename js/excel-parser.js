/* ============================================================
   EXCEL-PARSERS (atomair, geven arrays terug)
   ------------------------------------------------------------
   Ongewijzigd overgenomen uit build 2026-08-04-v15, inclusief de
   Meta-Facebook Excel-parser (kolomnaam-gebaseerd).
   ============================================================ */

import {
  normalizeText,
  parseNumber,
  parseDuration,
  parseDate,
  extractYearHint
} from './parse-primitives.js';

function findHeaderRow(rows, marker) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && String(rows[i][0] || '').trim() === marker) return i;
  }
  return -1;
}
function colIndex(header, name) {
  return header.findIndex((h) => String(h || '').trim().toLowerCase() === name.toLowerCase());
}
function colContains(header, part) {
  return header.findIndex((h) => String(h || '').trim().toLowerCase().includes(part.toLowerCase()));
}

export function parseFacebookSheet(rows) {
  const hIdx = findHeaderRow(rows, 'Datum'); if (hIdx === -1) return [];
  const H = rows[hIdx];
  const idx = {
    datum: colIndex(H, 'Datum'), tekst: colIndex(H, 'Posttekst'), opm: colIndex(H, 'Opmerkingen'),
    eng: colIndex(H, 'Engagement'), likes: colIndex(H, 'Likes en reacties'), delen: colIndex(H, 'Delen'), weerg: colIndex(H, 'Weergaven')
  };
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r[idx.datum] === undefined || r[idx.datum] === '') break;
    const date = parseDate(r[idx.datum]); if (!date) continue;
    out.push({
      platform: 'Facebook', date, text: normalizeText(r[idx.tekst]).slice(0, 80),
      comments: parseNumber(r[idx.opm]), engagement: parseNumber(r[idx.eng]), likes: parseNumber(r[idx.likes]),
      shares: parseNumber(r[idx.delen]), views: parseNumber(r[idx.weerg]), reach: null, saves: null,
      watchDuration: null, follows: null, postType: 'post'
    });
  }
  return out;
}

export function parseInstagramSheet(rows) {
  const hIdx = findHeaderRow(rows, 'Datum/tijd'); if (hIdx === -1) return [];
  const H = rows[hIdx];
  const idx = {
    datum: colIndex(H, 'Datum/tijd'), post: colIndex(H, 'Post'), comments: colIndex(H, 'Comments'),
    eng: colIndex(H, 'Engagement'), likes: colIndex(H, 'Likes'), reach: colIndex(H, 'Reach'), shares: colIndex(H, 'Shares'),
    views: colIndex(H, 'Views'), saves: colIndex(H, 'Saves'), watch: colContains(H, 'watch')
  };
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r[idx.datum] === undefined || r[idx.datum] === '') break;
    const date = parseDate(r[idx.datum]); if (!date) continue;
    const watchSec = idx.watch > -1 ? parseDuration(r[idx.watch]) : null;
    out.push({
      platform: 'Instagram', date, text: normalizeText(r[idx.post]).slice(0, 80),
      comments: parseNumber(r[idx.comments]), engagement: parseNumber(r[idx.eng]), likes: parseNumber(r[idx.likes]),
      reach: parseNumber(r[idx.reach]), shares: parseNumber(r[idx.shares]), views: parseNumber(r[idx.views]),
      saves: parseNumber(r[idx.saves]), watchDuration: watchSec, follows: null,
      postType: (watchSec !== null && watchSec > 0) ? 'reel' : 'post'
    });
  }
  return out;
}

function findGenericHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; if (!row) continue;
    const joined = row.map((c) => String(c || '').toLowerCase());
    const hasDate = joined.some((c) => c.includes('date') || c.includes('datum'));
    const hits = ['engagement', 'likes', 'reach', 'views', 'weergaven', 'comments', 'reacties'].filter((k) => joined.some((c) => c.includes(k))).length;
    if (hasDate && hits >= 2) return i;
  }
  return -1;
}

export function parseGenericSheet(rows, fullText) {
  const hIdx = findGenericHeaderRow(rows); if (hIdx === -1) return [];
  const H = rows[hIdx];
  const find = (kws) => { for (const kw of kws) { const i = H.findIndex((h) => String(h || '').toLowerCase().includes(kw)); if (i > -1) return i; } return -1; };
  const idx = {
    datum: find(['date', 'datum']), post: find(['post', 'tekst', 'caption']), comments: find(['comment', 'reacti', 'opmerking']),
    eng: find(['engagement', 'betrokken']), likes: find(['like', 'vind']), reach: find(['reach', 'bereik']),
    saves: find(['save', 'opgeslagen']), shares: find(['share', 'delen', 'doorgestuurd']), views: find(['view', 'weergave', 'impress']),
    watch: find(['watch', 'kijktijd'])
  };
  let platform = (idx.reach > -1 || idx.saves > -1) ? 'Instagram' : 'Facebook';
  if (/instagram/i.test(fullText || '') && !/facebook/i.test(fullText || '')) platform = 'Instagram';
  else if (/facebook/i.test(fullText || '') && !/instagram/i.test(fullText || '')) platform = 'Facebook';
  const yearHint = extractYearHint(fullText, '');
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || idx.datum < 0 || String(r[idx.datum] || '').trim() === '') continue;
    const date = parseDate(r[idx.datum], yearHint); if (!date) continue;
    const watchSec = idx.watch > -1 ? parseDuration(r[idx.watch]) : null;
    out.push({
      platform, date, text: normalizeText(r[idx.post]).slice(0, 80),
      comments: parseNumber(r[idx.comments]), engagement: parseNumber(r[idx.eng]), likes: parseNumber(r[idx.likes]),
      reach: parseNumber(r[idx.reach]), shares: parseNumber(r[idx.shares]), views: parseNumber(r[idx.views]),
      saves: parseNumber(r[idx.saves]), watchDuration: watchSec, follows: null,
      postType: (watchSec !== null && watchSec > 0) ? 'reel' : 'post'
    });
  }
  return out;
}

/* ------------------------------------------------------------
   META-FACEBOOK EXCEL (tabel-export, NL-koppen, MM/DD/YYYY)
   ------------------------------------------------------------ */
function parseMetaDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[1] + '-' + m[2];
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0].slice(0, 10);
  return null;
}

export function isMetaFacebookSheet(rows) {
  return rows.some((r) => r && String(r[0] || '').trim() === 'Bericht-ID')
    && rows.some((r) => r && r.some((c) => /Berichttype/i.test(String(c || ''))));
}

export function parseMetaFacebookSheet(rows) {
  const hIdx = rows.findIndex((r) => r && String(r[0] || '').trim() === 'Bericht-ID');
  if (hIdx === -1) return [];
  const H = rows[hIdx].map((h) => String(h || '').trim());
  const exact = (n) => H.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  const starts = (n) => H.findIndex((h) => h.toLowerCase().startsWith(n.toLowerCase()));
  const idx = {
    datum: exact('Datum'), pub: starts('Publicatietijdstip'),
    titel: exact('Titel'), oms: exact('Omschrijving'), btype: exact('Berichttype'),
    weergaven: starts('Weergaven'), bereik: starts('Bereik'),
    eng: starts('Reacties, opmerkingen'), reacties: exact('Reacties'),
    opm: exact('Opmerkingen'), deel: exact('Deelacties'), sec: starts('Seconden bekeken')
  };
  const isCode = (s) => /^copy_[0-9a-f-]+$/i.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s);
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    let dateSrc = (idx.pub > -1) ? r[idx.pub] : (idx.datum > -1 ? r[idx.datum] : '');
    let date = parseMetaDate(dateSrc);
    if (!date && idx.datum > -1) date = parseMetaDate(r[idx.datum]);
    if (!date) continue;
    const isVideo = /video/i.test(String(idx.btype > -1 ? r[idx.btype] : ''));
    const secVal = idx.sec > -1 ? parseNumber(r[idx.sec]) : null;
    const watch = (isVideo && secVal !== null) ? secVal : null;
    const titel = normalizeText(idx.titel > -1 ? r[idx.titel] : '');
    const oms = normalizeText(idx.oms > -1 ? r[idx.oms] : '');
    let caption = '';
    if (oms && !isCode(oms)) caption = oms;
    else if (titel && !isCode(titel)) caption = titel;
    else caption = oms || titel || '';
    out.push({
      platform: 'Facebook', date, text: caption.slice(0, 80),
      comments: idx.opm > -1 ? parseNumber(r[idx.opm]) : null,
      engagement: idx.eng > -1 ? parseNumber(r[idx.eng]) : null,
      likes: idx.reacties > -1 ? parseNumber(r[idx.reacties]) : null,
      reach: idx.bereik > -1 ? parseNumber(r[idx.bereik]) : null,
      shares: idx.deel > -1 ? parseNumber(r[idx.deel]) : null,
      views: idx.weergaven > -1 ? parseNumber(r[idx.weergaven]) : null,
      saves: null, follows: null,
      watchDuration: watch,
      postType: (watch !== null && watch > 0) ? 'reel' : 'post'
    });
  }
  return out;
}

/* Hoofdingang: leest een ArrayBuffer, geeft {posts, platforms}. */
export function parseWorkbook(arrayBuffer, fileName) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  let all = [];
  wb.SheetNames.forEach((name) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false });
    let sheet;
    if (isMetaFacebookSheet(rows)) {
      sheet = parseMetaFacebookSheet(rows);
    } else {
      sheet = parseFacebookSheet(rows).concat(parseInstagramSheet(rows));
      if (sheet.length === 0) {
        const fullText = rows.map((r) => (r || []).join(' ')).join('\n') + '\n' + name;
        sheet = parseGenericSheet(rows, fullText);
      }
    }
    all = all.concat(sheet);
  });
  const platforms = [...new Set(all.map((p) => p.platform))];
  return { posts: all, platforms };
}
