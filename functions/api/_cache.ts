import type { Ctx, D1Database } from "./_utils";

// Edge cache for the two PUBLIC catalog answers (/api/tracks, /api/content).
// Every page view of the SPA fetched both, and each one read whole D1 tables
// (all tracks, versions, playlist/collection/category links) — ~14k rows per
// view, which blew the D1 free tier (5M rows read/day) on 2026-10-16.
//
// Now the built JSON is kept in the Cloudflare cache. The cache key carries a
// "catalog version" (site_config.catalog_version, ONE row read per request);
// every admin / composer write bumps it (see admin/_middleware.ts and
// composer/_middleware.ts), so edits show up on the next page view everywhere,
// not only in one data centre. TTL only bounds the download counts (Popular sort).

const VERSION_KEY = "catalog_version";
const TTL_SECONDS = 3600;

type CtxWait = Ctx & { waitUntil?: (p: Promise<unknown>) => void };

export const catalogVersion = async (db: D1Database): Promise<string> => {
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = ?1`)
      .bind(VERSION_KEY)
      .first<{ value: string }>();
    return row?.value ?? "0";
  } catch {
    return "0"; // site_config missing — still cache, key just never changes until it exists
  }
};

export const bumpCatalogVersion = async (db: D1Database): Promise<void> => {
  try {
    await db
      .prepare(
        `INSERT INTO site_config (key, value) VALUES (?1, ?2)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(VERSION_KEY, String(Date.now()))
      .run();
  } catch {
    // site_config not created yet — nothing is cached under a real version then
  }
};

/** Serve `name` from the edge cache, building it with `build()` on a miss. */
export const cachedJson = async (
  ctx: CtxWait,
  name: string,
  build: () => Promise<Response>,
): Promise<Response> => {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (!cache || !ctx.env.DB) return build();

  const v = await catalogVersion(ctx.env.DB);
  const origin = new URL(ctx.request.url).origin;
  const key = new Request(`${origin}/__edge_cache/${name}?v=${encodeURIComponent(v)}`);

  try {
    const hit = await cache.match(key);
    if (hit) {
      return new Response(hit.body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-edge-cache": "hit",
        },
      });
    }
  } catch {
    // cache unavailable — fall through to the database
  }

  const res = await build();
  if (res.status === 200) {
    try {
      const body = await res.clone().arrayBuffer();
      const stored = new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `public, max-age=${TTL_SECONDS}`,
        },
      });
      const put = cache.put(key, stored);
      if (ctx.waitUntil) ctx.waitUntil(put);
      else await put;
    } catch {
      // never fail the request because of the cache
    }
  }
  return res;
};
