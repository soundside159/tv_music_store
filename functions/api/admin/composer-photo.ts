import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";

// POST /api/admin/composer-photo { composerId, settings | null }
// Saves how the composer's photo sits behind his public artist page
// (position, size, zoom, the soft mask, brightness). null = back to defaults.
// Admin only. Numbers are clamped so a bad value can never break the page.

const LIMITS: Record<string, [number, number]> = {
  right: [-20, 60], // % of the window from the right edge
  width: [20, 90], // % of the window
  height: [300, 1400], // px
  focusX: [0, 100], // which part of the photo stays in view, %
  focusY: [0, 100],
  zoom: [100, 250], // %
  maskW: [20, 120], // ellipse size, %
  maskH: [20, 120],
  maskX: [0, 100], // ellipse centre, %
  maskY: [0, 100],
  inner: [0, 95], // fully visible up to this %
  outer: [5, 100], // fully faded from this %
  brightness: [20, 120], // %
  glow: [0, 100], // blurred background glow strength, %
};

const TABLES: Record<string, string> = { composer: "composers", collection: "collections", playlist: "playlists" };

const ensureColumn = async (db: NonNullable<Ctx["env"]["DB"]>, table: string) => {
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN photo_settings TEXT`).run();
  } catch {
    // already there
  }
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) return json({ error: "Admin only" }, 403);

  const body = await readJson<{ composerId?: string; kind?: string; settings?: Record<string, unknown> | null }>(ctx.request);
  if (!body?.composerId) return json({ error: "composerId required" }, 400);
  const table = TABLES[body.kind ?? "composer"];
  if (!table) return json({ error: "Bad kind" }, 400);

  let clean: Record<string, number> | null = null;
  if (body.settings) {
    clean = {};
    for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
      const v = Number(body.settings[k]);
      if (Number.isFinite(v)) clean[k] = Math.min(hi, Math.max(lo, Math.round(v * 10) / 10));
    }
  }

  await ensureColumn(ctx.env.DB, table);
  const res = (await ctx.env.DB.prepare(`UPDATE ${table} SET photo_settings = ?2 WHERE id = ?1`)
    .bind(body.composerId, clean ? JSON.stringify(clean) : null)
    .run()) as { meta?: { changes?: number } };
  if (!res.meta?.changes) return json({ error: "Not found" }, 404);
  return json({ ok: true, settings: clean });
};
