# Kruimelpad Dashboard

Live verkoop-dashboard voor Hans & Grietje Pannenkoekenhuis.

## Wat zit erin?

- **backend/** — Python FastAPI met eCash-koppeling en handmatige invoer
- **frontend/** — React dashboard met Hans & Grietje styling
- **Dockerfile** — voor deployment op Railway

## Beveiliging

Toegang vereist Basic Auth (gebruikersnaam + wachtwoord). Configureer via Railway environment variables:

- `DASHBOARD_USER` — gebruikersnaam (bijv. "personeel")
- `DASHBOARD_PASS` — wachtwoord
- `ECASH_BASE_URL` — eCash API basis-URL
- `ECASH_API_KEY` — eCash API-sleutel

## Lokale ontwikkeling

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (nieuwe terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Deployment

Zie `HANDLEIDING_HOSTING.docx` voor stap-voor-stap deployment naar Railway.
