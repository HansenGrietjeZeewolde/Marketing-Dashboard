// =====================================================================
// ai-summary — korte uitleg van een maand ("Wat viel op" / "Wat werkt")
// ---------------------------------------------------------------------
// POST { month: "2026-07-01", location: "alle" | "hg" | ..., screen: "overzicht" | "analyse" }
// Alleen voor beheerders en marketing. Leest de cijfers van die maand en de
// maand ervoor, plus de evenementen, en vraagt Claude om 3–4 korte punten.
// Secrets: ANTHROPIC_API_KEY (optioneel ANTHROPIC_MODEL)
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const LOCS = ["alle", "hg", "kbb", "hbvp", "bb"];

function summarize(rows: any[]) {
  const sum = (k: string) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const reach = sum("reach");
  return {
    posts: rows.length, views: sum("views"), reach, interactions: sum("interactions"),
    engagement_rate_pct: reach ? +(sum("interactions") / reach * 100).toFixed(2) : null,
    saves: sum("saves"), shares: sum("shares")
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!API_KEY) return json({ error: "ANTHROPIC_API_KEY is nog niet ingesteld." }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return json({ error: "Niet ingelogd." }, 401);
  const { data: profile } = await db.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["admin", "marketing"].includes(profile.role)) return json({ error: "Geen toegang." }, 403);

  const { month, location = "alle", screen = "overzicht" } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-01$/.test(month ?? "") || !LOCS.includes(location) || !["overzicht", "analyse"].includes(screen)) {
    return json({ error: "Ongeldige invoer." }, 400);
  }
  if (location !== "alle" && profile.role !== "admin") {
    const { data: m } = await db.from("location_members").select("location_id")
      .eq("user_id", auth.user.id).eq("location_id", location).maybeSingle();
    if (!m) return json({ error: "Geen toegang tot deze locatie." }, 403);
  }

  const start = new Date(month + "T00:00:00Z");
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const prev = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  let q = db.from("post_stats")
    .select("location_id,platform,published_local,media_type,caption,views,reach,likes,comments,shares,saves,interactions")
    .gte("published_local", iso(prev)).lt("published_local", iso(next));
  if (location !== "alle") q = q.eq("location_id", location);
  const { data: posts, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const cur = (posts ?? []).filter((p) => p.published_local >= month);
  const before = (posts ?? []).filter((p) => p.published_local < month);
  if (!cur.length) return json({ error: "Geen posts in deze maand." }, 400);

  let ev = db.from("events").select("location_id,starts_on,ends_on,title")
    .lte("starts_on", iso(next)).or(`ends_on.gte.${month},ends_on.is.null`);
  if (location !== "alle") ev = ev.or(`location_id.eq.${location},location_id.is.null`);
  const { data: events } = await ev;

  const byKey = (rows: any[], key: string) => Object.fromEntries(
    [...new Set(rows.map((r) => r[key]))].map((k) => [k, summarize(rows.filter((r) => r[key] === k))]));
  const top = [...cur].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));
  const brief = (p: any) => ({ locatie: p.location_id, platform: p.platform, moment: p.published_local, soort: p.media_type,
    bereik: p.reach, weergaven: p.views, interacties: p.interactions, tekst: (p.caption ?? "").slice(0, 120) });

  const facts = {
    maand: month, locatie: location, scherm: screen,
    totaal: summarize(cur), vorige_maand: before.length ? summarize(before) : null,
    per_locatie: byKey(cur, "location_id"), per_platform: byKey(cur, "platform"), per_soort: byKey(cur, "media_type"),
    beste_posts: top.slice(0, 3).map(brief), slechtste_posts: top.slice(-3).reverse().map(brief),
    evenementen: events ?? []
  };

  const focus = screen === "overzicht"
    ? "Schrijf voor management: wat ging goed of slecht deze maand en waarom, in begrijpelijke taal."
    : "Schrijf voor het marketingteam: welke soort post, welk moment en welke onderwerpen werkten, en wat ze kunnen proberen.";
  const prompt = `Je bent social-media-analist voor Hans & Grietje (pannenkoekenhuis en speelpark) en drie zusterlocaties.
${focus}
Regels: 3 of 4 punten, elk één zin van maximaal 30 woorden, in het Nederlands, met concrete getallen uit de data.
Koppel pieken of dalen alleen aan een evenement als dat evenement in de lijst staat. Verzin geen cijfers of oorzaken.
"Bereik" is per post opgeteld; vergelijk locaties bij voorkeur op engagement rate.
Antwoord uitsluitend met een JSON-array van strings.

Data:
${JSON.stringify(facts)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 800, messages: [{ role: "user", content: prompt }] })
  });
  const out = await res.json();
  if (!res.ok) return json({ error: out.error?.message ?? "AI-fout" }, 502);
  const text: string = out.content?.find((c: any) => c.type === "text")?.text ?? "";
  let bullets: string[];
  try { bullets = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)); }
  catch { return json({ error: "Onverwacht antwoord van de AI." }, 502); }
  bullets = bullets.filter((b) => typeof b === "string").slice(0, 4);

  const { error: saveErr } = await db.from("ai_summaries").upsert(
    { month, location_key: location, screen, bullets, model: MODEL, created_at: new Date().toISOString() },
    { onConflict: "month,location_key,screen" });
  if (saveErr) return json({ error: saveErr.message }, 500);
  return json({ bullets });
});
