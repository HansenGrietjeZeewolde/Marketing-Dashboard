// =====================================================================
// meta-sync — haalt elke nacht de cijfers op bij Meta
// ---------------------------------------------------------------------
// Aanroep:  POST /functions/v1/meta-sync   body: { "days": 35 }
//   - door de nachtelijke cron (header x-sync-secret, gecontroleerd tegen Vault), of
//   - door een beheerder via de knop in het dashboard.
// Per gekoppeld account:
//   Facebook-pagina  volgers, dagcijfers (weergaven, kijkers, volgers erbij/eraf,
//                    betrokkenheid) en per post: weergaven, kijkers, reacties,
//                    opmerkingen, deelacties, klikken, videokijktijd.
//   Instagram        volgers, dagcijfers (weergaven, bereik volgers/niet-volgers,
//                    interacties, volgers erbij/eraf, linkklikken), per post:
//                    bereik, weergaven, likes, reacties, shares, saves,
//                    volgers, profielbezoeken, kijktijd reels; doelgroep (wekelijks).
// Cijfers die Meta (nog) niet levert worden overgeslagen, niet als 0 opgeslagen.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = Deno.env.get("META_GRAPH_VERSION") ?? "v25.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SYNC_SECRET = Deno.env.get("SYNC_SECRET") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Graph-hulpfuncties ----------
type Params = Record<string, string | number>;
async function graph(path: string, token: string, params: Params = {}) {
  const url = new URL(path.startsWith("http") ? path : `https://graph.facebook.com/${GRAPH}/${path}`);
  if (!path.startsWith("http")) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    url.searchParams.set("access_token", token);
  }
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Graph-fout ${res.status}`);
  return body;
}

async function* paged(path: string, token: string, params: Params, stop: (row: any) => boolean) {
  let page = await graph(path, token, params);
  while (page) {
    for (const row of page.data ?? []) {
      if (stop(row)) return;
      yield row;
    }
    page = page.paging?.next ? await graph(page.paging.next, token) : null;
  }
}

// Vraagt metrics in één keer op; faalt dat, dan één voor één (Meta schrapt
// regelmatig metrics). Ontbrekende metrics komen niet in het resultaat.
async function insights(id: string, token: string, metrics: string[], params: Params, warn: string[]) {
  const read = (body: any) => {
    const out: Record<string, any> = {};
    for (const m of body.data ?? []) {
      out[m.name] = m.total_value ?? m.values?.[0]?.value ?? null;
    }
    return out;
  };
  try {
    return read(await graph(`${id}/insights`, token, { ...params, metric: metrics.join(",") }));
  } catch {
    const out: Record<string, any> = {};
    for (const metric of metrics) {
      try { Object.assign(out, read(await graph(`${id}/insights`, token, { ...params, metric }))); }
      catch (e) { warn.push(`${metric}: ${(e as Error).message}`); }
    }
    return out;
  }
}

const num = (v: unknown) => (typeof v === "number" ? Math.round(v) : v && typeof v === "object" && "value" in (v as any) ? Math.round((v as any).value) : null);
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const sumObj = (o: unknown) => (o && typeof o === "object" ? Object.values(o as Record<string, number>).reduce((a, b) => a + (b || 0), 0) : null);
const breakdown = (tv: any, key: string) =>
  tv?.breakdowns?.[0]?.results?.find((r: any) => r.dimension_values?.[0] === key)?.value ?? null;

// ---------- Facebook-pagina ----------
async function syncFacebook(acc: any, since: Date, today: string, warn: string[]) {
  const t = acc.access_token;
  const page = await graph(acc.external_id, t, { fields: "followers_count,name" });

  // Dagcijfers (Meta: maximaal 90 dagen per verzoek). end_time valt op de
  // ochtend ná de dag waar het getal bij hoort.
  const dailyStart = new Date(Math.max(since.getTime(), Date.now() - 89 * 86400000));
  const daily = await graph(`${acc.external_id}/insights`, t, {
    metric: "page_daily_follows_unique,page_daily_unfollows_unique,page_media_view,page_total_media_view_unique,page_post_engagements",
    period: "day", since: unix(dailyStart), until: unix(new Date())
  }).catch((e) => { warn.push(`dagcijfers: ${e.message}`); return { data: [] }; });
  const days: Record<string, any> = {};
  const map: Record<string, string> = {
    page_daily_follows_unique: "follows", page_daily_unfollows_unique: "unfollows",
    page_media_view: "views", page_total_media_view_unique: "reach", page_post_engagements: "total_interactions"
  };
  for (const m of daily.data ?? []) {
    for (const v of m.values ?? []) {
      const day = isoDay(new Date(new Date(v.end_time).getTime() - 12 * 3600000));
      days[day] ??= { account_id: acc.account_id, location_id: acc.location_id, platform: "facebook", day,
        follows: null, unfollows: null, views: null, reach: null, total_interactions: null, followers_total: null };
      days[day][map[m.name]] = num(v.value);
    }
  }
  days[today] ??= { account_id: acc.account_id, location_id: acc.location_id, platform: "facebook", day: today,
    follows: null, unfollows: null, views: null, reach: null, total_interactions: null, followers_total: null };
  days[today].followers_total = page.followers_count ?? null;
  // stand van vandaag apart bewaren zodat oudere dagen hun volgersstand houden
  const rows = Object.values(days);
  const { error: dErr } = await db.from("account_daily").upsert(rows.filter((r: any) => r.day !== today).map((r: any) => {
    const { followers_total: _f, ...rest } = r; return rest;
  }), { onConflict: "account_id,day" });
  if (dErr) throw dErr;
  await db.from("account_daily").upsert(days[today], { onConflict: "account_id,day" });

  // Posts
  let n = 0;
  for await (const p of paged(`${acc.external_id}/posts`, t, {
    fields: "id,created_time,message,permalink_url,full_picture,attachments{media_type,type},shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)",
    since: unix(since), limit: 50
  }, () => false)) {
    const att = p.attachments?.data?.[0];
    const link = p.permalink_url ?? "";
    const media_type = link.includes("/reel/") ? "reel"
      : att?.media_type === "video" ? "video"
      : att?.media_type === "album" ? "carousel"
      : att?.media_type === "photo" ? "photo"
      : att?.media_type === "link" ? "link"
      : p.message ? "text" : "other";

    const { data: post, error } = await db.from("posts").upsert({
      account_id: acc.account_id, location_id: acc.location_id, platform: "facebook",
      external_id: p.id, published_at: p.created_time, media_type,
      caption: p.message ?? null, permalink: link || null, thumbnail_url: p.full_picture ?? null, source: "api"
    }, { onConflict: "account_id,external_id" }).select("id").single();
    if (error) throw error;

    const isVideo = media_type === "reel" || media_type === "video";
    const ins = await insights(p.id, t, [
      "post_media_view", "post_total_media_view_unique", "post_clicks", "post_reactions_by_type_total",
      ...(isVideo ? ["post_video_avg_time_watched", "post_video_view_time_organic", "post_video_views_organic"] : [])
    ], { period: "lifetime" }, warn);

    const likes = p.reactions?.summary?.total_count ?? sumObj(ins.post_reactions_by_type_total);
    const comments = p.comments?.summary?.total_count ?? null;
    const shares = p.shares?.count ?? 0;
    await db.from("post_metrics").upsert({
      post_id: post.id, captured_on: today,
      views: num(ins.post_media_view), reach: num(ins.post_total_media_view_unique),
      likes, comments, shares, clicks: num(ins.post_clicks),
      total_interactions: likes != null && comments != null ? likes + comments + shares : null,
      reactions: ins.post_reactions_by_type_total ?? null,
      video_views: num(ins.post_video_views_organic),
      watch_time_avg_sec: ins.post_video_avg_time_watched != null ? ins.post_video_avg_time_watched / 1000 : null,
      watch_time_total_sec: ins.post_video_view_time_organic != null ? ins.post_video_view_time_organic / 1000 : null
    }, { onConflict: "post_id,captured_on" });
    n++;
  }
  return n;
}

// ---------- Instagram ----------
async function syncInstagram(acc: any, since: Date, today: string, warn: string[]) {
  const t = acc.access_token;
  const user = await graph(acc.external_id, t, { fields: "followers_count,username" });
  await db.from("social_accounts").update({ handle: user.username }).eq("id", acc.account_id);

  // Dagcijfers: de laatste 3 dagen opnieuw (Meta loopt tot 48 uur achter).
  for (let i = 3; i >= 1; i--) {
    const d0 = addDays(new Date(today + "T00:00:00Z"), -i);
    const p = { period: "day", metric_type: "total_value", since: unix(d0), until: unix(addDays(d0, 1)) };
    const base = await insights(acc.external_id, t, ["views", "accounts_engaged", "total_interactions", "profile_links_taps"], p, warn);
    const reach = await insights(acc.external_id, t, ["reach"], { ...p, breakdown: "follow_type" }, warn);
    const follows = await insights(acc.external_id, t, ["follows_and_unfollows"], { ...p, breakdown: "follow_type" }, warn);
    await db.from("account_daily").upsert({
      account_id: acc.account_id, location_id: acc.location_id, platform: "instagram", day: isoDay(d0),
      views: num(base.views), accounts_engaged: num(base.accounts_engaged),
      total_interactions: num(base.total_interactions), profile_link_taps: num(base.profile_links_taps),
      reach: num(reach.reach), reach_followers: breakdown(reach.reach, "FOLLOWER"),
      reach_non_followers: breakdown(reach.reach, "NON_FOLLOWER"),
      follows: breakdown(follows.follows_and_unfollows, "FOLLOWER"),
      unfollows: breakdown(follows.follows_and_unfollows, "NON_FOLLOWER")
    }, { onConflict: "account_id,day" });
  }
  await db.from("account_daily").upsert({
    account_id: acc.account_id, location_id: acc.location_id, platform: "instagram", day: today,
    followers_total: user.followers_count ?? null
  }, { onConflict: "account_id,day" });

  // Posts (nieuwste eerst; stoppen zodra we voorbij het venster zijn)
  let n = 0;
  for await (const m of paged(`${acc.external_id}/media`, t, {
    fields: "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count",
    limit: 50
  }, (row) => new Date(row.timestamp) < since)) {
    const media_type = m.media_product_type === "REELS" ? "reel"
      : m.media_product_type === "STORY" ? "story"
      : m.media_type === "CAROUSEL_ALBUM" ? "carousel"
      : m.media_type === "VIDEO" ? "video" : "photo";
    const { data: post, error } = await db.from("posts").upsert({
      account_id: acc.account_id, location_id: acc.location_id, platform: "instagram",
      external_id: m.id, published_at: m.timestamp, media_type, caption: m.caption ?? null,
      permalink: m.permalink ?? null, thumbnail_url: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url : null) ?? null,
      source: "api"
    }, { onConflict: "account_id,external_id" }).select("id").single();
    if (error) throw error;

    const metrics = media_type === "reel"
      ? ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]
      : ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions", "follows", "profile_visits"];
    const ins = await insights(m.id, t, metrics, {}, warn);
    await db.from("post_metrics").upsert({
      post_id: post.id, captured_on: today,
      reach: num(ins.reach), views: num(ins.views),
      likes: num(ins.likes) ?? m.like_count ?? null, comments: num(ins.comments) ?? m.comments_count ?? null,
      shares: num(ins.shares), saves: num(ins.saved), follows: num(ins.follows),
      profile_visits: num(ins.profile_visits), total_interactions: num(ins.total_interactions),
      watch_time_avg_sec: ins.ig_reels_avg_watch_time != null ? ins.ig_reels_avg_watch_time / 1000 : null,
      watch_time_total_sec: ins.ig_reels_video_view_total_time != null ? ins.ig_reels_video_view_total_time / 1000 : null
    }, { onConflict: "post_id,captured_on" });
    n++;
  }

  // Doelgroep: één keer per week (Meta: top 45, vanaf 100 volgers)
  const { data: recent } = await db.from("audience").select("captured_on")
    .eq("account_id", acc.account_id).gte("captured_on", isoDay(addDays(new Date(), -7))).limit(1);
  if (!recent?.length) {
    const rows: any[] = [];
    for (const dimension of ["age", "gender", "city", "country"]) {
      try {
        const body = await graph(`${acc.external_id}/insights`, t, {
          metric: "follower_demographics", period: "lifetime", metric_type: "total_value",
          timeframe: "this_month", breakdown: dimension
        });
        for (const r of body.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
          rows.push({ account_id: acc.account_id, location_id: acc.location_id, captured_on: today,
            kind: "followers", dimension, value: String(r.dimension_values?.[0]), count: r.value });
        }
      } catch (e) { warn.push(`doelgroep ${dimension}: ${(e as Error).message}`); }
    }
    if (rows.length) await db.from("audience").upsert(rows, { onConflict: "account_id,captured_on,kind,dimension,value" });
  }
  return n;
}

// ---------- Ingang ----------
// Eén aanroep per account: elk account krijgt zo een eigen functie-aanroep
// met eigen tijd- en rekenlimiet. De hoofdaanroep verdeelt alleen het werk.
const INTERNAL = "x-sync-internal";

async function allowed(req: Request) {
  if (req.headers.get(INTERNAL) === SERVICE_KEY) return "intern";
  const secret = req.headers.get("x-sync-secret");
  if (secret) {
    if (SYNC_SECRET && secret === SYNC_SECRET) return "cron";
    const { data: ok } = await db.rpc("meta_check_sync_secret", { p_secret: secret });
    return ok ? "cron" : null;
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).single();
  return p?.role === "admin" ? `beheerder ${data.user.email}` : null;
}

async function syncOne(acc: any, days: number) {
  const since = addDays(new Date(), -days);
  const today = isoDay(new Date());
  const warn: string[] = [];
  const base = { account: acc.account_id, location: acc.location_id, platform: acc.platform };
  try {
    const posts = acc.platform === "facebook"
      ? await syncFacebook(acc, since, today, warn)
      : await syncInstagram(acc, since, today, warn);
    await db.from("social_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", acc.account_id);
    return { ...base, posts, warnings: warn.slice(0, 20) };
  } catch (e) {
    return { ...base, error: (e as Error).message, warnings: warn.slice(0, 20) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await allowed(req);
  if (!who) return json({ error: "Geen toegang." }, 403);

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body.days) || 35, 1), 730);
  const { data: accounts, error } = await db.rpc("meta_accounts_for_sync");
  if (error) return json({ error: error.message }, 500);

  // Deelopdracht: één account ophalen.
  if (who === "intern") {
    const acc = (accounts ?? []).find((a: any) => a.account_id === body.account_id);
    if (!acc) return json({ error: "Onbekend account." }, 404);
    return json(await syncOne(acc, days));
  }

  // Oude rondes die nooit klaar kwamen als afgebroken markeren.
  await db.from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(),
    details: [{ error: "Afgebroken: tijd- of rekenlimiet van de functie bereikt" }] })
    .is("finished_at", null).lt("started_at", new Date(Date.now() - 10 * 60000).toISOString());

  const { data: run } = await db.from("sync_runs").insert({ triggered_by: who }).select("id").single();
  const details = await Promise.all((accounts ?? []).map(async (acc: any) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, [INTERNAL]: SERVICE_KEY },
        body: JSON.stringify({ account_id: acc.account_id, days })
      });
      const out = await res.json().catch(() => ({ error: `Functie gaf status ${res.status}` }));
      return res.ok ? out : { account: acc.account_id, location: acc.location_id, platform: acc.platform, error: out.error ?? out.msg ?? `status ${res.status}` };
    } catch (e) {
      return { account: acc.account_id, location: acc.location_id, platform: acc.platform, error: (e as Error).message };
    }
  }));
  const failed = details.filter((d: any) => d.error).length;
  const status = failed === 0 ? "ok" : failed < details.length ? "partial" : "error";
  await db.from("sync_runs").update({ finished_at: new Date().toISOString(), status, details }).eq("id", run?.id);
  return json({ status, accounts: details.length, details });
});
