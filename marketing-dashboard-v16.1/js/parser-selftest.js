/* ============================================================
   PARSER-REGRESSIETEST (optioneel te laden in de console)
   ------------------------------------------------------------
   Verifieert de kritieke parser-uitkomsten tegen met de hand
   gecontroleerde bronwaarden. Draai dit na elke wijziging aan
   pdf-parser.js of excel-parser.js.

   Gebruik (browserconsole op het dashboard):
     import('./js/parser-selftest.js').then(m => m.runParserSelfTest());

   De PDF-test vereist de ruwe pdf.js-items; geef die mee wanneer je
   ze bij de hand hebt. De Excel-test draait zelfstandig op een
   ingebouwde mini-fixture.
   ============================================================ */

import { parseDuration } from './parse-primitives.js';

/* Verwachte Instagram-PDF-waarden (Hootsuite juli-export HBVP),
   rij voor rij met de PDF vergeleken. watch is in SECONDEN. */
export const IG_PDF_TRUTH = [
  { date: '2026-07-23', time: '13:00', comments: 11, engagement: 69, follows: 0, likes: 37, reach: 1702, watch: 16260, saves: 1,  shares: 14, views: 2450 },
  { date: '2026-07-14', time: '07:00', comments: 1,  engagement: 31, follows: 0, likes: 20, reach: 1251, watch: 8040,  saves: 3,  shares: 7,  views: 1711 },
  { date: '2026-07-03', time: '16:00', comments: 1,  engagement: 14, follows: 0, likes: 7,  reach: 556,  watch: 3960,  saves: 2,  shares: 3,  views: 821 },
  { date: '2026-07-30', time: '13:00', comments: 0,  engagement: 4,  follows: 0, likes: 4,  reach: 411,  watch: 0,     saves: 0,  shares: 0,  views: 1054 },
  { date: '2026-07-28', time: '14:00', comments: 0,  engagement: 6,  follows: 0, likes: 3,  reach: 498,  watch: 1513,  saves: 0,  shares: 3,  views: 655 },
  { date: '2026-07-21', time: '14:00', comments: 0,  engagement: 10, follows: 0, likes: 4,  reach: 843,  watch: 4920,  saves: 3,  shares: 3,  views: 1112 },
  { date: '2026-07-17', time: '12:58', comments: 0,  engagement: 12, follows: 1, likes: 5,  reach: 502,  watch: 0,     saves: 1,  shares: 5,  views: 1167 },
  { date: '2026-07-17', time: '11:04', comments: 0,  engagement: 0,  follows: 0, likes: 0,  reach: 0,    watch: 0,     saves: 0,  shares: 0,  views: 0 },
  { date: '2026-07-10', time: '05:00', comments: 0,  engagement: 10, follows: 0, likes: 6,  reach: 700,  watch: 3660,  saves: 0,  shares: 4,  views: 1030 },
  { date: '2026-07-07', time: '14:00', comments: 0,  engagement: 6,  follows: 0, likes: 5,  reach: 617,  watch: 3384,  saves: 0,  shares: 1,  views: 773 }
];

function nz(v) { return v === null || v === undefined ? 0 : v; }

/* Vergelijkt genormaliseerde posts (uit normalizeRows) met de
   waarheidstabel. Geeft {passed, failed, details}. */
export function checkInstagramPdf(normalizedPosts) {
  const fields = ['comments', 'engagement', 'follows', 'likes', 'reach', 'saves', 'shares', 'views'];
  let passed = 0, failed = 0; const details = [];
  IG_PDF_TRUTH.forEach((exp) => {
    const p = normalizedPosts.find((q) => q.date === exp.date && q.time === exp.time);
    if (!p) { failed++; details.push('ontbreekt: ' + exp.date + ' ' + exp.time); return; }
    const diffs = [];
    fields.forEach((f) => { if (nz(p[f]) !== exp[f]) diffs.push(f + ' ' + nz(p[f]) + '≠' + exp[f]); });
    if (nz(p.watchDuration) !== exp.watch) diffs.push('watch ' + nz(p.watchDuration) + '≠' + exp.watch);
    if (diffs.length) { failed++; details.push(exp.date + ' ' + exp.time + ': ' + diffs.join(', ')); }
    else passed++;
  });
  return { passed, failed, details };
}

/* Zelfstandige duur-checks (kritieke gevallen uit de PDF). */
export function runParserSelfTest() {
  const assert = (cond, msg) => { console.assert(cond, msg); return !!cond; };
  let ok = true;
  ok = assert(parseDuration('4h31m') === 16260, 'watch 4h31m=16260s') && ok;
  ok = assert(parseDuration('25m13s') === 1513, 'watch 25m13s=1513s') && ok;
  ok = assert(parseDuration('56m24s') === 3384, 'watch 56m24s=3384s') && ok;
  ok = assert(parseDuration('0s') === 0, 'watch 0s=0') && ok;
  ok = assert(parseDuration('1h6m') === 3960, 'watch 1h6m=3960s') && ok;
  console.log(ok ? '✓ parser-selftest: duur-checks OK' : '✗ parser-selftest: duur-checks FAALDEN');
  console.log('Voor de volledige PDF-check: import de items en draai checkInstagramPdf(normalizeRows(parsePdf(items,text,name).rows,"Instagram")).');
  return ok;
}
