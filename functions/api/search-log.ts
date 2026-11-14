import { getSessionUser, json, readJson, type Ctx } from "./_utils";

// POST /api/search-log { q } - remembers what visitors type into the catalog
// search (plain and AI). Only the words, nothing about the results.
// Staff searches are skipped so they do not pollute the dashboard list.
// Read back in Admin -> Dashboard -> Customer searches (admin/sales.ts).

let tableReady = false;

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ ok: false }, 503);
  const body = await readJson<{ q?: string }>(ctx.request);
  const q = String(body?.q ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (q.length < 2) return json({ ok: true, skipped: true });
  try {
    const user = await getSessionUser(ctx);
    if (user && (user.role === "admin" || user.role === "editor")) return json({ ok: true, skipped: true });
  } catch {
    // anonymous visitor
  }
  const db = ctx.env.DB;
  if (!tableReady) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS search_log (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           query TEXT NOT NULL,
           results_count INTEGER NOT NULL,
           created_at TEXT NOT NULL DEFAULT (datetime('now'))
         )`,
      )
      .run();
    tableReady = true;
  }
  await db.prepare(`INSERT INTO search_log (query, results_count) VALUES (?1, 0)`).bind(q).run();
  return json({ ok: true });
};
