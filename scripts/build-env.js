/* ============================================================
   build-env.js  (Vercel build step)
   ------------------------------------------------------------
   Schrijft js/env.js met ALLEEN de publieke waarden (URL + anon key)
   uit de omgevingsvariabelen. config.js leest window.__ENV en gebruikt
   die waarden als ze bestaan. De SERVICE-ROLE key wordt hier bewust
   NIET weggeschreven — die blijft server-side.

   Op GitHub Pages draait deze stap niet; vul dan js/config.js handmatig.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const anon = process.env.SUPABASE_ANON_KEY || '';

// Alleen iets injecteren als er echt waarden zijn. Zo overschrijven we
// nooit een reeds ingevulde js/config.js met lege strings.
let payload = {};
if (url) payload.SUPABASE_URL = url;
if (anon) payload.SUPABASE_ANON_KEY = anon;

const out =
  '/* Automatisch gegenereerd door scripts/build-env.js — niet handmatig bewerken. */\n' +
  (Object.keys(payload).length
    ? 'window.__ENV = ' + JSON.stringify(payload) + ';\n'
    : '/* Geen env-vars gezet; js/config.js wordt gebruikt. */\n');

const target = path.join(__dirname, '..', 'js', 'env.js');
fs.writeFileSync(target, out, 'utf8');
console.log('env.js geschreven (url gezet: ' + (!!url) + ', anon gezet: ' + (!!anon) + ')');
