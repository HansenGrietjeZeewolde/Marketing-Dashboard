/* ============================================================
   Publieke frontend-configuratie
   ------------------------------------------------------------
   ALLEEN de Supabase-URL en de ANON/PUBLISHABLE key horen hier.
   Deze twee zijn per definitie publiek (ze staan toch in de browser);
   de beveiliging komt volledig van Row Level Security in de database.

   De SERVICE-ROLE key hoort HIER NOOIT. Die staat alleen server-side
   als omgevingsvariabele in de Vercel-functie (zie /api/users).

   Twee manieren om deze waarden te zetten:
   1. Direct hieronder invullen (simpel, voor GitHub Pages / statische host).
   2. Via een build-stap window.__ENV injecteren (Vercel). Als window.__ENV
      bestaat, wint dat.
   ============================================================ */
(function () {
  const injected = (typeof window !== 'undefined' && window.__ENV) || {};

  window.APP_CONFIG = {
    SUPABASE_URL:
      injected.SUPABASE_URL ||
      'https://JOUW-PROJECT.supabase.co',            // <-- VERVANG
    SUPABASE_ANON_KEY:
      injected.SUPABASE_ANON_KEY ||
      'JOUW_SUPABASE_ANON_OF_PUBLISHABLE_KEY',        // <-- VERVANG
    // Bucket voor originele PDF/Excel-bestanden (privaat).
    IMPORTS_BUCKET: 'marketing-imports'
  };

  window.APP_CONFIG_READY =
    !/JOUW-PROJECT|JOUW_SUPABASE/.test(
      window.APP_CONFIG.SUPABASE_URL + window.APP_CONFIG.SUPABASE_ANON_KEY
    );
})();
