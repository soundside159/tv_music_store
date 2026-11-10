import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx, type D1Database } from "../_utils";

// Admin: the owner's own "posted to social media" tick per track (Tracks Edit -> Social).
// Only a note for the owner: customers never see it.
// GET  -> { ids: string[] }
// POST { trackId, on } -> set / clear the tick

const gate = async (ctx: Ctx) => {
  const admin = await getSessionUser(ctx);
  if (!admin) return json({ error: "Not signed in" }, 401);
  if (admin.role !== "admin" && admin.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }
  return null;
};

const ensure = (db: D1Database) =>
  db
    .prepare(
      `CREATE TABLE IF NOT EXISTS social_marks (
         track_id TEXT PRIMARY KEY,
         marked_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const denied = await gate(ctx);
  if (denied) return denied;
  await ensure(ctx.env.DB);
  const rs = await ctx.env.DB.prepare(`SELECT track_id FROM social_marks`).all<{ track_id: string }>();
  return json({ ids: rs.results.map((r) => r.track_id) });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const denied = await gate(ctx);
  if (denied) return denied;
  const body = await readJson<{ trackId?: string; on?: boolean }>(ctx.request);
  const id = String(body?.trackId ?? "").trim();
  if (!id || id.length > 200) return json({ error: "trackId required" }, 400);
  await ensure(ctx.env.DB);
  if (body?.on) {
    await ctx.env.DB.prepare(`INSERT OR IGNORE INTO social_marks (track_id) VALUES (?1)`).bind(id).run();
  } else {
    await ctx.env.DB.prepare(`DELETE FROM social_marks WHERE track_id = ?1`).bind(id).run();
  }
  return json({ ok: true });
};
