import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx, type D1Database } from "./_utils";

// ---------------------------------------------------------------------------
// PAGEVIEW BEACON (privacy-friendly analytics, no cookies, no third parties)
//
// The SPA POSTs { path, ref } on every route change (see src/lib/analytics.ts).
// Each hit is stored in D1 with: day, path, referrer DOMAIN (not the full URL),
// country (from Cloudflare's edge), device class, browser family, and a DAILY
// visitor hash — sha256(ip + user-agent + day + salt), truncated. The raw IP is
// NEVER stored, and the hash rotates every midnight, so nobody can be tracked
// across days. That's what makes "unique visitors" possible without cookies.
//
// Not counted: bots (UA test), the owner/admins (session check), /admin and
// /account pages. Rows older than ~180 days are pruned opportunistically.
// ---------------------------------------------------------------------------

const BOT_RE =
  /bot|crawl|spider|slurp|preview|fetch|scrape|curl|wget|python|httpx|headless|lighthouse|gptbot|chatgpt|claude|anthropic|perplexity|bytespider|semrush|ahrefs/i;

export const ensureHitsTable = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS analytics_hits (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         ts TEXT NOT NULL,
         day TEXT NOT NULL,
         path TEXT NOT NULL,
         ref TEXT NOT NULL DEFAULT '',
         country TEXT NOT NULL DEFAULT '',
         device TEXT NOT NULL DEFAULT '',
         browser TEXT NOT NULL DEFAULT '',
         visitor TEXT NOT NULL
       )`,
    )
    .run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_hits_day ON analytics_hits(day)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_hits_ts ON analytics_hits(ts)`).run();
};

const sha256Hex = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const deviceOf = (ua: string) =>
  /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop";

/** Order matters: Chrome's UA contains "Safari", Edge's contains "Chrome"… */
const browserOf = (ua: string) => {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung";
  if (/yabrowser/i.test(ua)) return "Yandex";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/chrome\/|crios\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua)) return "Safari";
  return "Other";
};

/** Referrer -> bare domain; own domain and garbage -> "" (direct). */
const refDomain = (raw: string, ownHost: string) => {
  try {
    const h = new URL(raw).hostname.replace(/^www\./, "");
    return h && h !== ownHost ? h.slice(0, 100) : "";
  } catch {
    return "";
  }
};

export const onRequestPost = async (ctx: Ctx) => {
  const db = ctx.env.DB;
  if (!db) return json({ ok: true }); // no DB bound — silently drop, never error a visitor
  const ua = ctx.request.headers.get("user-agent") ?? "";
  if (!ua || BOT_RE.test(ua)) return json({ ok: true });

  const body = await readJson<{ path?: string; ref?: string }>(ctx.request);
  let path = (body?.path ?? "").toString().slice(0, 200);
  if (!path.startsWith("/")) return json({ ok: true });
  path = path.split("?")[0].split("#")[0] || "/";
  // The owner working in the admin (or a signed-in admin anywhere) is not traffic.
  if (/^\/(admin|account|login)(\/|$)/.test(path)) return json({ ok: true });
  try {
    const user = await getSessionUser(ctx);
    if (user && (user.role === "admin" || user.email === OWNER_EMAIL)) return json({ ok: true });
  } catch {
    // sessions table missing etc. — count the hit anyway
  }

  await ensureHitsTable(db);

  const now = new Date();
  const ts = now.toISOString();
  const day = ts.slice(0, 10);
  const ip = ctx.request.headers.get("cf-connecting-ip") ?? "";
  const cf = (ctx.request as Request & { cf?: { country?: string } }).cf;
  const country = (cf?.country ?? ctx.request.headers.get("cf-ipcountry") ?? "").toString().slice(0, 2);
  const ownHost = new URL(ctx.request.url).hostname.replace(/^www\./, "");
  const visitor = (await sha256Hex(`${ip}|${ua}|${day}|tvms-analytics`)).slice(0, 24);

  await db
    .prepare(
      `INSERT INTO analytics_hits (ts, day, path, ref, country, device, browser, visitor)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(ts, day, path, refDomain(body?.ref ?? "", ownHost), country, deviceOf(ua), browserOf(ua), visitor)
    .run();

  // Opportunistic retention: ~1 hit in 100 also sweeps out rows older than 180 days.
  if (Math.random() < 0.01) {
    await db.prepare(`DELETE FROM analytics_hits WHERE day < date('now', '-180 day')`).run();
  }
  return json({ ok: true });
};
