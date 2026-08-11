/* ============================================================
   Import-orchestratie
   ------------------------------------------------------------
   Verbindt de (ongewijzigde) parsers met de Supabase-repository.
   Verantwoordelijk voor:
     - PDF/Excel inlezen -> genormaliseerde posts
     - voorvertoning met dedup/waarschuwingen
     - optioneel originele bestand uploaden naar de private bucket
     - commit: import-record aanmaken, posts schrijven, koppelen
     - terugdraaien van een import
   ============================================================ */

import { getSupabase } from './supabase-client.js';
import { DashboardRepository } from './repository.js';
import {
  parsePdf, parseMetaFacebookPdf, isMetaFacebookPdf,
  normalizeRows, normalizeMetaFacebookRows, validatePosts
} from './pdf-parser.js';
import { parseWorkbook } from './excel-parser.js';
import { dedupKey } from './helpers.js';
import { normalizeText } from './parse-primitives.js';

/* ---- PDF inlezen tot ruwe pdf.js-items ---- */
export async function readPdf(file) {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const allItems = [];
  let rawText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    rawText += content.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
    content.items.forEach((item) => {
      if (item.str && item.str.trim()) {
        allItems.push({ x: item.transform[4], y: item.transform[5], text: item.str, page: p, w: item.width, h: item.height });
      }
    });
  }
  return { allItems, rawText, numPages: pdf.numPages, arrayBuffer: buf };
}

/* Bouwt een importpayload uit een PDF-bestand. Gooit met .error als de
   parser de kolommen niet betrouwbaar kon koppelen. */
export async function buildPdfImport(companyId, file) {
  const { allItems, rawText, numPages } = await readPdf(file);
  const isMetaFb = isMetaFacebookPdf(rawText);
  const parsed = isMetaFb
    ? parseMetaFacebookPdf(allItems, rawText, file.name)
    : parsePdf(allItems, rawText, file.name);
  parsed.diagnostics.pages = numPages;

  if (parsed.error || parsed.rows.length === 0) {
    return {
      companyId, posts: [], diagnostics: parsed.diagnostics,
      meta: { fileName: file.name, fileType: 'pdf', platform: (parsed.profile && parsed.profile.platform) || 'onbekend' },
      error: parsed.error || 'Geen posts herkend in dit PDF-bestand.'
    };
  }
  const normalized = isMetaFb
    ? normalizeMetaFacebookRows(parsed.rows)
    : normalizeRows(parsed.rows, parsed.profile && parsed.profile.platform);
  const validated = validatePosts(normalized);
  return {
    companyId, posts: validated, diagnostics: parsed.diagnostics,
    meta: {
      fileName: file.name, fileType: 'pdf',
      parserProfile: parsed.diagnostics.profile,
      platform: (parsed.profile && parsed.profile.platform) || 'auto'
    }
  };
}

/* Bouwt een importpayload uit een Excel-bestand. */
export async function buildExcelImport(companyId, file) {
  const buf = await file.arrayBuffer();
  const { posts, platforms } = parseWorkbook(buf, file.name);
  if (posts.length === 0) {
    return {
      companyId, posts: [],
      diagnostics: { profile: 'Excel', rawItems: 0, lines: 0, records: 0, headerCols: {}, skipped: [] },
      meta: { fileName: file.name, fileType: 'xlsx', platform: platforms.join(' + ') },
      error: 'Geen herkenbare Facebook- of Instagram-tabel gevonden in dit bestand.'
    };
  }
  const validated = validatePosts(posts);
  return {
    companyId, posts: validated,
    diagnostics: { profile: 'Excel', rawItems: 0, lines: 0, records: posts.length, headerCols: {}, skipped: [] },
    meta: { fileName: file.name, fileType: 'xlsx', parserProfile: 'Excel', platform: platforms.join(' + ') }
  };
}

/* Markeert duplicaten in de payload t.o.v. wat al in Supabase staat. */
export async function annotateDuplicates(payload) {
  const existing = await DashboardRepository.existingDedupKeys(payload.companyId);
  const seen = new Set();
  let dupCount = 0, warnCount = 0, validCount = 0;
  payload.posts.forEach((p) => {
    p.dedupKey = dedupKey(payload.companyId, p);
    p._dup = existing.has(p.dedupKey) || seen.has(p.dedupKey);
    if (p._dup) dupCount++;
    seen.add(p.dedupKey);
    if (p._valid) validCount++;
    if (p._warnings && p._warnings.length) warnCount++;
  });
  return { dupCount, warnCount, validCount };
}

/* Uploadt (optioneel) het originele bestand naar de private bucket.
   Faalt stil (met console-waarschuwing) als de bucket niet bestaat;
   de import zelf gaat gewoon door. Alleen admins mogen dit door RLS. */
export async function uploadOriginal(companyId, file) {
  try {
    const sb = getSupabase();
    const bucket = window.APP_CONFIG.IMPORTS_BUCKET;
    const now = new Date();
    const path = `${companyId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${file.name}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) { console.warn('Bestandsupload overgeslagen:', error.message); return null; }
    return path;
  } catch (e) {
    console.warn('Bestandsupload overgeslagen:', e.message);
    return null;
  }
}

/* Commit: schrijft de goedgekeurde posts naar Supabase, gekoppeld aan
   een import-record. Alleen geldige, niet-duplicerende posts. */
export async function commitImport(payload, file) {
  const toCommit = payload.posts.filter((p) => p._valid && !p._dup);
  const skippedDup = payload.posts.filter((p) => p._dup).length;

  // 1) origineel bestand opslaan (optioneel)
  let storagePath = null;
  if (file) storagePath = await uploadOriginal(payload.companyId, file);

  // 2) import-record aanmaken
  const imp = await DashboardRepository.createImport({
    companyId: payload.companyId,
    fileName: payload.meta.fileName,
    fileType: payload.meta.fileType,
    storagePath,
    parserProfile: payload.meta.parserProfile,
    recordsFound: payload.posts.length,
    recordsValid: payload.posts.filter((p) => p._valid).length,
    diagnostics: payload.diagnostics
  });

  // 3) posts schrijven
  const inserted = await DashboardRepository.createPosts(payload.companyId, toCommit, imp.id);

  // 4) koppelen voor veilige revert
  await DashboardRepository.linkImportPosts(imp.id, inserted.map((p) => p.id), 'insert');

  // 5) import afronden
  await DashboardRepository.completeImport(imp.id, {
    recordsImported: inserted.length,
    recordsSkipped: skippedDup,
    recordsReplaced: 0
  });

  return { importId: imp.id, added: inserted.length, skippedDup };
}
