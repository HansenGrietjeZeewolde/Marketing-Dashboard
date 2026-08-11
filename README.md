# Marketing dashboard — Sprookjeslocaties (Supabase-editie)

Centraal, beveiligd social-media marketingdashboard voor **Hans & Grietje** en de drie zusterlocaties. Alle data staat in **Supabase** (PostgreSQL), afgeschermd met **Row Level Security**. Inloggen gaat via **Supabase Auth** met persoonlijke accounts en twee rollen: `admin` (volledig beheer) en `viewer` (alleen-lezen). De sprookjesvormgeving en alle functies uit build `2026-08-04-v15` zijn behouden; de PDF- en Excel-parsers zijn ongewijzigd overgenomen.

> **Belangrijk:** de opdracht is pas "af" wanneer de verplichte beveiligingstest bij jou groen is. Ik kon die niet voor je draaien — volg de sectie *Verplichte beveiligingstest* hieronder met een echt Supabase-project.

---

## Mapstructuur

```
/
├── index.html            # dashboard (module-app)
├── login.html            # inloggen / wachtwoord vergeten / herstellen
├── css/dashboard.css
├── js/
│   ├── config.js         # publieke config (URL + anon key)
│   ├── env.js            # stub; door Vercel-build overschreven
│   ├── supabase-client.js
│   ├── auth.js           # login, sessie, profiel
│   ├── permissions.js    # UI-rechten (RLS blijft de harde grens)
│   ├── repository.js     # DashboardRepository — enige datalaag
│   ├── parse-primitives.js  # parseDuration etc. (ongewijzigd v15)
│   ├── pdf-parser.js     # (ongewijzigd v15)
│   ├── excel-parser.js   # (ongewijzigd v15)
│   ├── helpers.js        # formatters + dedup-sleutel
│   ├── imports.js        # import-pipeline + storage-upload
│   ├── charts.js         # alle Chart.js-rendering
│   ├── migration.js      # eenmalige localStorage → Supabase
│   ├── users-admin.js    # client voor /api/users
│   ├── users-ui.js       # gebruikersbeheer-modal
│   └── app.js            # hoofdorchestratie
├── api/users/index.js    # serverless: gebruikersbeheer (service role)
├── supabase/
│   ├── schema.sql        # tabellen + is_admin() + triggers
│   ├── policies.sql      # RLS aan + policies + storage-policies
│   └── seed.sql          # de vier vestigingen
├── scripts/build-env.js  # injecteert publieke keys in js/env.js
├── assets/               # logo, heks, snoephuisje, achtergrond
├── vercel.json
├── package.json
├── .env.example
└── README.md
```

---

## 1. Supabase opzetten

1. Maak een project op [supabase.com](https://supabase.com).
2. Ga naar **SQL Editor** en voer in deze volgorde uit:
   1. `supabase/schema.sql`
   2. `supabase/policies.sql`
   3. `supabase/seed.sql`
3. Maak de private opslag-bucket aan (Storage → New bucket):
   - Naam: `marketing-imports`
   - **Public: uit** (laat het vinkje leeg — de bucket moet privé zijn).
   - De toegangspolicies staan al in `policies.sql` (alleen admins).
4. **E-mail/wachtwoord** inschakelen: Authentication → Providers → Email (aan). Voor uitnodigingen: stel bij Authentication → URL Configuration je site-URL en redirect-URL's in (bijv. `https://jouw-app.vercel.app/login.html`).

### Eerste beheerder maken

1. Maak je eigen account aan (via `login.html` van de gedeployde app, of Authentication → Users → Add user).
2. Promoveer jezelf in de SQL Editor:
   ```sql
   update public.profiles
   set role = 'admin', is_active = true
   where email = 'jouw@email.nl';
   ```
3. (Optioneel) koppel jezelf aan alle vestigingen — zie het commentaar onderaan `seed.sql`.

---

## 2. Sleutels invullen

De frontend heeft alleen de **URL** en de **anon/publishable key** nodig (Project Settings → API). Twee opties:

- **GitHub Pages / statisch:** vul ze rechtstreeks in `js/config.js` in.
- **Vercel:** zet ze als env-vars (zie hieronder); de build schrijft `js/env.js` en `config.js` pikt dat automatisch op.

De **service-role key** komt **alleen** in Vercel als server-side env-var (`SUPABASE_SERVICE_ROLE_KEY`) en nergens in de frontend.

---

## 3. Deployen

### Vercel (aanbevolen, inclusief gebruikersbeheer)

De publieke Supabase-URL en anon-key staan al ingevuld in `js/config.js`, dus
de site werkt meteen na deployen. Voor **gebruikersbeheer** (uitnodigen/rol
wijzigen via de knop in de app) heeft de serverless functie `/api/users` nog
twee server-side variabelen nodig:

1. Importeer de repo in Vercel.
2. Settings → Environment Variables — voeg toe (Production + Preview):
   - `SUPABASE_URL` = `https://dswqggzcrqphdqehmikb.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = jouw **service-role** key (Supabase → Project
     Settings → API → service_role). **Alleen hier invullen, nooit in GitHub.**
3. Deploy. De functie `/api/users` komt dan online.

> Zonder deze twee werkt het dashboard volledig; alleen het uitnodigen van
> nieuwe gebruikers via de app werkt dan niet (dat doe je dan in Supabase zelf).

### GitHub Pages (zonder gebruikersbeheer-API)

Werkt volledig, behalve het uitnodigen/rol wijzigen via `/api/users` (dat vereist een server). Vul `js/config.js` handmatig in en push. Gebruikersbeheer doe je dan via het Supabase-dashboard, of host `/api/users` los (bijv. als Supabase Edge Function).

---

## 4. Eenmalige migratie van je oude data

Log in als **admin** in dezelfde browser waar je oude dashboard draaide. Als er `localStorage`-data wordt gevonden, verschijnt automatisch een migratievenster met aantallen per vestiging. Bevestig om posts, volgers en widgets naar Supabase te uploaden (met deduplicatie). **Je lokale data wordt niet verwijderd**, en dubbele migratie wordt voorkomen.

---

## 5. Verplichte beveiligingstest (moet je zelf draaien)

Maak een **vieweraccount** aan (nodig een testgebruiker uit, of maak er één en zet `role='viewer', is_active=true`). Koppel die aan één vestiging. Log als die viewer in en open de browserconsole op het dashboard. Plak (met echte waarden):

```js
const sb = window.supabase.createClient('JOUW_URL', 'JOUW_ANON_KEY');
// gebruik de bestaande sessie:
await sb.auth.setSession((await (await import('./js/supabase-client.js')).getSupabase().auth.getSession()).data.session);

const anyCompany = (await sb.from('companies').select('id').limit(1)).data[0].id;

// Alle onderstaande MOETEN falen (error, geen rij):
console.log('INSERT post',   await sb.from('posts').insert({ company_id: anyCompany, platform:'Facebook', dedup_key:'hack|'+Date.now() }));
console.log('UPDATE post',   await sb.from('posts').update({ likes: 999 }).neq('id','00000000-0000-0000-0000-000000000000'));
console.log('DELETE post',   await sb.from('posts').delete().neq('id','00000000-0000-0000-0000-000000000000'));
console.log('INSERT follower', await sb.from('follower_stats').insert({ company_id: anyCompany, month:'2026-01' }));
console.log('DELETE widget', await sb.from('widgets').delete().neq('id','00000000-0000-0000-0000-000000000000'));
console.log('UPLOAD file',   await sb.storage.from('marketing-imports').upload('hack.txt', new Blob(['x'])));
```

Verwacht: elke actie geeft een RLS-fout of raakt 0 rijen. Test daarnaast:

- Viewer ziet **alleen** de vestiging(en) waaraan hij gekoppeld is (`select * from posts` geeft niets van andere vestigingen).
- Admin kan wél schrijven.
- Zonder sessie (uitgelogd) is geen data zichtbaar.
- De bucket-URL van een geüpload bestand is niet openbaar op te vragen.
- `grep -ri "service_role" js/` en de bundel bevatten de service-role key **niet**.

**De opdracht is niet af zolang één vieweractie nog kan schrijven.**

---

## 6. Acceptatiecriteria (handmatig na te lopen)

1. Admin importeert data op computer A.
2. Viewer logt in op computer B en ziet dezelfde data.
3. Vernieuwen of browserdata wissen verwijdert de centrale data niet.
4. Viewers kunnen niets wijzigen; admins wel.
5. Data blijft per vestiging gescheiden.
6. Alle bestaande functies werken (grafieken, filters, vergelijken, posts, Reels vs posts, kijktijd in minuten, imports, diagnostiek, dedup, widgets, AI-analyse, mobiel, zichtbare buildversie).
7. Het dashboard ziet er vrijwel hetzelfde uit als v15.
8. Alle RLS-tests slagen.

---

## Beveiligingsmodel in het kort

- **Authenticatie:** Supabase Auth (persoonlijke e-mail/wachtwoord).
- **Autorisatie:** RLS-policies in `policies.sql`. Admins: volledige CRUD. Viewers: alleen `SELECT`, en alleen van gekoppelde vestigingen via `company_members`.
- **`is_admin()` / `is_member_of()`:** `SECURITY DEFINER` met vaste `search_path`, zodat policies de rol kunnen bepalen zonder recursie.
- **Gebruikersbeheer:** uitsluitend via `/api/users`, die het admin-token verifieert en server-side de service-role key gebruikt. Een viewer die dit endpoint direct aanroept, wordt server-side geweigerd.
- **UI-rechten** (`[data-admin-only]`) verbergen knoppen voor viewers, maar zijn nooit de beveiliging — RLS is dat.

## Onderhoud

- **Buildversie** staat onderaan het dashboard (`Dashboard build: …`) en helpt om cache-/versiedrift te herkennen — pas `window.DASHBOARD_BUILD` in `index.html` aan bij nieuwe releases.
- **Parsers wijzigen?** Doe dat in `js/pdf-parser.js` / `js/excel-parser.js` en valideer met je fixtures voordat je deployt. De pipeline blijft: parse → normalize → validate → repository.
