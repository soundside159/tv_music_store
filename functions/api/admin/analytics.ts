import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";
import { ensureHitsTable } from "../hit";

// Admin -> Analytics: aggregates over analytics_hits (see ../hit.ts for how
// hits are collected). GET ?days=7|30|90 returns everything the tab renders in
// ONE call — daily series, totals, and the top pages / referrers / countries /
// devices / browsers of the window. "online" = distinct visitors, last 30 min.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) return json({ error: "Admin only" }, 403);
  const db = ctx.env.DB;
  await ensureHitsTable(db);

  const url = new URL(ctx.request.url);
  const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days")) || 30));
  const since = `-${days} day`;

  const series = await db
    .prepare(
      `SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
         FROM analytics_hits WHERE day >= date('now', ?1) GROUP BY day ORDER BY day`,
    )
    .bind(since)
    .all<{ day: string; views: number; visitors: number }>();

  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
         FROM analytics_hits WHERE day >= date('now', ?1)`,
    )
    .bind(since)
    .first<{ views: number; visitors: number }>();

  // Same-length window right before this one — the "vs previous period" deltas.
  const prev = await db
    .prepare(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
         FROM analytics_hits WHERE day >= date('now', ?1) AND day < date('now', ?2)`,
    )
    .bind(`-${days * 2} day`, since)
    .first<{ views: number; visitors: number }>();

  const online = await db
    .prepare(
      `SELECT COUNT(DISTINCT visitor) AS n FROM analytics_hits
        WHERE ts >= strftime('%Y-%m-%dT%H:%M:%S', datetime('now', '-30 minutes'))`,
    )
    .first<{ n: number }>();

  const top = async (col: "path" | "ref" | "country" | "device" | "browser", limit: number, skipEmpty = true) =>
    (
      await db
        .prepare(
          `SELECT ${col} AS k, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
             FROM analytics_hits
            WHERE day >= date('now', ?1)${skipEmpty ? ` AND ${col} != ''` : ""}
            GROUP BY ${col} ORDER BY views DESC LIMIT ${limit}`,
        )
        .bind(since)
        .all<{ k: string; views: number; visitors: number }>()
    ).results;

  return json({
    days,
    series: series.results,
    totals: { views: totals?.views ?? 0, visitors: totals?.visitors ?? 0 },
    previous: { views: prev?.views ?? 0, visitors: prev?.visitors ?? 0 },
    online: online?.n ?? 0,
    pages: await top("path", 12, false),
    referrers: await top("ref", 10),
    countries: await top("country", 12),
    devices: await top("device", 3),
    browsers: await top("browser", 7),
  });
};
