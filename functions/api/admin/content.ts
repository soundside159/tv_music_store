import { getSessionUser, json, newId, OWNER_EMAIL, readJson, type Ctx, type D1Database } from "../_utils";
import { seedCollections, seedTracks } from "./_seed_data";

// Admin content editor API (collections, playlists, trending).
// GET  -> { collections, playlists, trending } with ordered track ids.
// POST { action, ... } -> seed_catalog | upsert_collection | delete_collection |
//        upsert_playlist | delete_playlist | set_tracks | set_trending

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return { error: json({ error: "Admin only" }, 403) };
  }
  return { user };
};

const ensureSiteConfig = async (db: D1Database) => {
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
    .run();
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || newId("itm");

interface ItemBody {
  id?: string;
  title?: string;
  shortTitle?: string;
  description?: string;
  image?: string;
}

const upsertItem = async (db: D1Database, table: "collections" | "playlists", body: ItemBody) => {
  const title = body.title?.trim();
  if (!title) return json({ error: "Title required" }, 400);
  const id = body.id?.trim() || slugify(title);
  const shortCol = table === "collections" ? ", short_title = ?5" : "";

  const existing = await db.prepare(`SELECT id FROM ${table} WHERE id = ?1`).bind(id).first();
  if (existing) {
    await db
      .prepare(
        `UPDATE ${table} SET title = ?2, description = ?3, image = ?4${shortCol} WHERE id = ?1`,
      )
      .bind(
        ...(table === "collections"
          ? [id, title, body.description ?? "", body.image ?? "", body.shortTitle ?? title]
          : [id, title, body.description ?? "", body.image ?? ""]),
      )
      .run();
  } else {
    const maxSort = await db
      .prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM ${table}`)
      .first<{ s: number }>();
    if (table === "collections") {
      await db
        .prepare(
          `INSERT INTO collections (id, slug, title, short_title, description, image, sort)
           VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(id, title, body.shortTitle ?? title, body.description ?? "", body.image ?? "", maxSort?.s ?? 0)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO playlists (id, slug, title, description, image, sort)
           VALUES (?1, ?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(id, title, body.description ?? "", body.image ?? "", maxSort?.s ?? 0)
        .run();
    }
  }
  return json({ ok: true, id });
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;
  const db = ctx.env.DB;
  await ensureSiteConfig(db);

  const collections = await db
    .prepare(`SELECT id, title, short_title, description, image, sort FROM collections ORDER BY sort`)
    .all<{ id: string; title: string; short_title: string | null; description: string | null; image: string | null; sort: number }>();
  const playlists = await db
    .prepare(`SELECT id, title, description, image, sort FROM playlists ORDER BY sort`)
    .all<{ id: string; title: string; description: string | null; image: string | null; sort: number }>();
  const colTracks = await db
    .prepare(`SELECT collection_id, track_id FROM collection_tracks ORDER BY sort`)
    .all<{ collection_id: string; track_id: string }>();
  const plTracks = await db
    .prepare(`SELECT playlist_id, track_id FROM playlist_tracks ORDER BY sort`)
    .all<{ playlist_id: string; track_id: string }>();
  const trendingRow = await db
    .prepare(`SELECT value FROM site_config WHERE key = 'trending_track_ids'`)
    .first<{ value: string }>();
  const trackCount = await db.prepare(`SELECT COUNT(*) AS n FROM tracks`).first<{ n: number }>();

  const group = (rows: { [k: string]: string }[], key: string) => {
    const map: Record<string, string[]> = {};
    for (const r of rows) (map[r[key]] ??= []).push(r.track_id);
    return map;
  };
  const colMap = group(colTracks.results, "collection_id");
  const plMap = group(plTracks.results, "playlist_id");

  return json({
    dbTrackCount: trackCount?.n ?? 0,
    trending: trendingRow ? (JSON.parse(trendingRow.value) as string[]) : [],
    collections: collections.results.map((c) => ({
      id: c.id,
      title: c.title,
      shortTitle: c.short_title ?? "",
      description: c.description ?? "",
      image: c.image ?? "",
      trackIds: colMap[c.id] ?? [],
    })),
    playlists: playlists.results.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      image: p.image ?? "",
      trackIds: plMap[p.id] ?? [],
    })),
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;
  const db = ctx.env.DB;
  await ensureSiteConfig(db);

  const body = await readJson<{
    action?: string;
    id?: string;
    kind?: "collection" | "playlist";
    trackIds?: string[];
    title?: string;
    shortTitle?: string;
    description?: string;
    image?: string;
  }>(ctx.request);
  if (!body?.action) return json({ error: "action required" }, 400);

  switch (body.action) {
    case "seed_catalog": {
      // Idempotent: copies the demo catalog (mock data) into D1 so the editor
      // and the live /api/tracks have real rows to work with.
      for (const c of seedCollections) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO collections (id, slug, title, short_title, description, image, sort)
             VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6)`,
          )
          .bind(c.id, c.title, c.shortTitle, c.description, c.image, c.sort)
          .run();
      }
      for (const t of seedTracks) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO tracks (id, slug, title, category, genre, mood, use_case, style_of, bpm, duration, description, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
          )
          .bind(
            t.id, t.slug, t.title, t.category, t.genre, t.mood, t.useCase, t.styleOf,
            t.bpm, t.duration, t.description, JSON.stringify(t.tags),
          )
          .run();
        for (const v of t.versions) {
          await db
            .prepare(
              `INSERT OR IGNORE INTO track_versions (id, track_id, version_id, label, duration, preview_src, sort)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
            )
            .bind(`${t.id}:${v.versionId}`, t.id, v.versionId, v.label, v.duration, v.previewSrc, v.sort)
            .run();
        }
        for (let i = 0; i < t.collectionIds.length; i++) {
          await db
            .prepare(
              `INSERT OR IGNORE INTO collection_tracks (collection_id, track_id, sort)
               VALUES (?1, ?2, ?3)`,
            )
            .bind(t.collectionIds[i], t.id, i)
            .run();
        }
      }
      return json({ ok: true });
    }

    case "upsert_collection":
      return upsertItem(db, "collections", body);
    case "upsert_playlist":
      return upsertItem(db, "playlists", body);

    case "delete_collection": {
      if (!body.id) return json({ error: "id required" }, 400);
      await db.prepare(`DELETE FROM collection_tracks WHERE collection_id = ?1`).bind(body.id).run();
      await db.prepare(`DELETE FROM collections WHERE id = ?1`).bind(body.id).run();
      return json({ ok: true });
    }
    case "delete_playlist": {
      if (!body.id) return json({ error: "id required" }, 400);
      await db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id = ?1`).bind(body.id).run();
      await db.prepare(`DELETE FROM playlists WHERE id = ?1`).bind(body.id).run();
      return json({ ok: true });
    }

    case "set_tracks": {
      if (!body.id || !body.kind || !Array.isArray(body.trackIds)) {
        return json({ error: "id, kind and trackIds required" }, 400);
      }
      const join = body.kind === "collection" ? "collection_tracks" : "playlist_tracks";
      const col = body.kind === "collection" ? "collection_id" : "playlist_id";
      await db.prepare(`DELETE FROM ${join} WHERE ${col} = ?1`).bind(body.id).run();
      for (let i = 0; i < body.trackIds.length; i++) {
        await db
          .prepare(`INSERT OR IGNORE INTO ${join} (${col}, track_id, sort) VALUES (?1, ?2, ?3)`)
          .bind(body.id, body.trackIds[i], i)
          .run();
      }
      return json({ ok: true });
    }

    case "set_trending": {
      if (!Array.isArray(body.trackIds)) return json({ error: "trackIds required" }, 400);
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES ('trending_track_ids', ?1)
           ON CONFLICT(key) DO UPDATE SET value = ?1`,
        )
        .bind(JSON.stringify(body.trackIds.slice(0, 24)))
        .run();
      return json({ ok: true });
    }

    default:
      return json({ error: `Unknown action: ${body.action}` }, 400);
  }
};
