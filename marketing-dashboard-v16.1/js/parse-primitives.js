/* ============================================================
   DATACONVERSIE-PRIMITIEVEN
   ------------------------------------------------------------
   Ongewijzigd overgenomen uit build 2026-08-04-v15. Deze functies
   zijn uitvoerig getest (o.a. parseDuration) en worden bewust NIET
   aangepast tijdens de Supabase-ombouw.
   ============================================================ */

export function normalizeText(v) {
  return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();
}

export function parseNumber(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '—' || s === '–') return null;
  const n = parseFloat(s.replace(/\s/g, '').replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

export function parsePercentage(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim().replace('%', '').replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function parseDuration(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim().toLowerCase();
  if (s === '' || s === '-' || s === '—' || s === '–') return null;
  if (s === '0' || s === '0s' || s === '0m' || s === '0h') return 0;
  let m = s.match(/^(\d+):(\d{2}):(\d{2}(?:[.,]\d+)?)$/);
  if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3].replace(',', '.'));
  m = s.match(/^(\d+):(\d{2}(?:[.,]\d+)?)$/);
  if (m) return (+m[1]) * 60 + parseFloat(m[2].replace(',', '.'));
  let total = 0, matched = false;
  let d = s.match(/(\d+(?:[.,]\d+)?)\s*d(?:ay|agen|ag)?/);
  if (d) { total += parseFloat(d[1].replace(',', '.')) * 86400; matched = true; }
  let h = s.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hour|uur|u)/);
  if (h) { total += parseFloat(h[1].replace(',', '.')) * 3600; matched = true; }
  let mn = s.match(/(\d+(?:[.,]\d+)?)\s*m(?:in)?(?![s])/);
  if (mn) { total += parseFloat(mn[1].replace(',', '.')) * 60; matched = true; }
  let sec = s.match(/(\d+(?:[.,]\d+)?)\s*s(?:ec)?/);
  if (sec) { total += parseFloat(sec[1].replace(',', '.')); matched = true; }
  if (matched) return total;
  if (/^\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'));
  return null;
}

export const MONTHS_EN = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
export const MONTHS_NL = { jan: 0, feb: 1, mrt: 2, maa: 2, apr: 3, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };

export function monthIndex(name) {
  const k = String(name || '').slice(0, 4).toLowerCase().replace(/\.$/, '');
  const k3 = k.slice(0, 3);
  if (MONTHS_EN[k3] !== undefined) return MONTHS_EN[k3];
  if (MONTHS_NL[k3] !== undefined) return MONTHS_NL[k3];
  if (MONTHS_EN[k] !== undefined) return MONTHS_EN[k];
  if (MONTHS_NL[k] !== undefined) return MONTHS_NL[k];
  return -1;
}

export function parseDate(str, yearHint) {
  const s = String(str || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0].slice(0, 10);
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})/);
  if (m) {
    const mi = monthIndex(m[1]);
    if (mi > -1) {
      const y = yearHint || new Date().getFullYear();
      const d = new Date(Date.UTC(y, mi, parseInt(m[2], 10)));
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
  }
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s*(\d{4})?/);
  if (m) {
    const mi = monthIndex(m[2]);
    if (mi > -1) {
      const y = m[3] ? parseInt(m[3], 10) : (yearHint || new Date().getFullYear());
      const d = new Date(Date.UTC(y, mi, parseInt(m[1], 10)));
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
  }
  const dd = new Date(s);
  if (!isNaN(dd)) return dd.toISOString().slice(0, 10);
  return null;
}

export function extractYearHint(text, fileName) {
  const src = (text || '') + ' ' + (fileName || '');
  let m = src.match(/(?:from|van)\s+\d{1,2}\s+\w+,?\s+(20\d{2})/i);
  if (m) return parseInt(m[1], 10);
  m = src.match(/\b(20\d{2})\b/);
  if (m) return parseInt(m[1], 10);
  m = (fileName || '').match(/(20\d{2})\d{4}/);
  if (m) return parseInt(m[1], 10);
  return new Date().getFullYear();
}

/* Zelftest (blijft als regressiecheck in de console). */
console.assert(parseDuration('9h 8m') === 32880, 'parseDuration 9h 8m');
console.assert(parseDuration('9 h 8 m') === 32880, 'parseDuration 9 h 8 m');
console.assert(parseDuration('9h') === 32400, 'parseDuration 9h');
console.assert(parseDuration('8m') === 480, 'parseDuration 8m');
