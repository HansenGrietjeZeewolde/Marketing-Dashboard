# Upload in één keer — Marketing dashboard (versie v16.1)

Deze download bevat de COMPLETE, kloppende repo. Build: 2026-08-18-v16.1-parserfix

## De allerbelangrijkste eerste stap: KLOPT HET ADRES?

Je hebt meerdere Vercel-adressen gehad (si1c-sigma, theta-orcin). Zorg dat je
de bestanden pusht naar het GitHub-project dat hoort bij het adres dat jij en
je collega's ECHT gebruiken. Anders upload je naar het verkeerde project en
verandert er niets op de pagina die je test.

Twijfel je? Ga in Vercel naar je project → Settings → Git. Daar staat aan welke
GitHub-repo dit Vercel-project gekoppeld is. Push naar díe repo.

## Wat je uploadt

Alle mappen en bestanden hieronder, met de mapstructuur intact:

```
/  (hoofdmap)
├── index.html            ← BIJGEWERKT (logo + build-stamp + parserfix)
├── login.html
├── package.json
├── vercel.json
├── README.md
├── css/dashboard.css
├── js/                   ← alle scripts (pdf/excel/repository bijgewerkt)
├── scripts/build-env.js
├── api/users/index.js
├── assets/
│   ├── logo_HG.png       ← NIEUW (vervangt de oude logo_HG.svg)
│   ├── snoephuisje.png   ← NIEUW (transparante achtergrond)
│   ├── heks.png          ← LATEN STAAN (zit in je huidige repo)
│   └── achtergrond.png   ← LATEN STAAN (zit in je huidige repo)
└── supabase/             ← schema/policies/seed + migratie_facebook_tijd
```

## Over de afbeeldingen (belangrijk)

In de download zitten AL: logo_HG.png en snoephuisje.png.
NIET in de download (staan al in je repo, laten staan): heks.png, achtergrond.png.

Gooi je bestaande assets-map dus niet helemaal weg. Kopieer de twee nieuwe
afbeeldingen erbij, en laat heks.png en achtergrond.png ongemoeid.

Het oude bestand logo_HG.svg mag je laten staan of weggooien — het wordt niet
meer gebruikt (index.html verwijst nu naar logo_HG.png).

## Uploaden met GitHub Desktop (behoudt de mapstructuur)

1. Pak deze ZIP uit op je computer.
2. Kopieer de mappen over je lokale repo-map heen. Laat heks.png en
   achtergrond.png in assets/ staan.
3. GitHub Desktop toont de wijzigingen. Schrijf een omschrijving
   (bv. "v16.1: parserfix, logo, snoephuisje transparant") → Commit to main.
4. Push origin. Vercel deployt automatisch.

## Na het deployen: controleren

1. Open je Vercel-URL en doe een HARDE ververs: Cmd+Shift+R.
2. Scroll naar onderen. Er moet staan: Dashboard build: 2026-08-18-v16.1-parserfix
   Staat er iets anders? Dan draait nog de oude versie → nogmaals hard verversen,
   of je pushte naar het verkeerde project (zie bovenaan).
3. Logo bovenin en snoephuisje onderin moeten nu goed staan.
4. Test een import. Werkt de importfout ("invalid input syntax for type json")
   nog steeds? Open dan de browserconsole (rechtsklik → Inspecteren → Console),
   importeer opnieuw, en stuur een screenshot van de rode foutregel.
