"""
Kruimelpad Live Dashboard - Backend (productieversie)
FastAPI applicatie die verkoopdata combineert van:
  1. Handmatige invoer (fallback)
  2. eCash API (productie)

Beveiliging: Basic Authentication op alle endpoints.
"""

import json
import os
import secrets
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ============================================================
# CONFIGURATIE (via environment variables)
# ============================================================

BASE_DIR = Path(__file__).parent
DOELEN_FILE = BASE_DIR / "data" / "doelen.json"
HANDMATIG_FILE = BASE_DIR / "data" / "verkopen_handmatig.json"
HISTORIE_FILE = BASE_DIR / "data" / "historie.json"
ECASH_TOKEN_FILE = BASE_DIR / "data" / "ecash_state.json"

# Zorg dat data-map bestaat
(BASE_DIR / "data").mkdir(exist_ok=True)

# Beveiliging
DASHBOARD_USER = os.getenv("DASHBOARD_USER", "personeel")
DASHBOARD_PASS = os.getenv("DASHBOARD_PASS", "VeranderDit123!")

# eCash API (volgens hun documentatie)
ECASH_BASE_URL = os.getenv("ECASH_BASE_URL", "")  # bijv. https://hansengriet.ecash.nl
ECASH_API_KEY = os.getenv("ECASH_API_KEY", "")

# Cache voor eCash data
CACHE_DUUR_SECONDEN = 60  # eCash adviseert min. 60s tussen polls
_cache = {"data": {}, "tijdstip": None}


# ============================================================
# BEVEILIGING
# ============================================================

security = HTTPBasic()


def check_auth(credentials: HTTPBasicCredentials = Depends(security)):
    """Controleert gebruikersnaam en wachtwoord via Basic Auth."""
    correct_user = secrets.compare_digest(credentials.username, DASHBOARD_USER)
    correct_pass = secrets.compare_digest(credentials.password, DASHBOARD_PASS)
    if not (correct_user and correct_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Onjuiste inloggegevens",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


# ============================================================
# DATA MODELLEN
# ============================================================

class Verkoop(BaseModel):
    productnaam: str
    aantal_verkocht: int
    doel: int
    percentage: float
    kleur: str


class HandmatigeInvoer(BaseModel):
    standen: Dict[str, int]


class DoelUpdate(BaseModel):
    productnaam: str
    doel: int


# ============================================================
# JSON BESTANDEN BEHEER
# ============================================================

def _lees_json(pad: Path, standaard: dict) -> dict:
    if not pad.exists():
        _schrijf_json(pad, standaard)
        return standaard
    with open(pad, "r", encoding="utf-8") as f:
        return json.load(f)


def _schrijf_json(pad: Path, data: dict) -> None:
    pad.parent.mkdir(parents=True, exist_ok=True)
    with open(pad, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def lees_doelen() -> Dict[str, int]:
    return _lees_json(DOELEN_FILE, {
        "Bere Portie": 110,
        "Heksen Nacho's": 80,
        "Heksen Limonade": 250,
        "Toverknetter": 120,
        "Speciaalbier": 205,
    })


def schrijf_doelen(doelen: Dict[str, int]) -> None:
    _schrijf_json(DOELEN_FILE, doelen)


def lees_handmatig() -> dict:
    return _lees_json(HANDMATIG_FILE, {
        "datum": date.today().isoformat(),
        "standen": {},
        "laatst_bijgewerkt": None,
    })


def schrijf_handmatig(data: dict) -> None:
    _schrijf_json(HANDMATIG_FILE, data)


def lees_historie() -> dict:
    return _lees_json(HISTORIE_FILE, {})


def schrijf_historie(data: dict) -> None:
    _schrijf_json(HISTORIE_FILE, data)


def lees_ecash_state() -> dict:
    """Bewaart cumulatieve eCash-cijfers per dag."""
    return _lees_json(ECASH_TOKEN_FILE, {
        "datum": date.today().isoformat(),
        "verkopen_per_product": {},
    })


def schrijf_ecash_state(data: dict) -> None:
    _schrijf_json(ECASH_TOKEN_FILE, data)


# ============================================================
# eCASH API CLIENT (volgens hun officiële documentatie)
# ============================================================

async def haal_ecash_op_en_verwerk() -> Dict[str, int]:
    """
    Haalt nieuwe verkopen op uit eCash via de pending → ack flow.
    Telt verkopen per productnaam bij elkaar op voor vandaag.
    """
    if not ECASH_BASE_URL or not ECASH_API_KEY:
        return {}

    state = lees_ecash_state()

    # Reset bij nieuwe dag
    vandaag = date.today().isoformat()
    if state.get("datum") != vandaag:
        state = {"datum": vandaag, "verkopen_per_product": {}}

    headers = {"X-Api-Key": ECASH_API_KEY}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Stap 1: Ophalen
            response = await client.get(
                f"{ECASH_BASE_URL}/sales/api/sales/pending",
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()

            token = data.get("token")
            records = data.get("records", [])

            if not token or not records:
                return state["verkopen_per_product"]

            # Stap 2: Verwerken
            for orderpart in records:
                # Filter op datum (alleen vandaag)
                created = orderpart.get("createdAt", "")
                if not created.startswith(vandaag):
                    continue

                for line in orderpart.get("lines", []):
                    if line.get("type") != "item":
                        continue
                    productnaam = line.get("itemName", "").strip()
                    quantity = line.get("quantity", 0)
                    if productnaam:
                        huidig = state["verkopen_per_product"].get(productnaam, 0)
                        state["verkopen_per_product"][productnaam] = huidig + quantity

            # Stap 3: Bevestigen
            await client.post(
                f"{ECASH_BASE_URL}/sales/api/sales/ack/{token}",
                headers=headers,
            )

            # Sla nieuwe stand op
            schrijf_ecash_state(state)

    except httpx.HTTPStatusError as e:
        print(f"⚠️  eCash HTTP fout: {e.response.status_code}")
    except Exception as e:
        print(f"⚠️  eCash fout: {e}")

    return state["verkopen_per_product"]


async def haal_ecash_per_product() -> Dict[str, int]:
    """Met caching: niet vaker dan elke 60 seconden ophalen."""
    nu = datetime.now()
    if (
        _cache["tijdstip"] is not None
        and (nu - _cache["tijdstip"]).total_seconds() < CACHE_DUUR_SECONDEN
    ):
        return _cache["data"]

    _cache["data"] = await haal_ecash_op_en_verwerk()
    _cache["tijdstip"] = nu
    return _cache["data"]


# ============================================================
# BUSINESS LOGICA
# ============================================================

def bepaal_kleur(percentage: float) -> str:
    if percentage < 50:
        return "rood"
    elif percentage < 80:
        return "oranje"
    else:
        return "groen"


async def gecombineerde_verkopen() -> Dict[str, int]:
    """Telt handmatige invoer + eCash data bij elkaar op."""
    handmatig = lees_handmatig().get("standen", {})
    ecash = await haal_ecash_per_product()

    alle_producten = set(handmatig.keys()) | set(ecash.keys())
    return {
        product: handmatig.get(product, 0) + ecash.get(product, 0)
        for product in alle_producten
    }


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(title="Kruimelpad Dashboard API", docs_url=None, redoc_url=None)

# CORS (in productie strenger maken indien nodig)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- BEVEILIGDE ENDPOINTS -----

@app.get("/api/voortgang", response_model=List[Verkoop])
async def get_voortgang(user: str = Depends(check_auth)):
    doelen = lees_doelen()
    verkopen = await gecombineerde_verkopen()

    resultaat = []
    for productnaam, doel in doelen.items():
        verkocht = verkopen.get(productnaam, 0)
        percentage = (verkocht / doel * 100) if doel > 0 else 0
        resultaat.append(Verkoop(
            productnaam=productnaam,
            aantal_verkocht=max(0, verkocht),
            doel=doel,
            percentage=round(max(0, percentage), 1),
            kleur=bepaal_kleur(percentage),
        ))
    return resultaat


@app.get("/api/doelen")
def get_doelen(user: str = Depends(check_auth)):
    return lees_doelen()


@app.put("/api/doelen")
def update_doelen(doelen: Dict[str, int], user: str = Depends(check_auth)):
    schrijf_doelen(doelen)
    return {"status": "ok", "aantal_doelen": len(doelen)}


@app.post("/api/doelen/single")
def update_enkel_doel(update: DoelUpdate, user: str = Depends(check_auth)):
    doelen = lees_doelen()
    doelen[update.productnaam] = update.doel
    schrijf_doelen(doelen)
    return {"status": "ok"}


@app.delete("/api/doelen/{productnaam}")
def verwijder_doel(productnaam: str, user: str = Depends(check_auth)):
    doelen = lees_doelen()
    if productnaam not in doelen:
        raise HTTPException(status_code=404, detail="Doel niet gevonden")
    del doelen[productnaam]
    schrijf_doelen(doelen)
    return {"status": "ok"}


@app.get("/api/handmatig")
def get_handmatig(user: str = Depends(check_auth)):
    return lees_handmatig()


@app.put("/api/handmatig")
def update_handmatig(invoer: HandmatigeInvoer, user: str = Depends(check_auth)):
    huidig = lees_handmatig()
    vandaag = date.today().isoformat()

    if huidig.get("datum") != vandaag:
        huidig = {"datum": vandaag, "standen": {}, "laatst_bijgewerkt": None}

    for productnaam, aantal in invoer.standen.items():
        huidig["standen"][productnaam] = max(0, int(aantal))

    huidig["laatst_bijgewerkt"] = datetime.now().isoformat(timespec="seconds")
    schrijf_handmatig(huidig)

    return {
        "status": "ok",
        "standen": huidig["standen"],
        "laatst_bijgewerkt": huidig["laatst_bijgewerkt"],
    }


@app.post("/api/handmatig/reset")
def reset_handmatig(user: str = Depends(check_auth)):
    huidig = lees_handmatig()
    if huidig.get("standen"):
        historie = lees_historie()
        datum = huidig.get("datum", date.today().isoformat())
        historie[datum] = huidig["standen"]
        schrijf_historie(historie)

    nieuwe_data = {
        "datum": date.today().isoformat(),
        "standen": {},
        "laatst_bijgewerkt": datetime.now().isoformat(timespec="seconds"),
    }
    schrijf_handmatig(nieuwe_data)

    return {"status": "ok", "bericht": "Verkopen gereset naar 0"}


@app.get("/api/historie")
def get_historie(user: str = Depends(check_auth)):
    return lees_historie()


# ----- STATIC FILES (frontend) -----

FRONTEND_DIR = BASE_DIR / "static"
if FRONTEND_DIR.exists():
    @app.get("/")
    def root(user: str = Depends(check_auth)):
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str, user: str = Depends(check_auth)):
        # Probeer specifiek bestand
        bestand = FRONTEND_DIR / full_path
        if bestand.is_file():
            return FileResponse(bestand)
        # Anders: stuur index.html terug (SPA-routing)
        return FileResponse(FRONTEND_DIR / "index.html")
else:
    @app.get("/")
    def root():
        return {"app": "Kruimelpad Dashboard", "status": "running"}
