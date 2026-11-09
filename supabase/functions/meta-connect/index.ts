// =====================================================================
// meta-connect — Meta-account koppelen (eenmalig, door een beheerder)
// ---------------------------------------------------------------------
// 1. Dashboard  → POST {action:"start"} met de inlogsessie van een beheerder
//                 ← { url } naar het Facebook-toestemmingsscherm
// 2. Facebook   → GET ?code=…&state=… (terug naar deze functie)
//    Deze functie wisselt de code in voor een langlevende sleutel, haalt de
//    Facebookpagina's + gekoppelde Instagram-accounts op, koppelt ze aan de
//    juiste vestiging en bewaart de paginasleutels afgeschermd.
// 3. Terug naar het dashboard: SITE_URL/#/beheer?meta=ok
//
// Secrets: META_APP_ID, META_APP_SECRET, SITE_URL (optioneel META_GRAPH_VERSION)
// Instellen in de Meta-app: geldige OAuth-redirect-URI =
//   https://<project>.supabase.co/functions/v1/meta-connect
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = Deno.env.get("META_GRAPH_VERSION") ?? "v25.0";
const APP_ID = Deno.env.get("META_APP_ID") ?? "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-connect`;
const SCOPES = [
  "pages_show_list", "pages_read_engagement", "read_insights",
  "instagram_basic", "instagram_manage_insights", "business_management"
];

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const back = (query: string) => Response.redirect(`${SITE_URL}/#/beheer?${query}`, 302);

async function graph(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Graph-fout ${res.status}`);
  return body;
}

// Paginanaam → vestiging, als de Page-ID nog niet bekend is.
function guessLocation(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("kabouter")) return "kbb";
  if (n.includes("heksenblote") || n.includes("blotevoet")) return "hbvp";
  if (n.includes("betovering")) return "bb";
  if (n.includes("hans") && n.includes("grietje")) return "hg";
  return null;
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return null;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", data.user.id).single();
  return profile?.role === "admin" ? data.user : null;
}

async function handleCallback(url: URL) {
  if (url.searchParams.get("error")) return back("meta=geweigerd");
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const { data: userId } = await admin.rpc("meta_take_state", { p_state: state });
  if (!userId) return back("meta=verlopen");

  // code → korte sleutel → langlevende gebruikerssleutel (±60 dagen)
  const short = await graph("oauth/access_token", {
    client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: REDIRECT_URI, code
  });
  const long = await graph("oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: APP_ID, client_secret: APP_SECRET,
    fb_exchange_token: short.access_token
  });

  // Paginasleutels die van een langlevende gebruikerssleutel komen verlopen niet.
  const pages = await graph("me/accounts", {
    access_token: long.access_token,
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "100"
  });

  const { data: known } = await admin.from("social_accounts").select("id,location_id,platform,external_id");
  let linked = 0;
  const skipped: string[] = [];

  for (const page of pages.data ?? []) {
    const existing = (known ?? []).find((a) => a.platform === "facebook" && a.external_id === page.id);
    const location = existing?.location_id ?? guessLocation(page.name);
    if (!location) { skipped.push(page.name); continue; }

    const { data: fb, error: fbErr } = await admin.from("social_accounts")
      .upsert({ location_id: location, platform: "facebook", external_id: page.id, handle: page.name, connected: true },
        { onConflict: "location_id,platform" })
      .select("id").single();
    if (fbErr) throw fbErr;
    await admin.rpc("meta_save_token", { p_account: fb.id, p_token: page.access_token, p_expires: null });
    linked++;

    const ig = page.instagram_business_account;
    if (ig?.id) {
      const { data: igRow, error: igErr } = await admin.from("social_accounts")
        .upsert({ location_id: location, platform: "instagram", external_id: ig.id, handle: ig.username ?? null, connected: true },
          { onConflict: "location_id,platform" })
        .select("id").single();
      if (igErr) throw igErr;
      await admin.rpc("meta_save_token", { p_account: igRow.id, p_token: page.access_token, p_expires: null });
      linked++;
    }
  }

  const q = new URLSearchParams({ meta: "ok", gekoppeld: String(linked) });
  if (skipped.length) q.set("overgeslagen", skipped.join(", "));
  return back(q.toString());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!APP_ID || !APP_SECRET || !SITE_URL) {
    return json({ error: "META_APP_ID, META_APP_SECRET en SITE_URL zijn nog niet ingesteld." }, 500);
  }
  const url = new URL(req.url);
  try {
    if (req.method === "GET") return await handleCallback(url);

    const user = await requireAdmin(req);
    if (!user) return json({ error: "Alleen een beheerder kan Meta koppelen." }, 403);

    const state = crypto.randomUUID();
    await admin.rpc("meta_save_state", { p_state: state, p_user: user.id });
    const dialog = new URL(`https://www.facebook.com/${GRAPH}/dialog/oauth`);
    dialog.searchParams.set("client_id", APP_ID);
    dialog.searchParams.set("redirect_uri", REDIRECT_URI);
    dialog.searchParams.set("state", state);
    dialog.searchParams.set("scope", SCOPES.join(","));
    dialog.searchParams.set("response_type", "code");
    return json({ url: dialog.toString() });
  } catch (e) {
    console.error(e);
    if (req.method === "GET") return back("meta=fout&melding=" + encodeURIComponent(String((e as Error).message ?? e)));
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
