import { getSessionUser, json, newId, readJson, type Ctx, type D1Database } from "./_utils";

// Customer YouTube-channel whitelist (Content ID clearing while subscribed).
//   GET    /api/whitelist            -> { channels, plan, limit, used }
//   POST   /api/whitelist {url}      -> add a channel (enforces plan limit)
//   DELETE /api/whitelist?id=...     -> remove one of your channels
// Serviceable channels are actioned manually by the owner via /admin -> Whitelist.

const PLAN_LIMITS: Record<string, number> = { free: 0, pro: 3, max: 10 };

export const ensureWhitelistTable = async (db: D1Database): Promise<void> => {
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS whitelist_channels (
           id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           channel_url TEXT NOT NULL,
           channel_ref TEXT,
           added_at TEXT NOT NULL DEFAULT (datetime('now'))
         )`,
      )
      .run();
    await db
      .prepare(`CREATE INDEX IF NOT EXISTS idx_whitelist_user ON whitelist_channels(user_id)`)
      .run();
  } catch {
    // already exists
  }
};

/** The user's current effective plan (only an active subscription counts). */
const effectivePlan = async (db: D1Database, userId: string): Promise<string> => {
  const sub = await db
    .prepare(`SELECT plan, status FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`)
    .bind(userId)
    .first<{ plan: string; status: string | null }>();
  if (!sub) return "free";
  return sub.status && sub.status !== "active" ? "free" : sub.plan || "free";
};

// Accept only plausible YouTube channel URLs; capture @handle / channel id / user.
const CHANNEL_RE =
  /^https?:\/\/(www\.)?(youtube\.com\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)|youtu\.be\/[\w-]+)\/?/i;
const parseRef = (url: string): string | null => {
  const m = url.match(/(@[\w.-]+)|channel\/([\w-]+)|c\/([\w.-]+)|user\/([\w.-]+)/i);
  return m ? (m[1] || m[2] || m[3] || m[4] || null) : null;
};

const listResponse = async (db: D1Database, userId: string) => {
  const plan = await effectivePlan(db, userId);
  const rows = await db
    .prepare(
      `SELECT id, channel_url, channel_ref, added_at FROM whitelist_channels
        WHERE user_id = ?1 ORDER BY added_at DESC`,
    )
    .bind(userId)
    .all<{ id: string; channel_url: string; channel_ref: string | null; added_at: string }>();
  return json({
    channels: rows.results,
    plan,
    limit: PLAN_LIMITS[plan] ?? 0,
    used: rows.results.length,
  });
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  await ensureWhitelistTable(ctx.env.DB);
  return listResponse(ctx.env.DB, user.id);
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const db = ctx.env.DB;
  await ensureWhitelistTable(db);

  const body = await readJson<{ url?: string }>(ctx.request);
  const url = (body?.url ?? "").trim();
  if (!CHANNEL_RE.test(url)) {
    return json({ error: "Enter a valid YouTube channel URL (e.g. youtube.com/@yourchannel)." }, 400);
  }

  const plan = await effectivePlan(db, user.id);
  const limit = PLAN_LIMITS[plan] ?? 0;
  if (limit === 0) {
    return json({ error: "Channel whitelisting is available on paid plans.", code: "plan" }, 403);
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM whitelist_channels WHERE user_id = ?1`)
    .bind(user.id)
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) >= limit) {
    return json({ error: `Your plan allows up to ${limit} channels.`, code: "limit" }, 403);
  }

  // avoid duplicates for this user
  const dup = await db
    .prepare(`SELECT id FROM whitelist_channels WHERE user_id = ?1 AND channel_url = ?2`)
    .bind(user.id, url)
    .first<{ id: string }>();
  if (dup) return json({ error: "That channel is already added." }, 409);

  await db
    .prepare(
      `INSERT INTO whitelist_channels (id, user_id, channel_url, channel_ref)
       VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(newId("wch"), user.id, url, parseRef(url))
    .run();

  return listResponse(db, user.id);
};

export const onRequestDelete = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const db = ctx.env.DB;
  await ensureWhitelistTable(db);
  const id = new URL(ctx.request.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);
  await db
    .prepare(`DELETE FROM whitelist_channels WHERE id = ?1 AND user_id = ?2`)
    .bind(id, user.id)
    .run();
  return listResponse(db, user.id);
};
