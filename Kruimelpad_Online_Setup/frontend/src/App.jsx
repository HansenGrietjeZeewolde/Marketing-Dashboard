import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// In productie: gebruik relatieve URLs (zelfde domein als frontend)
// In ontwikkeling: gebruik localhost
const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8000";
const POLL_INTERVAL_MS = 30000;
const TOEGANGSCODE = "4921";

const KLEUREN = {
  rood: "#dc2626",
  oranje: "#ea580c",
  groen: "#16a34a",
};

export default function App() {
  const [voortgang, setVoortgang] = useState([]);
  const [laatsteUpdate, setLaatsteUpdate] = useState(null);
  const [scherm, setScherm] = useState("dashboard");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const haalDataOp = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/voortgang`);
        const data = await response.json();
        setVoortgang(data);
        setLaatsteUpdate(new Date());
      } catch (error) {
        console.error("Fout bij ophalen data:", error);
      }
    };
    haalDataOp();
    const interval = setInterval(haalDataOp, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const ververs = () => setRefresh((r) => r + 1);

  return (
    <div style={styles.app}>
      <div style={styles.achtergrond} />
      <img src="/hans.png" alt="Hans" style={styles.hansHoek} />
      <img src="/grietje.png" alt="Grietje" style={styles.grietjeHoek} />

      <div style={styles.content}>
        <header style={styles.header}>
          <div style={styles.headerInhoud}>
            <img src="/logo_HG.svg" alt="Hans & Grietje" style={styles.logo} />
            <div style={styles.titelBlok}>
              <h1 style={styles.titel}>Het Kruimelpad</h1>
              <p style={styles.ondertitel}>
                Live verkoop-dashboard · Samen sprokkelen, samen belonen
              </p>
            </div>
          </div>
          <div style={styles.headerRechts}>
            {laatsteUpdate && (
              <span style={styles.update}>
                ⏱ Bijgewerkt: {laatsteUpdate.toLocaleTimeString("nl-NL")}
              </span>
            )}
            <button
              onClick={() => setScherm(scherm === "doelen" ? "dashboard" : "doelen")}
              style={styles.knopSecondair}
            >
              🎯 Doelen
            </button>
            <button
              onClick={() => setScherm(scherm === "dashboard" ? "login" : "dashboard")}
              style={styles.knop}
            >
              {scherm === "dashboard" ? "📝 Verkopen invoeren" : "← Terug"}
            </button>
          </div>
        </header>

        {scherm === "doelen" && <DoelenBeheer onSluiten={() => setScherm("dashboard")} />}
        {scherm === "login" && (
          <ToegangsScherm
            onCorrect={() => setScherm("invoer")}
            onAnnuleer={() => setScherm("dashboard")}
          />
        )}
        {scherm === "invoer" && (
          <VerkopenInvoer
            onSluiten={() => { setScherm("dashboard"); ververs(); }}
            onReset={ververs}
          />
        )}
        {scherm === "dashboard" && (
          <main style={styles.grid}>
            {voortgang.length === 0 ? (
              <div style={styles.leeg}>
                <p style={styles.leegTekst}>
                  🌲 Nog geen verkopen vandaag... wachten op de eerste Kruimels!
                </p>
              </div>
            ) : (
              voortgang.map((p) => <ProductCard key={p.productnaam} product={p} />)
            )}
          </main>
        )}
        <footer style={styles.footer}>
          <p style={styles.footerTekst}>
            🍪 Hans &amp; Grietje Pannenkoekenhuis · Sternweg 2A
          </p>
        </footer>
      </div>
    </div>
  );
}

function ProductCard({ product }) {
  const { productnaam, aantal_verkocht, doel, percentage, kleur } = product;
  const kleurHex = KLEUREN[kleur];
  const [animPercentage, setAnimPercentage] = useState(0);

  useEffect(() => {
    const start = animPercentage;
    const eind = Math.min(percentage, 100);
    const duur = 600;
    const startTijd = Date.now();
    const tick = () => {
      const verstreken = Date.now() - startTijd;
      const t = Math.min(verstreken / duur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimPercentage(start + (eind - start) * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentage]);

  const data = [
    { naam: "gevuld", waarde: animPercentage },
    { naam: "leeg", waarde: 100 - animPercentage },
  ];
  const doelBehaald = percentage >= 100;

  return (
    <div style={{ ...styles.kaart, borderTop: `5px solid ${kleurHex}`,
                  ...(doelBehaald ? styles.kaartBehaald : {}) }}>
      <h2 style={styles.productNaam}>{productnaam}</h2>
      <div style={styles.donutContainer}>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={62} outerRadius={88}
                 startAngle={90} endAngle={-270} dataKey="waarde" stroke="none"
                 isAnimationActive={false}>
              <Cell fill={kleurHex} />
              <Cell fill="#f5e6d3" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={styles.donutCentrum}>
          <div style={{ ...styles.percentage, color: kleurHex }}>
            {Math.round(percentage)}%
          </div>
        </div>
      </div>
      <div style={styles.cijfers}>
        <span style={styles.verkocht}>{aantal_verkocht}</span>
        <span style={styles.doelTekst}> / {doel} verkocht</span>
      </div>
      {doelBehaald && (
        <div style={styles.behaald}>
          <img src="/snoephuisje.png" alt="Snoephuisje" style={styles.snoephuisje} />
          <span style={styles.behaaldTekst}>Doel behaald!</span>
        </div>
      )}
    </div>
  );
}

function ToegangsScherm({ onCorrect, onAnnuleer }) {
  const [code, setCode] = useState("");
  const [foutmelding, setFoutmelding] = useState("");
  const [schudt, setSchudt] = useState(false);

  const probeer = () => {
    if (code === TOEGANGSCODE) {
      onCorrect();
    } else {
      setFoutmelding("Verkeerde toegangscode. Probeer opnieuw.");
      setSchudt(true);
      setCode("");
      setTimeout(() => setSchudt(false), 500);
    }
  };

  return (
    <div style={styles.formPaneel}>
      <div style={{ ...styles.loginVak, ...(schudt ? styles.schud : {}) }}>
        <h3 style={styles.formTitel}>🔐 Toegang vereist</h3>
        <p style={styles.formUitleg}>
          Voer de toegangscode in om verkopen te kunnen invoeren.
        </p>
        <input type="password" inputMode="numeric" autoFocus
               placeholder="Toegangscode" value={code}
               onChange={(e) => setCode(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && probeer()}
               style={styles.loginInput} />
        {foutmelding && <p style={styles.foutmelding}>⚠ {foutmelding}</p>}
        <div style={styles.loginKnoppen}>
          <button onClick={onAnnuleer} style={styles.knopAnnuleer}>Annuleren</button>
          <button onClick={probeer} style={styles.formOpslaan}>Inloggen</button>
        </div>
      </div>
    </div>
  );
}

function VerkopenInvoer({ onSluiten, onReset }) {
  const [doelen, setDoelen] = useState({});
  const [standen, setStanden] = useState({});
  const [laatstBijgewerkt, setLaatstBijgewerkt] = useState(null);
  const [bezigOpslaan, setBezigOpslaan] = useState(false);
  const [bevestiging, setBevestiging] = useState("");
  const [resetVraag, setResetVraag] = useState(false);

  useEffect(() => {
    const laden = async () => {
      const [doelenRes, handmatigRes] = await Promise.all([
        fetch(`${API_BASE}/api/doelen`).then((r) => r.json()),
        fetch(`${API_BASE}/api/handmatig`).then((r) => r.json()),
      ]);
      setDoelen(doelenRes);
      const huidig = handmatigRes.standen || {};
      const compleet = {};
      Object.keys(doelenRes).forEach((p) => { compleet[p] = huidig[p] ?? 0; });
      setStanden(compleet);
      setLaatstBijgewerkt(handmatigRes.laatst_bijgewerkt);
    };
    laden();
  }, []);

  const wijzigStand = (product, waarde) => {
    const n = parseInt(waarde, 10);
    setStanden({ ...standen, [product]: isNaN(n) || n < 0 ? 0 : n });
  };

  const opslaan = async () => {
    setBezigOpslaan(true);
    setBevestiging("");
    try {
      const response = await fetch(`${API_BASE}/api/handmatig`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ standen }),
      });
      const data = await response.json();
      setLaatstBijgewerkt(data.laatst_bijgewerkt);
      setBevestiging("✓ Opgeslagen!");
      onReset();
      setTimeout(() => setBevestiging(""), 2000);
    } catch (error) {
      setBevestiging("⚠ Opslaan mislukt");
    } finally {
      setBezigOpslaan(false);
    }
  };

  const resetAllesNaarNul = async () => {
    try {
      await fetch(`${API_BASE}/api/handmatig/reset`, { method: "POST" });
      const lege = {};
      Object.keys(doelen).forEach((p) => (lege[p] = 0));
      setStanden(lege);
      setBevestiging("✓ Alles gereset naar 0");
      setResetVraag(false);
      onReset();
      setTimeout(() => setBevestiging(""), 2500);
    } catch (error) {
      setBevestiging("⚠ Reset mislukt");
    }
  };

  return (
    <div style={styles.formPaneel}>
      <div style={styles.invoerHeader}>
        <div>
          <h3 style={styles.formTitel}>📝 Verkopen invoeren</h3>
          <p style={styles.formUitleg}>
            Voer de huidige stand per product in (cumulatief: het totaal verkocht vandaag).
          </p>
        </div>
        {laatstBijgewerkt && (
          <div style={styles.laatstBijgewerkt}>
            Laatst opgeslagen om {new Date(laatstBijgewerkt).toLocaleTimeString("nl-NL", {
              hour: "2-digit", minute: "2-digit",
            })}
          </div>
        )}
      </div>
      <div style={styles.invoerLijst}>
        {Object.entries(doelen).map(([product, doel]) => (
          <div key={product} style={styles.invoerRij}>
            <div style={styles.invoerProduct}>
              <span style={styles.invoerNaam}>{product}</span>
              <span style={styles.invoerDoel}>doel: {doel}</span>
            </div>
            <input type="number" min="0" value={standen[product] ?? 0}
                   onChange={(e) => wijzigStand(product, e.target.value)}
                   style={styles.invoerVeld} />
            <span style={styles.invoerEenheid}>verkocht</span>
          </div>
        ))}
      </div>
      <div style={styles.invoerKnoppen}>
        {!resetVraag ? (
          <button onClick={() => setResetVraag(true)} style={styles.knopReset}>
            ↺ Reset naar 0
          </button>
        ) : (
          <div style={styles.resetBevestig}>
            <span style={styles.resetTekst}>Zeker weten?</span>
            <button onClick={resetAllesNaarNul} style={styles.knopGevaar}>Ja, reset</button>
            <button onClick={() => setResetVraag(false)} style={styles.knopAnnuleer}>Nee</button>
          </div>
        )}
        <div style={styles.invoerKnoppenRechts}>
          {bevestiging && (
            <span style={{ ...styles.bevestiging,
                           color: bevestiging.startsWith("✓") ? "#16a34a" : "#dc2626" }}>
              {bevestiging}
            </span>
          )}
          <button onClick={opslaan} disabled={bezigOpslaan}
                  style={{ ...styles.formOpslaan, opacity: bezigOpslaan ? 0.6 : 1 }}>
            {bezigOpslaan ? "Bezig..." : "💾 Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DoelenBeheer({ onSluiten }) {
  const [doelen, setDoelen] = useState({});
  const [nieuwProduct, setNieuwProduct] = useState("");
  const [nieuwDoel, setNieuwDoel] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/doelen`).then((r) => r.json()).then(setDoelen);
  }, []);

  const opslaan = async () => {
    await fetch(`${API_BASE}/api/doelen`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doelen),
    });
    onSluiten();
  };

  const voegToe = () => {
    if (nieuwProduct && nieuwDoel) {
      setDoelen({ ...doelen, [nieuwProduct]: parseInt(nieuwDoel, 10) });
      setNieuwProduct("");
      setNieuwDoel("");
    }
  };

  const verwijder = (naam) => {
    const k = { ...doelen };
    delete k[naam];
    setDoelen(k);
  };

  return (
    <div style={styles.formPaneel}>
      <h3 style={styles.formTitel}>🎯 Dagdoelen aanpassen</h3>
      <p style={styles.formUitleg}>Productnaam moet exact overeenkomen met de naam in eCash.</p>
      {Object.entries(doelen).map(([naam, waarde]) => (
        <div key={naam} style={styles.formRij}>
          <span style={styles.formNaam}>{naam}</span>
          <input type="number" value={waarde}
                 onChange={(e) => setDoelen({ ...doelen, [naam]: parseInt(e.target.value, 10) || 0 })}
                 style={styles.formInput} />
          <button onClick={() => verwijder(naam)} style={styles.formVerwijder}>×</button>
        </div>
      ))}
      <div style={{ ...styles.formRij, marginTop: "16px" }}>
        <input type="text" placeholder="Nieuwe productnaam" value={nieuwProduct}
               onChange={(e) => setNieuwProduct(e.target.value)}
               style={{ ...styles.formInput, flex: 1 }} />
        <input type="number" placeholder="Doel" value={nieuwDoel}
               onChange={(e) => setNieuwDoel(e.target.value)}
               style={styles.formInput} />
        <button onClick={voegToe} style={styles.formToevoegen}>+ Toevoegen</button>
      </div>
      <button onClick={opslaan} style={styles.formOpslaan}>💾 Opslaan</button>
    </div>
  );
}

const styles = {
  app: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
         minHeight: "100vh", position: "relative", overflow: "hidden", background: "#fdf6e8" },
  achtergrond: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                 backgroundImage: "url('/achtergrond.png')", backgroundSize: "cover",
                 backgroundPosition: "center bottom", backgroundRepeat: "no-repeat",
                 opacity: 0.4, zIndex: 0 },
  hansHoek: { position: "fixed", bottom: "20px", left: "20px", height: "180px",
              zIndex: 1, pointerEvents: "none", opacity: 0.95,
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))" },
  grietjeHoek: { position: "fixed", bottom: "20px", right: "20px", height: "180px",
                 zIndex: 1, pointerEvents: "none", opacity: 0.95,
                 filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))" },
  content: { position: "relative", zIndex: 2, padding: "24px 32px",
             maxWidth: "1400px", margin: "0 auto" },
  header: { background: "rgba(255, 255, 255, 0.92)", borderRadius: "20px",
            padding: "20px 28px", marginBottom: "24px", display: "flex",
            justifyContent: "space-between", alignItems: "center", flexWrap: "wrap",
            gap: "16px", boxShadow: "0 8px 24px rgba(75, 36, 8, 0.12)",
            border: "3px solid #d4a574" },
  headerInhoud: { display: "flex", alignItems: "center", gap: "20px" },
  logo: { height: "85px", width: "auto" },
  titelBlok: { display: "flex", flexDirection: "column" },
  titel: { margin: 0, color: "#7c2d12", fontSize: "30px", fontWeight: "bold" },
  ondertitel: { margin: "4px 0 0 0", color: "#92400e", fontSize: "14px", fontStyle: "italic" },
  headerRechts: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  update: { color: "#78716c", fontSize: "14px", background: "#fef3e7",
            padding: "6px 12px", borderRadius: "8px", border: "1px solid #fcd9b6" },
  knop: { background: "linear-gradient(135deg, #ec4899 0%, #d97706 100%)",
          color: "white", border: "none", padding: "10px 20px", borderRadius: "10px",
          cursor: "pointer", fontWeight: "bold", fontSize: "14px",
          boxShadow: "0 4px 12px rgba(217, 119, 6, 0.3)" },
  knopSecondair: { background: "white", color: "#7c2d12", border: "2px solid #d4a574",
                   padding: "8px 18px", borderRadius: "10px", cursor: "pointer",
                   fontWeight: "bold", fontSize: "14px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "20px", marginBottom: "200px" },
  kaart: { background: "rgba(255, 255, 255, 0.95)", borderRadius: "16px", padding: "20px",
           boxShadow: "0 6px 20px rgba(75, 36, 8, 0.1)", border: "2px solid #f5e6d3",
           transition: "all 0.3s ease" },
  kaartBehaald: { background: "linear-gradient(135deg, #fef3e7 0%, #fce7f3 100%)",
                  border: "2px solid #f59e0b", boxShadow: "0 8px 24px rgba(245, 158, 11, 0.25)" },
  productNaam: { margin: "0 0 12px 0", fontSize: "18px", color: "#7c2d12",
                 textAlign: "center", fontWeight: "bold" },
  donutContainer: { position: "relative" },
  donutCentrum: { position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%, -50%)", textAlign: "center" },
  percentage: { fontSize: "34px", fontWeight: "bold" },
  cijfers: { textAlign: "center", marginTop: "10px", paddingTop: "10px",
             borderTop: "1px dashed #e7d3b8" },
  verkocht: { fontSize: "26px", fontWeight: "bold", color: "#7c2d12" },
  doelTekst: { fontSize: "16px", color: "#92400e" },
  behaald: { textAlign: "center", marginTop: "12px", display: "flex",
             flexDirection: "column", alignItems: "center", gap: "4px" },
  snoephuisje: { height: "60px", width: "auto",
                 filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))" },
  behaaldTekst: { color: "#16a34a", fontWeight: "bold", fontSize: "16px" },
  leeg: { gridColumn: "1/-1", background: "rgba(255, 255, 255, 0.85)", padding: "40px",
          borderRadius: "16px", border: "2px dashed #d4a574", textAlign: "center" },
  leegTekst: { color: "#92400e", fontSize: "18px", fontStyle: "italic", margin: 0 },
  footer: { textAlign: "center", marginTop: "32px", paddingBottom: "20px" },
  footerTekst: { color: "#78716c", fontSize: "13px", fontStyle: "italic" },
  formPaneel: { background: "rgba(255, 255, 255, 0.96)", padding: "28px",
                borderRadius: "16px", marginBottom: "24px",
                boxShadow: "0 6px 20px rgba(75, 36, 8, 0.12)", border: "2px solid #d4a574" },
  formTitel: { margin: "0 0 8px 0", color: "#7c2d12", fontSize: "22px" },
  formUitleg: { color: "#92400e", fontSize: "14px", marginTop: 0,
                marginBottom: "20px", fontStyle: "italic" },
  formRij: { display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" },
  formNaam: { flex: 1, fontWeight: "500", color: "#7c2d12" },
  formInput: { padding: "8px 12px", border: "2px solid #d4a574", borderRadius: "6px",
               width: "120px", fontSize: "14px", fontFamily: "inherit" },
  formVerwijder: { background: "#dc2626", color: "white", border: "none",
                   width: "30px", height: "30px", borderRadius: "6px", cursor: "pointer",
                   fontSize: "18px", fontWeight: "bold" },
  formToevoegen: { background: "#16a34a", color: "white", border: "none",
                   padding: "8px 14px", borderRadius: "6px", cursor: "pointer",
                   fontWeight: "bold" },
  formOpslaan: { background: "linear-gradient(135deg, #ec4899 0%, #d97706 100%)",
                 color: "white", border: "none", padding: "12px 24px",
                 borderRadius: "10px", cursor: "pointer", fontWeight: "bold",
                 fontSize: "15px", boxShadow: "0 4px 12px rgba(217, 119, 6, 0.3)" },
  loginVak: { maxWidth: "400px", margin: "20px auto", textAlign: "center" },
  loginInput: { padding: "14px 16px", border: "2px solid #d4a574", borderRadius: "10px",
                fontSize: "20px", width: "100%", boxSizing: "border-box",
                textAlign: "center", letterSpacing: "8px", fontFamily: "inherit" },
  loginKnoppen: { display: "flex", gap: "12px", justifyContent: "center", marginTop: "16px" },
  schud: { animation: "shake 0.4s" },
  foutmelding: { color: "#dc2626", margin: "12px 0 0 0", fontSize: "14px", fontWeight: "bold" },
  knopAnnuleer: { background: "white", color: "#7c2d12", border: "2px solid #d4a574",
                  padding: "10px 20px", borderRadius: "10px", cursor: "pointer",
                  fontWeight: "bold" },
  invoerHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
  laatstBijgewerkt: { background: "#fef3e7", padding: "8px 14px", borderRadius: "8px",
                      fontSize: "13px", color: "#7c2d12", border: "1px solid #fcd9b6" },
  invoerLijst: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" },
  invoerRij: { display: "flex", alignItems: "center", gap: "16px", padding: "14px 18px",
               background: "#fef9f0", border: "1px solid #f5e6d3", borderRadius: "10px" },
  invoerProduct: { flex: 1, display: "flex", flexDirection: "column", gap: "2px" },
  invoerNaam: { fontWeight: "bold", color: "#7c2d12", fontSize: "16px" },
  invoerDoel: { color: "#92400e", fontSize: "13px" },
  invoerVeld: { width: "100px", padding: "10px 12px", border: "2px solid #d4a574",
                borderRadius: "8px", fontSize: "18px", fontWeight: "bold",
                textAlign: "center", color: "#7c2d12", fontFamily: "inherit" },
  invoerEenheid: { color: "#92400e", fontSize: "14px", minWidth: "70px" },
  invoerKnoppen: { display: "flex", justifyContent: "space-between", alignItems: "center",
                   flexWrap: "wrap", gap: "12px", paddingTop: "12px",
                   borderTop: "1px solid #f5e6d3" },
  invoerKnoppenRechts: { display: "flex", alignItems: "center", gap: "12px" },
  bevestiging: { fontWeight: "bold", fontSize: "14px" },
  knopReset: { background: "white", color: "#92400e", border: "2px solid #d4a574",
               padding: "8px 16px", borderRadius: "8px", cursor: "pointer",
               fontWeight: "500", fontSize: "13px" },
  knopGevaar: { background: "#dc2626", color: "white", border: "none",
                padding: "8px 16px", borderRadius: "8px", cursor: "pointer",
                fontWeight: "bold", fontSize: "13px" },
  resetBevestig: { display: "flex", alignItems: "center", gap: "8px",
                   background: "#fef2f2", padding: "6px 12px", borderRadius: "8px",
                   border: "1px solid #fca5a5" },
  resetTekst: { color: "#7f1d1d", fontSize: "13px", fontWeight: "500" },
};

if (typeof document !== "undefined" && !document.getElementById("kruimelpad-anim")) {
  const stijl = document.createElement("style");
  stijl.id = "kruimelpad-anim";
  stijl.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      75% { transform: translateX(8px); }
    }
  `;
  document.head.appendChild(stijl);
}
