# H&G marketingdashboard

Dashboard met de organische Facebook- en Instagram-cijfers van Hans & Grietje,
Het Grote Kabouterbos, Heksenblotevoetenpad en De Betovering. De cijfers komen
elke nacht automatisch binnen via de Meta-koppeling; niemand hoeft meer te
exporteren of over te typen.

## Hoe het werkt

```
Meta (Facebook + Instagram)
   │  elke nacht 02:30 UTC: Edge Function meta-sync
   ▼
Supabase (database, inloggen, rechten per vestiging)
   │  alleen-lezen voor de ingelogde gebruiker
   ▼
Dashboard op Vercel (deze map: statische site, geen build-stap)
```

| Onderdeel | Waar |
| --- | --- |
| Pagina's (overzicht, analyse, beheer, inloggen) | `index.html`, `css/`, `js/` |
| Database, rechten, nachtelijke taak | `supabase/migrations/` |
| Meta koppelen / ophalen / AI-samenvatting | `supabase/functions/meta-connect`, `meta-sync`, `ai-summary` |
| Startdata uit de exports van juni/juli 2026 | `supabase/seed_import_2026.sql` (al geladen) |

Rollen: **management** ziet alleen het overzicht, **marketing** ook de analyse en
evenementen, **beheerder** alles plus het beheerscherm. Wie welke vestiging ziet,
regelt de database (Row Level Security), niet de website.

## Supabase-project

`Project marketingdashboard` (ref `saitgqruilgryftbxhtk`) in de organisatie
Hans & Grietje. Schema, functies en nachtelijke taak staan er al in.

## Nog in te stellen (eenmalig)

1. **Inloggen.** Supabase → Authentication → URL Configuration:
   *Site URL* = het Vercel-adres van het dashboard, en hetzelfde adres bij
   *Redirect URLs*. Maak daarna onder Authentication → Users het account
   `hansengrietjezeewolde@outlook.com` aan (Invite user). Dat account wordt
   automatisch beheerder met toegang tot alle vestigingen.
2. **E-mail.** De ingebouwde mailer van Supabase verstuurt maar een paar mails per
   uur. Stel onder Authentication → Emails → SMTP een eigen mailprovider in
   (bijvoorbeeld Resend).
3. **Meta-app.** Op developers.facebook.com een app maken (zakelijk type) met de
   producten *Facebook Login for Business* en *Instagram API with Facebook Login*.
   Geldige OAuth-redirect-URI:
   `https://saitgqruilgryftbxhtk.supabase.co/functions/v1/meta-connect`
4. **Geheimen in Supabase** (Edge Functions → Secrets):
   `META_APP_ID`, `META_APP_SECRET`, `SITE_URL` (het Vercel-adres) en, voor de
   AI-samenvatting, `ANTHROPIC_API_KEY`. Optioneel `META_GRAPH_VERSION`
   (standaard `v25.0`).
5. **Koppelen.** Log in als beheerder → Beheer → *Koppel Meta-account* → inloggen
   bij Facebook en de vier pagina's (met hun Instagram-accounts) aanvinken.
   Daarna *Nu ophalen*. Vanaf dan gaat het elke nacht vanzelf.

## Wat Meta levert (en wat niet)

- Instagram per post: bereik, weergaven, likes, reacties, shares, **saves**,
  nieuwe volgers, profielbezoeken, kijktijd van reels. Per account: volgers,
  nieuwe/vertrokken volgers, bereik bij volgers en niet-volgers, doelgroep
  (vanaf 100 volgers).
- Facebook per post: weergaven, kijkers (unieke weergaven), reacties,
  opmerkingen, deelacties, klikken, videokijktijd. **Geen saves.**
- Cijfers lopen tot 48 uur achter; Meta bewaart maximaal 2 jaar. Daarom slaat
  het systeem elke dag een momentopname op (`post_metrics`, `account_daily`).

## Lokaal bekijken

Open de map met een eenvoudige webserver, bijvoorbeeld
`python3 -m http.server 8000`, en ga naar http://localhost:8000.
