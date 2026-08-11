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

const out =
  '/* Automatisch gegenereerd door scripts/build-env.js — niet handmatig bewerken. */\n' +
  'window.__ENV = ' +
  JSON.stringify({ SUPABASE_URL: url, SUPABASE_ANON_KEY: anon }) +
  ';\n';

const target = path.join(__dirname, '..', 'js', 'env.js');
fs.writeFileSync(target, out, 'utf8');
console.log('env.js geschreven (url gezet: ' + (!!url) + ', anon gezet: ' + (!!anon) + ')');
