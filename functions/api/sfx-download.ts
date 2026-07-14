import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx, type D1Database } from "./_utils";

// POST /api/sfx-download { id } -> streams the sound's WAV master.
//
// The rules the owner set (docs/SFX_PLAN.md):
//   • the ONLY download format is WAV;
//   • it starts at PRO (Free can listen on the site, not take);
//   • sound effects are never in Content ID and are never claimed — no whitelist
//     or claim language goes anywhere near them.
//
// Downloads are logged in their own table (sfx_downloads), NOT in download_log:
// a sound is not a track, and the payout engine weighs them differently
// (track = 1.0 point, sound = 0.2 — P2).

const ensureLog = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sfx_downloads (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id TEXT NOT NULL,
         sfx_id TEXT NOT NULL,
         composer_id TEXT,
         plan_at_download TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in to download sound effects", code: "auth" }, 401);
  if (!ctx.env.R2) return json({ error: "Storage not bound" }, 503);

  const body = await readJson<{ id?: string }>(ctx.request);
  const id = body?.id?.trim();
  if (!id) return json({ error: "id required" }, 400);

  const sub = await ctx.env.DB.prepare(
    `SELECT plan, status FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ plan: string; status: string }>();
  const realPlan = sub?.status === "active" || sub?.status === "canceled" ? sub.plan : "free";
  // Admins download at Max level (they have to be able to test every format).
  const isAdmin = user.role === "admin" || user.email === OWNER_EMAIL;
  const plan = isAdmin ? "max" : realPlan;

  if (plan !== "pro" && plan !== "max") {
    return json(
      {
        error: "Sound effects download with the Pro and Max plans — on Free you can listen to them here.",
        code: "plan",
      },
      403,
    );
  }

  const row = await ctx.env.DB.prepare(
    `SELECT id, name, code, wav_key, composer_id, status FROM sfx WHERE id = ?1`,
  )
    .bind(id)
    .first<{
      id: string;
      name: string;
      code: number | null;
      wav_key: string | null;
      composer_id: string | null;
      status: string;
    }>();
  if (!row || row.status !== "published") return json({ error: "Sound not found", code: "nofile" }, 404);
  if (!row.wav_key) return json({ error: "This sound has no file yet", code: "nofile" }, 404);

  const obj = await ctx.env.R2.get(row.wav_key);
  if (!obj) return json({ error: "File missing in storage", code: "nofile" }, 404);

  try {
    await ensureLog(ctx.env.DB);
    await ctx.env.DB.prepare(
      `INSERT INTO sfx_downloads (user_id, sfx_id, composer_id, plan_at_download)
       VALUES (?1, ?2, ?3, ?4)`,
    )
      .bind(user.id, row.id, row.composer_id, isAdmin ? "admin" : plan)
      .run();
  } catch {
    // never block a download over its own bookkeeping
  }

  const clean = row.name.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  const filename = row.code
    ? `tvmusicstore.com_${row.code}_${clean}.wav`
    : `tvmusicstore.com_${clean}.wav`;

  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "content-length": String(obj.size),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
};
