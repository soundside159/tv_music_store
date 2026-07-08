import { getSessionUser, json, newId, type Ctx } from "./_utils";

// The signed-in user's favourite tracks.
//   GET               -> { trackIds: string[] }
//   POST { trackId }  -> add
//   DELETE ?trackId=  -> remove
// Lazy table so it self-heals on first use. Powers Account -> Favourites and,
// later, the popularity ranking.

const ensureTable = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS favourites (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL,
         track_id TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         UNIQUE(user_id, track_id)
       )`,
    )
    .run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_favourites_user ON favourites(user_id)`).run();
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ trackIds: [] });
  await ensureTable(ctx.env.DB);
  const rows = await ctx.env.DB.prepare(
    `SELECT track_id FROM favourites WHERE user_id = ?1 ORDER BY created_at DESC`,
  )
    .bind(user.id)
    .all<{ track_id: string }>();
  return json({ trackIds: rows.results.map((r) => r.track_id) });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in to save favourites", code: "auth" }, 401);
  const body = (await ctx.request.json().catch(() => ({}))) as { trackId?: string };
  const trackId = body.trackId?.trim();
  if (!trackId) return json({ error: "trackId required" }, 400);
  await ensureTable(ctx.env.DB);
  await ctx.env.DB.prepare(
    `INSERT OR IGNORE INTO favourites (id, user_id, track_id) VALUES (?1, ?2, ?3)`,
  )
    .bind(newId("fav"), user.id, trackId)
    .run();
  return json({ ok: true });
};

export const onRequestDelete = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in", code: "auth" }, 401);
  const trackId = new URL(ctx.request.url).searchParams.get("trackId")?.trim();
  if (!trackId) return json({ error: "trackId required" }, 400);
  await ensureTable(ctx.env.DB);
  await ctx.env.DB.prepare(`DELETE FROM favourites WHERE user_id = ?1 AND track_id = ?2`)
    .bind(user.id, trackId)
    .run();
  return json({ ok: true });
};
