/* ============================================================
   PDF-PARSER — positie-gebaseerd, met parserprofielen
   ------------------------------------------------------------
   Ongewijzigd overgenomen uit build 2026-08-04-v15.
   Pipeline: parsePdf -> normalizeRows -> validatePosts.
   commitPosts is vervangen door de Supabase-repository (imports.js),
   maar de parser zelf is identiek en atomair (wijzigt geen state).
   ============================================================ */

import {
  normalizeText,
  safeTruncate,
  parseNumber,
  parseDuration,
  monthIndex,
  extractYearHint
} from './parse-primitives.js';

const PDF_COLS = ['comments', 'engagement', 'follows', 'likes', 'reach', 'watch', 'saves', 'shares', 'views'];
const PDF_HEADER_ALIASES = {
  comments: ['COMMENTS', 'REACTIES', 'OPMERKINGEN'],
  engagement: ['ENGAGEMENT', 'BETROKKENHEID'],
  follows: ['FOLLOWS', 'VOLGERS', 'FOLLOWERS'],
  likes: ['LIKES', 'VINDIKLEUKS'],
  reach: ['REACH', 'BEREIK'],
  watch: ['REEL', 'WATCH', 'WATCHTIME', 'KIJKTIJD', 'WATC'],
  saves: ['SAVES', 'OPGESLAGEN'],
  shares: ['SHARES', 'DELEN', 'DOORGESTUURD'],
  views: ['VIEWS', 'WEERGAVEN', 'IMPRESSIONS', 'IMPRESSIES']
};

const PDF_PARSER_PROFILES = {
  hootsuiteInstagram: {
    label: 'Hootsuite Instagram',
    platform: 'Instagram',
    match: (txt) => /post performance/i.test(txt) && /instagram/i.test(txt),
    requiredCols: ['comments', 'engagement', 'likes', 'reach', 'views']
  },
  hootsuiteFacebook: {
    label: 'Hootsuite Facebook',
    platform: 'Facebook',
    match: (txt) => /post performance/i.test(txt) && /facebook/i.test(txt) && !/instagram/i.test(txt),
    requiredCols: ['engagement', 'likes', 'views']
  },
  metaInstagram: {
    label: 'Meta Instagram',
    platform: 'Instagram',
    match: (txt) => /meta|instagram insights/i.test(txt) && /instagram/i.test(txt),
    requiredCols: ['reach', 'likes', 'views']
  },
  metaFacebook: {
    label: 'Meta Facebook',
    platform: 'Facebook',
    match: (txt) => /meta|facebook insights/i.test(txt) && /facebook/i.test(txt),
    requiredCols: ['engagement', 'views']
  },
  generic: {
    label: 'Algemeen (auto)',
    platform: null,
    match: () => true,
    requiredCols: ['engagement', 'likes', 'views']
  }
};

function pickProfile(fullText) {
  for (const key of Object.keys(PDF_PARSER_PROFILES)) {
    if (key === 'generic') continue;
    if (PDF_PARSER_PROFILES[key].match(fullText || '')) return { key, ...PDF_PARSER_PROFILES[key] };
  }
  return { key: 'generic', ...PDF_PARSER_PROFILES.generic };
}

function groupLines(items, tol) {
  tol = tol || 3;
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const lines = [];
  sorted.forEach((it) => {
    let line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (!line) { line = { y: it.y, items: [] }; lines.push(line); }
    line.items.push(it);
    line.y = (line.y * (line.items.length - 1) + it.y) / line.items.length;
  });
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

function headerKeyForToken(rawText) {
  const t = String(rawText).trim().toUpperCase().replace(/[.:…,]+$/, '').replace(/\s/g, '');
  for (const key of PDF_COLS) {
    if (PDF_HEADER_ALIASES[key].some((a) => t === a || (a.length >= 5 && t.startsWith(a)))) return key;
  }
  return null;
}

function detectColumns(items) {
  const lines = groupLines(items, 3);
  let bestLine = null, bestCount = -1;
  lines.forEach((line) => {
    const keys = new Set();
    line.items.forEach((it) => { const k = headerKeyForToken(it.text); if (k) keys.add(k); });
    if (keys.size > bestCount) { bestCount = keys.size; bestLine = line; }
  });
  const colX = {};
  if (!bestLine || bestCount < 3) return colX;
  bestLine.items.forEach((it) => {
    const k = headerKeyForToken(it.text);
    if (k && colX[k] === undefined) colX[k] = it.x;
  });
  return colX;
}

/* ------------------------------------------------------------
   META-FACEBOOK PDF (tabel-export, NL-koppen, MM/DD/YYYY)
   ------------------------------------------------------------ */
export function isMetaFacebookPdf(fullText) {
  const t = fullText || '';
  return /Bericht-ID/i.test(t) && /Pagina-ID/i.test(t) &&
    /Berichttype/i.test(t) && /(Deelacties|Weergaven)/i.test(t);
}

export function parseMetaFacebookPdf(items, fullText, fileName) {
  const diag = {
    profile: 'Meta Facebook (tabel)', rawItems: items.length, lines: 0,
    records: 0, skipped: [], headerCols: {}, unmatchedCols: [], pages: 0
  };
  const lines = groupLines(items, 3);
  diag.lines = lines.length;

  const idRe = /^\d{15,17}$/;
  const dateRe = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const timeRe = /^\d{1,2}:\d{2}$/;

  const rows = [];
  lines.forEach((line) => {
    const toks = line.items.map((i) => normalizeText(i.text)).filter(Boolean);
    if (!toks.length || !idRe.test(toks[0])) return;

    const li = toks.indexOf('Looptijd');
    if (li === -1) { diag.skipped.push({ y: Math.round(line.y), reason: 'geen Looptijd-anker' }); return; }
    const m = toks.slice(li + 1);

    let date = null, time = null;
    for (let i = 0; i < toks.length; i++) {
      const dm = toks[i].match(dateRe);
      if (dm) {
        date = dm[3] + '-' + dm[1] + '-' + dm[2];
        if (i + 1 < toks.length && timeRe.test(toks[i + 1])) time = toks[i + 1].padStart(5, '0');
        break;
      }
    }

    const isVideo = toks.includes("Video's");
    const btype = isVideo ? 'reel' : (toks.includes("Foto's") ? 'post' : 'post');

    const gi = (i) => (i < m.length ? m[i] : null);
    rows.push({
      date, time, platform: 'Facebook', caption: '',
      views: gi(0), reach: gi(1), engagement: gi(2),
      likes: gi(3), comments: gi(4), shares: gi(5),
      saves: null, follows: null,
      watch: isVideo ? gi(8) : null,
      postType: btype
    });
  });

  diag.records = rows.length;
  return { rows, diagnostics: diag, profile: { platform: 'Facebook', label: 'Meta Facebook (tabel)' } };
}

/* parsePdf: neemt ruwe pdf.js-items {x,y,text,page}, geeft {rows, diagnostics} */
export function parsePdf(items, fullText, fileName) {
  const diag = { headerCols: {}, pages: 0, rawItems: items.length, lines: 0, records: 0, skipped: [], unmatchedCols: [], profile: null };
  const yearHint = extractYearHint(fullText, fileName);
  const profile = pickProfile(fullText);
  diag.profile = profile.label;

  const colX = detectColumns(items);
  diag.headerCols = colX;
  const missing = profile.requiredCols.filter((k) => colX[k] === undefined);
  if (missing.length) {
    diag.unmatchedCols = missing;
    return {
      rows: [], diagnostics: diag, error: 'Kolommen niet betrouwbaar gekoppeld: ' + missing.join(', ').toUpperCase() +
        '. Controleer of dit hetzelfde exporttype is (Hootsuite/Meta).'
    };
  }
  const orderedKeys = PDF_COLS.filter((k) => colX[k] !== undefined).sort((a, b) => colX[a] - colX[b]);
  const valueStart = colX.comments !== undefined ? (colX.comments - 30) : (Math.min(...orderedKeys.map((k) => colX[k])) - 30);

  const lines = groupLines(items, 3);
  diag.lines = lines.length;

  const dateRe = /(Jan|Feb|Mar|Mrt|Apr|May|Mei|Jun|Jul|Aug|Sep|Sept|Oct|Okt|Nov|Dec)[a-z.]*\s+(\d{1,2}),?\s*(\d{1,2}):(\d{2})/i;
  const isValTok = (t) => {
    const s = String(t).trim();
    return /^-?\d[\d,]*$/.test(s) || /^\d+([.,]\d+)?s?$/.test(s) ||
      /^(?:\d+d)?(?:\d+h)?(?:\d+m)?(?:\d+s)?$/i.test(s.replace(/\s/g, ''));
  };

  const dateLines = [], valueLines = [];
  lines.forEach((line) => {
    const joined = line.items.map((i) => i.text).join(' ');
    const dm = joined.match(dateRe);
    if (dm) dateLines.push({ y: line.y, dm });
    const right = line.items.filter((i) => i.x >= valueStart).filter((i) => isValTok(i.text) && String(i.text).trim() !== '');
    if (right.length >= Math.min(7, orderedKeys.length)) valueLines.push({ y: line.y, items: right });
  });

  function tokensToRecord(vitems) {
    const cols = orderedKeys.map((key, index) => {
      const x = colX[key];
      const prev = index > 0 ? colX[orderedKeys[index - 1]] : null;
      const next = index < orderedKeys.length - 1 ? colX[orderedKeys[index + 1]] : null;
      return { key, x, minX: prev === null ? -Infinity : (prev + x) / 2, maxX: next === null ? Infinity : (x + next) / 2 };
    });
    const buckets = {};
    cols.forEach((c) => (buckets[c.key] = []));
    vitems.forEach((it) => {
      let col = cols.find((c) => it.x >= c.minX && it.x < c.maxX);
      if (!col) {
        col = cols.reduce((best, c) => (Math.abs(it.x - c.x) < Math.abs(it.x - best.x) ? c : best), cols[0]);
      }
      buckets[col.key].push(it);
    });
    const r = {};
    Object.entries(buckets).forEach(([key, parts]) => {
      if (!parts.length) return;
      r[key] = parts.sort((a, b) => a.x - b.x).map((it) => normalizeText(it.text)).join(' ').trim();
    });
    return r;
  }

  /* ------------------------------------------------------------
     SEMANTISCHE (positie-onafhankelijke) mapper — primaire route
     ------------------------------------------------------------
     Reden: bij Hootsuite-exports staan de kolomkoppen links uitgelijnd
     terwijl de getallen rechts uitgelijnd staan. Het x-midden tussen
     twee KOPPEN is daardoor de verkeerde grens voor de DATA, waardoor
     kolommen één plek verschoven raakten (comments viel weg, follows
     kreeg de engagement-waarde, saves werd een samengeplakt getal, en
     de kijktijd verdween). Deze mapper koppelt de waardetokens in
     leesvolgorde (links -> rechts) aan de vaste kolomvolgorde, en
     herkent de kijktijd (REEL WATCH) semantisch als het duur-token
     (bv. "4h31m", "25m13s", "0s"). Aangrenzende duur-tokens (pdf.js
     levert "4h" en "31m" soms los) worden samengevoegd.

     Voorwaarde om deze route te gebruiken: er zijn precies zoveel
     kolommen gedetecteerd als in de vaste volgorde (orderedKeys), en
     na samenvoeging blijven exact evenveel waarde-slots over. Lukt dat
     niet, dan valt de parser terug op de x-bucket-methode hierboven,
     zodat afwijkende exportvormen niet stukgaan. */
  const isDurationToken = (s) => {
    const t = String(s).trim().toLowerCase();
    // Alleen tokens die daadwerkelijk een tijdseenheid (h/m/s) bevatten
    // gelden als kijktijd. Een kale "0" is een gewoon getal (bv. comments=0),
    // GEEN kijktijd; nul-kijktijd staat in deze exports altijd als "0s".
    if (!/[hms]/.test(t)) return false;
    // een enkel duur-onderdeel: 4h, 31m, 24s, 1.5h, 25m, 0s ...
    if (/^\d+(?:[.,]\d+)?\s*[hms]$/.test(t)) return true;
    // reeds samengevoegd: 4h31m, 25m13s, 1h6m ...
    if (/^(?:\d+(?:[.,]\d+)?h)?(?:\d+(?:[.,]\d+)?m)?(?:\d+(?:[.,]\d+)?s)?$/.test(t)) return true;
    return false;
  };
  const isPlainNumberToken = (s) => /^-?\d[\d.,]*$/.test(String(s).trim());

  function tokensToRecordSemantic(vitems) {
    // Alleen inzetten als de vaste kolomvolgorde compleet gedetecteerd is.
    if (orderedKeys.length !== PDF_COLS.length) return null;
    let raw = vitems
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((it) => normalizeText(it.text))
      .filter((t) => t !== '');

    // Caption-tekst kan soms net rechts van valueStart uitlopen (bv. een
    // los woordje als "de"). Alleen de aaneengesloten staart van échte
    // waarde-tokens (getal of duur) telt mee; alles daarvoor is caption.
    let firstVal = 0;
    while (firstVal < raw.length && !(isPlainNumberToken(raw[firstVal]) || isDurationToken(raw[firstVal]))) firstVal++;
    raw = raw.slice(firstVal);

    // Voeg opeenvolgende duur-tokens samen tot één kijktijd-token.
    const merged = [];
    let i = 0;
    while (i < raw.length) {
      if (isDurationToken(raw[i]) && !/s$/i.test(raw[i])) {
        let d = raw[i];
        let j = i + 1;
        while (j < raw.length && isDurationToken(raw[j]) && !/s$/i.test(d)) { d += raw[j]; j++; }
        merged.push(d);
        i = j;
      } else {
        merged.push(raw[i]);
        i++;
      }
    }

    // Elk token moet een getal of een kijktijd zijn; anders is dit geen
    // schone waarderegel en laten we de fallback het overnemen.
    if (!merged.every((t) => isPlainNumberToken(t) || isDurationToken(t))) return null;
    if (merged.length !== PDF_COLS.length) return null;

    // Positionele koppeling aan de vaste kolomvolgorde.
    const r = {};
    PDF_COLS.forEach((key, idx) => { r[key] = merged[idx]; });

    // Sanity: de watch-slot hoort een duur te zijn; de rest getallen.
    if (r.watch !== undefined && !isDurationToken(r.watch) && isPlainNumberToken(r.watch)) {
      // Geen duur op de kijktijd-plek -> structuur wijkt af, val terug.
      return null;
    }
    return r;
  }

  const CAPTION_X_MIN = 230;
  const vlYs = [...valueLines].map((v) => v.y).sort((a, b) => b - a);
  function blockRangeFor(valueY) {
    const idx = vlYs.indexOf(valueY);
    const prevY = idx > 0 ? vlYs[idx - 1] : valueY + 90;
    const upper = (valueY + prevY) / 2;
    const lower = valueY - 4;
    return { lower, upper };
  }

  const rows = [];
  dateLines.forEach((dl) => {
    let best = null, bd = Infinity;
    valueLines.forEach((vl) => { const d = Math.abs(vl.y - dl.y); if (d < bd) { bd = d; best = vl; } });
    if (!best || bd > 30) { diag.skipped.push({ y: Math.round(dl.y), reason: 'geen waarderegel dicht bij datum' }); return; }
    // Primair: positie-onafhankelijke leesvolgorde-mapping (robuust voor
    // Hootsuite). Lukt dat niet, dan de oorspronkelijke x-bucket-methode.
    let rec = tokensToRecordSemantic(best.items);
    if (!rec) rec = tokensToRecord(best.items);
    else diag._semanticRows = (diag._semanticRows || 0) + 1;
    const mi = monthIndex(dl.dm[1]);
    if (mi < 0) { diag.skipped.push({ y: Math.round(dl.y), reason: 'maand niet herkend: ' + dl.dm[1] }); return; }
    const date = new Date(Date.UTC(yearHint, mi, parseInt(dl.dm[2], 10))).toISOString().slice(0, 10);
    const time = dl.dm[3].padStart(2, '0') + ':' + dl.dm[4];

    const range = blockRangeFor(best.y);
    const capParts = [];
    lines.filter((line) => line.y >= range.lower && line.y <= range.upper)
      .sort((a, b) => b.y - a.y)
      .forEach((line) => {
        const cap = line.items.filter((i) => i.x >= CAPTION_X_MIN && i.x < valueStart)
          .sort((a, b) => a.x - b.x).map((i) => i.text).join(' ').trim();
        if (cap && !dateRe.test(cap)) capParts.push(cap);
      });
    const caption = safeTruncate(normalizeText(capParts.join(" ")), 120);

    rows.push({
      _rawWatch: rec.watch,
      date, time, caption, platform: profile.platform,
      comments: rec.comments, engagement: rec.engagement, follows: rec.follows,
      likes: rec.likes, reach: rec.reach, saves: rec.saves, shares: rec.shares, views: rec.views,
      watch: rec.watch
    });
  });
  diag.records = rows.length;
  return { rows, diagnostics: diag, profile };
}

/* normalizeRows: ruwe stringrecords -> genormaliseerde postobjecten */
export function normalizeRows(rows, fallbackPlatform) {
  return rows.map((r) => {
    const watchSec = r.watch !== undefined ? parseDuration(r.watch) : null;
    const platform = r.platform || fallbackPlatform || 'Instagram';
    let postType = 'post';
    if (watchSec !== null && watchSec > 0) postType = 'reel';
    return {
      platform,
      date: r.date || null,
      time: r.time || null,
      text: normalizeText(r.caption) || '',
      comments: parseNumber(r.comments),
      engagement: parseNumber(r.engagement),
      follows: parseNumber(r.follows),
      likes: parseNumber(r.likes),
      reach: parseNumber(r.reach),
      saves: parseNumber(r.saves),
      shares: parseNumber(r.shares),
      views: parseNumber(r.views),
      watchDuration: watchSec,
      postType
    };
  });
}

/* Meta-FB-rijen: watch staat al in seconden */
export function normalizeMetaFacebookRows(rows) {
  return rows.map((r) => {
    const watchSec = (r.watch === null || r.watch === undefined || r.watch === '')
      ? null : parseNumber(r.watch);
    return {
      platform: 'Facebook',
      date: r.date || null, time: r.time || null,
      text: normalizeText(r.caption) || '',
      comments: parseNumber(r.comments),
      engagement: parseNumber(r.engagement),
      follows: null,
      likes: parseNumber(r.likes),
      reach: parseNumber(r.reach),
      saves: null,
      shares: parseNumber(r.shares),
      views: parseNumber(r.views),
      watchDuration: watchSec,
      postType: (watchSec !== null && watchSec > 0) ? 'reel' : 'post'
    };
  });
}

/* validatePosts: markeert verdachte/ongeldige velden */
export function validatePosts(posts) {
  return posts.map((p) => {
    const warnings = [];
    if (!p.date) warnings.push('ongeldige datum');
    if (!p.text) warnings.push('ontbrekende caption');
    ['likes', 'reach', 'views', 'comments', 'shares', 'saves', 'engagement'].forEach((k) => {
      if (p[k] !== null && p[k] < 0) warnings.push('negatief ' + k);
    });
    if (p.watchDuration !== null && p.watchDuration > 7 * 86400) warnings.push('onwaarschijnlijk hoge kijktijd');
    if (p.views === null && p.reach === null) warnings.push('geen bereik/weergaven');
    return { ...p, _warnings: warnings, _valid: warnings.filter((w) => w === 'ongeldige datum').length === 0 };
  });
}
