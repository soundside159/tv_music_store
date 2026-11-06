import { getSessionUser, json, type Ctx } from "../_utils";
import { getSheetsConfig, sheetUrl } from "../admin/_wlsheets";
import { ensureWlScan } from "../admin/_wlscan";

// GET /api/composer/claims - the signed-in composer's claim sheet and counts.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const db = ctx.env.DB;
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const composer = await db
    .prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
    .bind(user.id)
    .first<{ id: string }>();
  if (!composer) return json({ error: "No composer profile", code: "not_composer" }, 403);
  await ensureWlScan(db);
  const cfg = await getSheetsConfig(db);
  const id = cfg.sheets[composer.id] ?? "";
  const c = await db
    .prepare(
      `SELECT SUM(CASE WHEN state = 'in_sheet' THEN 1 ELSE 0 END) AS waiting,
              SUM(CASE WHEN state = 'released' THEN 1 ELSE 0 END) AS released,
              COUNT(*) AS total
         FROM wl_matches WHERE composer_id = ?1`,
    )
    .bind(composer.id)
    .first<{ waiting: number; released: number; total: number }>();
  return json({
    sheetUrl: id ? sheetUrl(id) : "",
    waiting: c?.waiting ?? 0,
    released: c?.released ?? 0,
    total: c?.total ?? 0,
  });
};
