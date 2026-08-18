# Upload-instructies — Marketing dashboard (in één keer naar GitHub)

Deze map bevat de **complete, kloppende** bestandsstructuur voor de repo
`HansenGrietjeZeewolde/Marketing-Dashboard` (de repo die Vercel deployt).

Build in deze versie: **2026-08-18-v16.1-parserfix**

---

## ⚠️ BELANGRIJK — de map `assets/` (afbeeldingen)

Deze download bevat een LEGE map `assets/`. De vier afbeeldingen
(`logo_HG.svg`, `heks.png`, `snoephuisje.png`, `achtergrond.png`) zijn
binaire bestanden die al in je bestaande repo staan. **Verwijder je
huidige `assets/`-map NIET.** Als je die weggooit, is de vormgeving kapot
(logo, heks, snoephuisje en achtergrond verdwijnen).

Kortom: upload alles hieronder, maar **laat de bestaande `assets/`-map met
afbeeldingen staan** zoals hij nu is.

---

## De juiste mappenstructuur (dit is wat er in de repo moet staan)

```
/  (hoofdmap van de repo)
├── index.html
├── login.html
├── package.json
├── vercel.json
├── README.md
├── css/
│   └── dashboard.css
├── js/
│   ├── app.js
│   ├── auth.js
│   ├── charts.js
│   ├── config.js
│   ├── env.js
│   ├── excel-parser.js        ← bijgewerkt (tijd + saves)
│   ├── helpers.js
│   ├── imports.js
│   ├── migration.js
│   ├── parse-primitives.js
│   ├── parser-selftest.js     ← NIEUW (optionele regressietest)
│   ├── pdf-parser.js          ← bijgewerkt (kolomverschuiving opgelost)
│   ├── permissions.js
│   ├── repository.js          ← bijgewerkt (jsonb-waarborg)
│   ├── supabase-client.js
│   ├── users-admin.js
│   └── users-ui.js
├── scripts/
│   └── build-env.js
├── api/
│   └── users/
│       └── index.js
├── assets/                    ← LATEN STAAN (afbeeldingen uit je huidige repo)
│   ├── logo_HG.svg
│   ├── heks.png
│   ├── snoephuisje.png
│   └── achtergrond.png
└── supabase/
    ├── schema.sql
    ├── policies.sql
    ├── seed.sql
    └── migratie_facebook_tijd.sql   ← NIEUW (alleen handmatig in Supabase draaien)
```

De belangrijkste oorzaak van de kapotte pagina (lege data, dode knoppen)
is vrijwel zeker dat de map `js/` eerder "plat" is geworden: dan staan de
scripts los in de hoofdmap en vindt `index.html` ze niet (`js/app.js` enz.).
Zorg dus dat de `js/`-bestanden ECHT in een map `js/` staan, en `build-env.js`
in `scripts/`, en `index.js` in `api/users/`.

---

## Aanbevolen manier van uploaden: GitHub Desktop

GitHub Desktop behoudt de mapstructuur (in tegenstelling tot slepen in de
browser, waar mappen soms plat worden). Zo doe je het:

1. Pak de bestanden uit deze ZIP uit op je computer.
2. Kopieer alle mappen en bestanden naar je lokale repo-map op schijf
   (waar GitHub Desktop naar wijst), en laat GitHub de bestaande bestanden
   overschrijven. **Laat de map `assets/` met afbeeldingen ongemoeid.**
3. Open GitHub Desktop. In de wijzigingenlijst zie je nu o.a.:
   - gewijzigd: index.html, js/pdf-parser.js, js/excel-parser.js, js/repository.js
   - nieuw: js/parser-selftest.js, supabase/migratie_facebook_tijd.sql
4. Schrijf een commit-omschrijving (bv. "Parserfix v16.1: PDF-kolommen,
   Facebook-tijd, saves, jsonb-waarborg") en klik **Commit to main**.
5. Klik **Push origin**.
6. Vercel deployt automatisch. Wacht tot de deploy **Ready** is.

---

## Na het deployen: controleren

1. Open je Vercel-URL (bv. https://marketing-dashboard-si1c-sigma.vercel.app).
2. Doe een **harde ververs** (Cmd+Shift+R). De browser cachet js-bestanden.
3. Scroll naar onderen. Er moet staan:
   **Dashboard build: 2026-08-18-v16.1-parserfix**
   Zie je nog de oude stamp, dan draait er nog een gecachte versie → nogmaals
   hard verversen.
4. Log in, controleer of de data laadt en de navigatieknoppen werken.
5. Test een import (Instagram-PDF en Facebook-Excel) en controleer in de
   voorvertoning: reacties, follows, saves, kijktijd en de Facebook-tijd.

Werkt de pagina daarna nog steeds niet (lege data, dode knoppen), open dan
de browserconsole (rechtsklik → Inspecteren → tabblad Console) en stuur de
rode foutregel door. Dat wijst exact aan wat er nog mist.

---

## Het bestand supabase/migratie_facebook_tijd.sql

Dit hoeft NIET online om het dashboard te laten werken. Je draait het
handmatig in de Supabase SQL Editor, en alleen als je oude Facebook-posts
(die zonder tijd zijn geïmporteerd) wilt opschonen vóór je opnieuw importeert.
Zie de uitleg boven in dat bestand.
