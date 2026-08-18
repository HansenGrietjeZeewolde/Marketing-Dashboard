/* ============================================================
   Gedeelde UI-helpers en dedup-sleutel
   ------------------------------------------------------------
   fmtDuration/isReel/dedupKey ongewijzigd overgenomen uit v15.
   De dedup-sleutel gebruikt company_id + platform + datum + tijd +
   postType + captionprefix; bewust ZONDER postType uit te sluiten is
   niet nodig — v15 sluit postType juist wél in via de sleutel-array.
   ============================================================ */

import { normalizeText } from './parse-primitives.js';

export function monthKey(d) { return (d || '').slice(0, 7); }

export function fmtNum(n) { return Math.round(n || 0).toLocaleString('nl-NL'); }

export function fmtDuration(sec) {
  if (sec === null || sec === undefined || isNaN(+sec)) return '—';
  const minutes = Math.max(0, +sec) / 60;
  return minutes.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' min';
}

export function isReel(p) { return p.postType ? p.postType === 'reel' : (p.watchDuration || 0) > 0; }
export function postTypeLabel(p) { return isReel(p) ? 'Reel' : 'Post'; }

/* Kapt een tekst veilig af op maximaal `max` UTF-16-eenheden ZONDER een
   emoji (of ander teken uit twee code-eenheden) middendoor te knippen.
   Zonder deze bescherming kon een afgekapte emoji een "lone surrogate"
   opleveren; dat is ongeldige JSON en zorgde bij het importeren voor de
   fout "invalid input syntax for type json" in de database. */
function safeSlice(str, max) {
  let s = String(str || '').slice(0, max);
  // Eindigt de afkapping op de eerste helft van een surrogaatpaar
  // (high surrogate D800–DBFF)? Dan die halve emoji weglaten.
  const lastCode = s.charCodeAt(s.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    s = s.slice(0, -1);
  }
  return s;
}

/* Stabiele dedup-sleutel per vestiging. companyId zit in de sleutel;
   de uniciteit wordt ook door de DB-index (company_id, dedup_key)
   afgedwongen. */
export function dedupKey(companyId, p) {
  const prefix = safeSlice(normalizeText(p.text).toLowerCase(), 24);
  return [companyId, p.platform, p.date || '', (p.time || ''), p.postType || '', prefix].join('|');
}
