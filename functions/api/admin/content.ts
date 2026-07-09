import {
  getSessionUser,
  getVocabularies,
  json,
  newId,
  OWNER_EMAIL,
  readJson,
  VOCAB_COL,
  VOCAB_KEY,
  type Ctx,
  type D1Database,
  type VocabFacet,
} from "../_utils";
import { seedCollections, seedTracks } from "./_seed_data";
import { ensureTrackCodes, generateTrackCode } from "../_codes";

// Admin content editor API (collections, playlists, trending, track editing).
// GET  -> { collections, playlists, trending } with ordered track ids.
// POST { action, ... } -> seed_catalog | upsert_collection | delete_collection |
//        upsert_playlist | delete_playlist | set_tracks | set_trending | update_track |
//        bulk_update_tracks

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return { error: json({ error: "Admin only" }, 403) };
  }
  return { user };
};

/** Adds newer track columns on first use — saves the owner wrangler migrations. */
const ensureTrackCoverColumn = async (db: D1Database) => {
  const alters = [
    `ALTER TABLE tracks ADD COLUMN cover TEXT`,
    `ALTER TABLE tracks ADD COLUMN cover_thumb TEXT`,
    `ALTER TABLE tracks ADD COLUMN r2_key_wav_zip TEXT`,
    `ALTER TABLE tracks ADD COLUMN r2_key_stems TEXT`,
    `ALTER TABLE track_versions ADD COLUMN preview_128 TEXT`,
  ];
  for (const sql of alters) {
    try {
      await db.prepare(sql).run();
    } catch {
      // column already exists — fine
    }
  }
};

// Homepage category chips ("Modern Score", "Thriller", ...) become editable
// curated lists ("Best for Trailers", ...). Tables are created lazily; on
// first run the 4 legacy categories are seeded and existing tracks.category
// values are copied into category_tracks so /catalog?category=... keeps working.
const DEFAULT_CATEGORIES: Array<[string, string]> = [
  ["modern-score", "Modern Score"],
  ["thriller", "Thriller"],
  ["game-ost", "Game OST"],
  ["production", "Production"],
];

const ensureCategoryTables = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS categories (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         sort INTEGER NOT NULL DEFAULT 0
       )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS category_tracks (
         category_id TEXT NOT NULL,
         track_id TEXT NOT NULL,
         sort INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (category_id, track_id)
       )`,
    )
    .run();
  const count = await db.prepare(`SELECT COUNT(*) AS n FROM categories`).first<{ n: number }>();
  if ((count?.n ?? 0) === 0) {
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const [id, title] = DEFAULT_CATEGORIES[i];
      await db
        .prepare(`INSERT OR IGNORE INTO categories (id, title, sort) VALUES (?1, ?2, ?3)`)
        .bind(id, title, i)
        .run();
    }
  }
  const links = await db.prepare(`SELECT COUNT(*) AS n FROM category_tracks`).first<{ n: number }>();
  if ((links?.n ?? 0) === 0) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO category_tracks (category_id, track_id, sort)
         SELECT category, id, 0 FROM tracks WHERE category IN (SELECT id FROM categories)`,
      )
      .run();
  }
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

// Playlists get an optional THEME ("Featured", "Podcast", ...) used to group
// the /playlists page into sections. Added lazily for existing DBs.
const ensurePlaylistThemeColumn = async (db: D1Database) => {
  try {
    await db.prepare(`ALTER TABLE playlists ADD COLUMN theme TEXT`).run();
  } catch {
    // column already exists — fine
  }
};

interface ItemBody {
  id?: string;
  title?: string;
  shortTitle?: string;
  description?: string;
  image?: string;
  theme?: string;
}

const upsertItem = async (db: D1Database, table: "collections" | "playlists", body: ItemBody) => {
  const title = body.title?.trim();
  if (!title) return json({ error: "Title required" }, 400);
  const id = body.id?.trim() || slugify(title);
  if (table === "playlists") await ensurePlaylistThemeColumn(db);
  const theme = (body.theme ?? "").trim();

  const existing = await db.prepare(`SELECT id FROM ${table} WHERE id = ?1`).bind(id).first();
  if (existing) {
    if (table === "collections") {
      await db
        .prepare(
          `UPDATE collections SET title = ?2, description = ?3, image = ?4, short_title = ?5 WHERE id = ?1`,
        )
        .bind(id, title, body.description ?? "", body.image ?? "", body.shortTitle ?? title)
        .run();
    } else if (body.theme === undefined) {
      // Caller doesn't know about themes (e.g. the /admin editor) — keep it.
      await db
        .prepare(`UPDATE playlists SET title = ?2, description = ?3, image = ?4 WHERE id = ?1`)
        .bind(id, title, body.description ?? "", body.image ?? "")
        .run();
    } else {
      await db
        .prepare(
          `UPDATE playlists SET title = ?2, description = ?3, image = ?4, theme = ?5 WHERE id = ?1`,
        )
        .bind(id, title, body.description ?? "", body.image ?? "", theme)
        .run();
    }
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
          `INSERT INTO playlists (id, slug, title, description, image, theme, sort)
           VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(id, title, body.description ?? "", body.image ?? "", theme, maxSort?.s ?? 0)
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
  await ensureCategoryTables(db);
  await ensurePlaylistThemeColumn(db);

  const categories = await db
    .prepare(`SELECT id, title, sort FROM categories ORDER BY sort`)
    .all<{ id: string; title: string; sort: number }>();
  const catTracks = await db
    .prepare(`SELECT category_id, track_id FROM category_tracks ORDER BY sort`)
    .all<{ category_id: string; track_id: string }>();
  const collections = await db
    .prepare(`SELECT id, title, short_title, description, image, sort FROM collections ORDER BY sort`)
    .all<{ id: string; title: string; short_title: string | null; description: string | null; image: string | null; sort: number }>();
  const playlists = await db
    .prepare(`SELECT id, title, description, image, theme, sort FROM playlists ORDER BY sort`)
    .all<{ id: string; title: string; description: string | null; image: string | null; theme: string | null; sort: number }>();
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
  const vocabularies = await getVocabularies(db);
  // Composer profiles (pseudonyms) — the upload composer picker needs them.
  let composers: { id: string; userId: string | null; displayName: string }[] = [];
  try {
    const cs = await db
      .prepare(`SELECT id, user_id, display_name FROM composers ORDER BY display_name`)
      .all<{ id: string; user_id: string | null; display_name: string }>();
    composers = cs.results.map((c) => ({ id: c.id, userId: c.user_id, displayName: c.display_name }));
  } catch {
    // composers table missing — picker stays empty
  }

  const group = (rows: { [k: string]: string }[], key: string) => {
    const map: Record<string, string[]> = {};
    for (const r of rows) (map[r[key]] ??= []).push(r.track_id);
    return map;
  };
  const colMap = group(colTracks.results, "collection_id");
  const plMap = group(plTracks.results, "playlist_id");
  const catMap = group(catTracks.results, "category_id");

  return json({
    dbTrackCount: trackCount?.n ?? 0,
    vocabularies,
    composers,
    trending: trendingRow ? (JSON.parse(trendingRow.value) as string[]) : [],
    categories: categories.results.map((c) => ({
      id: c.id,
      title: c.title,
      trackIds: catMap[c.id] ?? [],
    })),
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
      theme: p.theme ?? "",
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
    // update_track / create_track fields
    genre?: string;
    mood?: string;
    useCase?: string;
    bpm?: number;
    tags?: string[];
    cover?: string;
    // create_track extra fields
    duration?: string;
    category?: string;
    hasStems?: boolean;
    previewSrc?: string;
    previewLabel?: string;
    masterKey?: string;
    coverThumb?: string;
    wavZipKey?: string;
    /** create_track: composer profile the track belongs to (picker). */
    composerId?: string;
    /** create_track: private stems zip key (masters/stems-…) — flips has_stems. */
    stemsKey?: string;
    // add_version / delete_version / rename_version / set_main_version
    versionId?: string;
    label?: string;
    preview128?: string;
    versions?: {
      label?: string;
      previewSrc?: string;
      preview128?: string;
      duration?: string;
    }[];
    // bulk_update_tracks fields (trackIds shared with set_tracks above)
    facets?: Partial<Record<"useCase" | "genre" | "mood", { add?: string[]; remove?: string[] }>>;
    playlistChanges?: { add?: string[]; remove?: string[] };
    collectionChanges?: { add?: string[]; remove?: string[] };
    categoryChanges?: { add?: string[]; remove?: string[] };
    trendingChange?: "add" | "remove";
    // add_vocab / delete_vocab / set_vocab / rename_vocab fields
    facet?: string;
    value?: string;
    values?: string[];
    /** rename_vocab: the new name for `value` (tracks are updated too). */
    newValue?: string;
    fields?: {
      title?: string;
      bpm?: number;
      description?: string;
      cover?: string;
      /** Small square thumb for track rows (regenerated with the cover). */
      coverThumb?: string;
      tags?: string[];
      hasStems?: boolean;
      /** R2 masters/ key of the stems zip; setting it also flips has_stems on. */
      stemsKey?: string;
      /** Removes the stems bundle reference + switches the badge off. */
      clearStems?: boolean;
      /** draft | published — bulk publish/unpublish. */
      status?: string;
      /** pending | approved | rejected — composer-upload review verdict. */
      moderationStatus?: string;
      /** Reassign the track to another composer profile ("" clears). */
      composerId?: string;
    };
    /** create_track: "draft" keeps the track off the public catalog. */
    status?: string;
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

    case "upsert_category": {
      await ensureCategoryTables(db);
      const title = body.title?.trim();
      if (!title) return json({ error: "Title required" }, 400);
      const id = body.id?.trim() || slugify(title);
      const existing = await db.prepare(`SELECT id FROM categories WHERE id = ?1`).bind(id).first();
      if (existing) {
        await db.prepare(`UPDATE categories SET title = ?2 WHERE id = ?1`).bind(id, title).run();
      } else {
        const maxSort = await db
          .prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM categories`)
          .first<{ s: number }>();
        await db
          .prepare(`INSERT INTO categories (id, title, sort) VALUES (?1, ?2, ?3)`)
          .bind(id, title, maxSort?.s ?? 0)
          .run();
      }
      return json({ ok: true, id });
    }
    case "delete_category": {
      if (!body.id) return json({ error: "id required" }, 400);
      await ensureCategoryTables(db);
      await db.prepare(`DELETE FROM category_tracks WHERE category_id = ?1`).bind(body.id).run();
      await db.prepare(`DELETE FROM categories WHERE id = ?1`).bind(body.id).run();
      return json({ ok: true });
    }

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

    case "reorder_content": {
      // Reorder collections or playlists (their `sort` drives every public
      // list). values = the full id list in the desired order.
      const table =
        body.kind === "collection" ? "collections" : body.kind === "playlist" ? "playlists" : null;
      if (!table || !Array.isArray(body.values)) {
        return json({ error: "kind and values required" }, 400);
      }
      for (let i = 0; i < body.values.length; i++) {
        await db.prepare(`UPDATE ${table} SET sort = ?2 WHERE id = ?1`).bind(body.values[i], i).run();
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

    case "update_track": {
      if (!body.id) return json({ error: "id required" }, 400);
      const title = body.title?.trim();
      if (!title) return json({ error: "Title required" }, 400);
      await ensureTrackCoverColumn(db);
      const exists = await db.prepare(`SELECT id FROM tracks WHERE id = ?1`).bind(body.id).first();
      if (!exists) return json({ error: "Track not found" }, 404);
      const bpm = Number.isFinite(body.bpm) ? Math.round(body.bpm as number) : null;
      await db
        .prepare(
          `UPDATE tracks SET title = ?2, genre = ?3, mood = ?4, use_case = ?5, bpm = ?6,
                  description = ?7, tags = ?8, cover = ?9
            WHERE id = ?1`,
        )
        .bind(
          body.id,
          title,
          body.genre ?? "",
          body.mood ?? "",
          body.useCase ?? "",
          bpm,
          body.description ?? "",
          JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 12) : []),
          body.cover ?? "",
        )
        .run();
      return json({ ok: true, id: body.id });
    }

    case "bulk_update_tracks": {
      // One action for the admin "Tracks Edit" panel: add/remove Use Case /
      // Genre / Mood values, playlist & collection membership, trending flag —
      // for many tracks at once. `fields` (title/bpm/description/cover/tags)
      // is meant for single-track edits and is applied to every id given.
      const ids = Array.isArray(body.trackIds)
        ? [...new Set(body.trackIds.filter((x) => typeof x === "string" && x))].slice(0, 500)
        : [];
      if (ids.length === 0) return json({ error: "trackIds required" }, 400);
      await ensureTrackCoverColumn(db);
      if (body.categoryChanges) await ensureCategoryTables(db);

      const splitVals = (v: string | null) =>
        (v ?? "").split("/").map((s) => s.trim()).filter(Boolean);
      const facetCols: Array<["useCase" | "genre" | "mood", "use_case" | "genre" | "mood"]> = [
        ["useCase", "use_case"],
        ["genre", "genre"],
        ["mood", "mood"],
      ];

      for (const id of ids) {
        const row = await db
          .prepare(`SELECT id, genre, mood, use_case FROM tracks WHERE id = ?1`)
          .bind(id)
          .first<{ id: string; genre: string | null; mood: string | null; use_case: string | null }>();
        if (!row) continue;

        const next: Record<string, string | number | null> = {};
        for (const [key, col] of facetCols) {
          const ch = body.facets?.[key];
          if (!ch) continue;
          const rm = new Set((ch.remove ?? []).map(String));
          let vals = splitVals(row[col]).filter((v) => !rm.has(v));
          for (const a of ch.add ?? []) if (!vals.includes(a)) vals = [...vals, a];
          next[col] = vals.join(" / ");
        }
        const f = body.fields;
        if (f) {
          if (typeof f.title === "string" && f.title.trim()) next.title = f.title.trim();
          if (Number.isFinite(f.bpm)) next.bpm = Math.round(f.bpm as number);
          if (typeof f.description === "string") next.description = f.description;
          if (typeof f.cover === "string") next.cover = f.cover;
          if (typeof f.coverThumb === "string") next.cover_thumb = f.coverThumb;
          if (Array.isArray(f.tags)) next.tags = JSON.stringify(f.tags.slice(0, 12));
          if (typeof f.hasStems === "boolean") next.has_stems = f.hasStems ? 1 : 0;
          // Stems bundle: storing the key also switches the STEMS badge on.
          if (typeof f.stemsKey === "string" && /^masters\//.test(f.stemsKey)) {
            next.r2_key_stems = f.stemsKey;
            next.has_stems = 1;
          }
          if (f.clearStems) {
            next.r2_key_stems = null;
            next.has_stems = 0;
          }
          if (f.status === "draft" || f.status === "published") {
            next.status = f.status;
            // Publishing implies approval — composer uploads land as
            // moderation_status='pending' and the owner's Publish is the review.
            if (f.status === "published") next.moderation_status = "approved";
          }
          if (
            f.moderationStatus === "pending" ||
            f.moderationStatus === "approved" ||
            f.moderationStatus === "rejected"
          ) {
            next.moderation_status = f.moderationStatus;
          }
          if (typeof f.composerId === "string") {
            if (f.composerId === "") {
              next.composer_id = null;
            } else {
              const cmp = await db
                .prepare(`SELECT id FROM composers WHERE id = ?1`)
                .bind(f.composerId)
                .first();
              if (cmp) next.composer_id = f.composerId;
            }
          }
        }
        const keys = Object.keys(next);
        if (keys.length > 0) {
          const setSql = keys.map((k, i) => `${k} = ?${i + 2}`).join(", ");
          await db
            .prepare(`UPDATE tracks SET ${setSql} WHERE id = ?1`)
            .bind(id, ...keys.map((k) => next[k]))
            .run();
        }
      }

      const applyMembership = async (
        table: "collection_tracks" | "playlist_tracks" | "category_tracks",
        col: "collection_id" | "playlist_id" | "category_id",
        changes?: { add?: string[]; remove?: string[] },
      ) => {
        if (!changes) return;
        const marks = ids.map((_, i) => `?${i + 2}`).join(", ");
        for (const target of changes.remove ?? []) {
          await db
            .prepare(`DELETE FROM ${table} WHERE ${col} = ?1 AND track_id IN (${marks})`)
            .bind(target, ...ids)
            .run();
        }
        for (const target of changes.add ?? []) {
          const sortRow = await db
            .prepare(`SELECT COALESCE(MAX(sort), -1) AS s FROM ${table} WHERE ${col} = ?1`)
            .bind(target)
            .first<{ s: number }>();
          let sort = (sortRow?.s ?? -1) + 1;
          for (const id of ids) {
            await db
              .prepare(`INSERT OR IGNORE INTO ${table} (${col}, track_id, sort) VALUES (?1, ?2, ?3)`)
              .bind(target, id, sort++)
              .run();
          }
        }
      };
      await applyMembership("playlist_tracks", "playlist_id", body.playlistChanges);
      await applyMembership("collection_tracks", "collection_id", body.collectionChanges);
      await applyMembership("category_tracks", "category_id", body.categoryChanges);

      if (body.trendingChange === "add" || body.trendingChange === "remove") {
        const trendingRow = await db
          .prepare(`SELECT value FROM site_config WHERE key = 'trending_track_ids'`)
          .first<{ value: string }>();
        let list: string[] = trendingRow ? (JSON.parse(trendingRow.value) as string[]) : [];
        if (body.trendingChange === "remove") {
          list = list.filter((x) => !ids.includes(x));
        } else {
          for (const id of ids) if (!list.includes(id)) list.push(id);
        }
        await db
          .prepare(
            `INSERT INTO site_config (key, value) VALUES ('trending_track_ids', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1`,
          )
          .bind(JSON.stringify(list.slice(0, 24)))
          .run();
      }

      return json({ ok: true, count: ids.length });
    }

    case "create_track": {
      const title = body.title?.trim();
      if (!title) return json({ error: "Title required" }, 400);

      const isPreviewPath = (p: string | undefined): p is string =>
        !!p && /^\/(api\/file\/previews|audio\/previews)\//.test(p);

      // New multi-version payload; falls back to the old single-preview shape.
      const rawVersions =
        Array.isArray(body.versions) && body.versions.length > 0
          ? body.versions
          : [{ label: body.previewLabel, previewSrc: body.previewSrc, duration: body.duration }];
      const versions = rawVersions
        .filter((v) => isPreviewPath(v.previewSrc))
        .slice(0, 12);
      if (versions.length === 0) {
        return json({ error: "Upload at least one WAV (its 320 kbps preview is required)" }, 400);
      }
      await ensureTrackCoverColumn(db);
      await ensureTrackCodes(db);

      // Random public code (1000-9999); the slug carries it: 1042-opening-up-space.
      const code = await generateTrackCode(db);
      if (code === null) {
        return json({ error: "All track codes (1000-9999) are in use" }, 507);
      }
      const slug = `${code}-${slugify(title)}`;

      const trackId = newId("trk");
      const bpm = Number.isFinite(body.bpm) ? Math.round(body.bpm as number) : null;
      const tags = Array.isArray(body.tags) ? body.tags.slice(0, 12) : [];
      const wavZipKey =
        typeof body.wavZipKey === "string" && /^masters\//.test(body.wavZipKey)
          ? body.wavZipKey
          : null;
      const stemsKey =
        typeof body.stemsKey === "string" && /^masters\//.test(body.stemsKey)
          ? body.stemsKey
          : null;
      // Composer picker: validate the profile exists (NULL = house/TVMUSICSTORE).
      let composerId: string | null = null;
      if (typeof body.composerId === "string" && body.composerId) {
        const cmp = await db
          .prepare(`SELECT id FROM composers WHERE id = ?1`)
          .bind(body.composerId)
          .first();
        if (cmp) composerId = body.composerId;
      }
      const mainDuration = versions[0].duration ?? body.duration ?? "";
      // Bulk uploads create DRAFTS (hidden from the public catalog until the
      // owner tags them and presses Publish); the single Add-Track form
      // publishes immediately as before.
      const status = body.status === "draft" ? "draft" : "published";
      await db
        .prepare(
          `INSERT INTO tracks
             (id, slug, title, composer_id, category, genre, mood, use_case, style_of,
              bpm, duration, description, tags, has_stems, cover, cover_thumb, r2_key_wav_zip, r2_key_stems, code, status)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
        )
        .bind(
          trackId,
          slug,
          title,
          composerId,
          body.category?.trim() || "production",
          body.genre ?? "",
          body.mood ?? "",
          body.useCase ?? "",
          bpm,
          mainDuration,
          body.description ?? "",
          JSON.stringify(tags),
          stemsKey || body.hasStems ? 1 : 0,
          body.cover ?? "",
          body.coverThumb ?? "",
          wavZipKey,
          stemsKey,
          code,
          status,
        )
        .run();

      for (let i = 0; i < versions.length; i++) {
        const v = versions[i];
        const versionId = i === 0 ? "main" : `v${i + 1}`;
        const preview128 = isPreviewPath(v.preview128) ? v.preview128 : null;
        await db
          .prepare(
            `INSERT INTO track_versions
               (id, track_id, version_id, label, duration, preview_src, preview_128, r2_key_wav, sort)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)`,
          )
          .bind(
            `${trackId}:${versionId}`,
            trackId,
            versionId,
            v.label?.trim() || (i === 0 ? "Main" : `Version ${i + 1}`),
            v.duration ?? "",
            v.previewSrc,
            preview128,
            i,
          )
          .run();
      }

      return json({ ok: true, id: trackId, slug, code });
    }

    // ---- Per-version management (track-page admin panel) -------------------

    case "add_version": {
      // { id: trackId, label, previewSrc, preview128?, duration?, wavZipKey? }
      const trackId = body.id;
      const previewSrc = body.previewSrc;
      if (!trackId || !previewSrc || !/^\/(api\/file\/previews|audio\/previews)\//.test(previewSrc)) {
        return json({ error: "id and an uploaded previewSrc required" }, 400);
      }
      await ensureTrackCoverColumn(db);
      const existing = await db
        .prepare(`SELECT version_id, COALESCE(MAX(sort), -1) AS maxsort FROM track_versions WHERE track_id = ?1`)
        .bind(trackId)
        .all<{ version_id: string; maxsort: number }>();
      const usedIds = new Set(existing.results.map((r) => r.version_id));
      let n = existing.results.length + 1;
      while (usedIds.has(`v${n}`)) n += 1;
      const versionId = `v${n}`;
      const maxSort = existing.results[0]?.maxsort ?? -1;
      const preview128 =
        body.preview128 && /^\/(api\/file\/previews|audio\/previews)\//.test(body.preview128)
          ? body.preview128
          : null;
      await db
        .prepare(
          `INSERT INTO track_versions
             (id, track_id, version_id, label, duration, preview_src, preview_128, r2_key_wav, sort)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)`,
        )
        .bind(
          `${trackId}:${versionId}`,
          trackId,
          versionId,
          body.label?.trim() || `Version ${n}`,
          body.duration ?? "",
          previewSrc,
          preview128,
          maxSort + 1,
        )
        .run();
      if (typeof body.wavZipKey === "string" && /^masters\//.test(body.wavZipKey)) {
        await db.prepare(`UPDATE tracks SET r2_key_wav_zip = ?2 WHERE id = ?1`).bind(trackId, body.wavZipKey).run();
      }
      return json({ ok: true, versionId });
    }

    case "delete_version": {
      // { id: trackId, versionId, wavZipKey? } — main is protected (set another
      // version as main first); the last remaining version can't be deleted.
      const trackId = body.id;
      const versionId = body.versionId;
      if (!trackId || !versionId) return json({ error: "id and versionId required" }, 400);
      if (versionId === "main") {
        return json({ error: "Set another version as Main first, then delete this one" }, 400);
      }
      const count = await db
        .prepare(`SELECT COUNT(*) AS n FROM track_versions WHERE track_id = ?1`)
        .bind(trackId)
        .first<{ n: number }>();
      if ((count?.n ?? 0) <= 1) return json({ error: "A track needs at least one version" }, 400);
      await db
        .prepare(`DELETE FROM track_versions WHERE track_id = ?1 AND version_id = ?2`)
        .bind(trackId, versionId)
        .run();
      if (typeof body.wavZipKey === "string" && /^masters\//.test(body.wavZipKey)) {
        await db.prepare(`UPDATE tracks SET r2_key_wav_zip = ?2 WHERE id = ?1`).bind(trackId, body.wavZipKey).run();
      }
      return json({ ok: true });
    }

    case "rename_version": {
      const trackId = body.id;
      const versionId = body.versionId;
      const label = body.label?.trim();
      if (!trackId || !versionId || !label) return json({ error: "id, versionId and label required" }, 400);
      await db
        .prepare(`UPDATE track_versions SET label = ?3 WHERE track_id = ?1 AND version_id = ?2`)
        .bind(trackId, versionId, label.slice(0, 60))
        .run();
      return json({ ok: true });
    }

    case "set_main_version": {
      // Rewrites the track's versions with the chosen one first (version_id
      // "main", sort 0); the rest become v2, v3… Track duration follows the
      // new main. Primary keys are trackId:versionId so rows are re-inserted.
      const trackId = body.id;
      const versionId = body.versionId;
      if (!trackId || !versionId) return json({ error: "id and versionId required" }, 400);
      if (versionId === "main") return json({ ok: true });
      const rows = await db
        .prepare(
          `SELECT version_id, label, duration, preview_src, preview_128, r2_key_wav
             FROM track_versions WHERE track_id = ?1 ORDER BY sort ASC`,
        )
        .bind(trackId)
        .all<{
          version_id: string;
          label: string;
          duration: string | null;
          preview_src: string;
          preview_128: string | null;
          r2_key_wav: string | null;
        }>();
      const target = rows.results.find((r) => r.version_id === versionId);
      if (!target) return json({ error: "Version not found" }, 404);
      const ordered = [target, ...rows.results.filter((r) => r.version_id !== versionId)];
      await db.prepare(`DELETE FROM track_versions WHERE track_id = ?1`).bind(trackId).run();
      for (let i = 0; i < ordered.length; i++) {
        const v = ordered[i];
        const vid = i === 0 ? "main" : `v${i + 1}`;
        await db
          .prepare(
            `INSERT INTO track_versions
               (id, track_id, version_id, label, duration, preview_src, preview_128, r2_key_wav, sort)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
          )
          .bind(
            `${trackId}:${vid}`,
            trackId,
            vid,
            v.label,
            v.duration ?? "",
            v.preview_src,
            v.preview_128,
            v.r2_key_wav,
            i,
          )
          .run();
      }
      await db
        .prepare(`UPDATE tracks SET duration = ?2 WHERE id = ?1`)
        .bind(trackId, target.duration ?? "")
        .run();
      return json({ ok: true });
    }

    case "delete_track": {
      const ids = Array.isArray(body.trackIds)
        ? [...new Set(body.trackIds.filter((x) => typeof x === "string" && x))].slice(0, 200)
        : body.id
          ? [body.id]
          : [];
      if (ids.length === 0) return json({ error: "trackIds required" }, 400);
      const marks = ids.map((_, i) => `?${i + 1}`).join(", ");

      await db.prepare(`DELETE FROM track_versions WHERE track_id IN (${marks})`).bind(...ids).run();
      await db.prepare(`DELETE FROM collection_tracks WHERE track_id IN (${marks})`).bind(...ids).run();
      await db.prepare(`DELETE FROM playlist_tracks WHERE track_id IN (${marks})`).bind(...ids).run();
      try {
        await db.prepare(`DELETE FROM category_tracks WHERE track_id IN (${marks})`).bind(...ids).run();
      } catch {
        // category_tracks not created yet — fine
      }
      // Strip the deleted ids out of the trending list.
      try {
        await ensureSiteConfig(db);
        const row = await db
          .prepare(`SELECT value FROM site_config WHERE key = 'trending_track_ids'`)
          .first<{ value: string }>();
        if (row) {
          const list = (JSON.parse(row.value) as string[]).filter((x) => !ids.includes(x));
          await db
            .prepare(
              `INSERT INTO site_config (key, value) VALUES ('trending_track_ids', ?1)
               ON CONFLICT(key) DO UPDATE SET value = ?1`,
            )
            .bind(JSON.stringify(list))
            .run();
        }
      } catch {
        // no trending config — fine
      }

      await db.prepare(`DELETE FROM tracks WHERE id IN (${marks})`).bind(...ids).run();
      return json({ ok: true, deleted: ids.length });
    }

    case "add_vocab":
    case "delete_vocab": {
      const facet = body.facet as VocabFacet;
      if (!VOCAB_KEY[facet]) return json({ error: "Unknown facet" }, 400);
      const value = body.value?.trim();
      if (!value) return json({ error: "value required" }, 400);

      const vocab = await getVocabularies(db);
      let list = vocab[facet];
      if (body.action === "add_vocab") {
        if (!list.some((v) => v.toLowerCase() === value.toLowerCase())) list = [...list, value];
      } else {
        list = list.filter((v) => v !== value);
      }
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES (?1, ?2)
           ON CONFLICT(key) DO UPDATE SET value = ?2`,
        )
        .bind(VOCAB_KEY[facet], JSON.stringify(list))
        .run();

      // On delete, strip the value from any track that carries it (values are
      // stored joined by " / " in the use_case / genre / mood column).
      if (body.action === "delete_vocab") {
        const col = VOCAB_COL[facet];
        const rows = await db
          .prepare(`SELECT id, ${col} AS v FROM tracks WHERE ${col} LIKE ?1`)
          .bind(`%${value}%`)
          .all<{ id: string; v: string | null }>();
        for (const r of rows.results) {
          const vals = (r.v ?? "")
            .split("/")
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((s) => s !== value);
          await db.prepare(`UPDATE tracks SET ${col} = ?2 WHERE id = ?1`).bind(r.id, vals.join(" / ")).run();
        }
      }
      return json({ ok: true, values: list });
    }

    case "rename_vocab": {
      // Rename a value in place (keeps its position) AND rewrite every track
      // that carries it — so retagging for better sales is one action, no
      // manual re-ticking across the catalog.
      const facet = body.facet as VocabFacet;
      if (!VOCAB_KEY[facet]) return json({ error: "Unknown facet" }, 400);
      const value = body.value?.trim();
      const newValue = body.newValue?.trim();
      if (!value || !newValue) return json({ error: "value and newValue required" }, 400);
      if (value === newValue) return json({ ok: true });

      const vocab = await getVocabularies(db);
      const list = [...vocab[facet]];
      const idx = list.findIndex((v) => v === value);
      if (idx === -1) return json({ error: "Value not found" }, 404);
      if (list.some((v, i) => i !== idx && v.toLowerCase() === newValue.toLowerCase())) {
        return json({ error: `"${newValue}" already exists in this list` }, 400);
      }
      list[idx] = newValue;
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES (?1, ?2)
           ON CONFLICT(key) DO UPDATE SET value = ?2`,
        )
        .bind(VOCAB_KEY[facet], JSON.stringify(list))
        .run();

      const col = VOCAB_COL[facet];
      const rows = await db
        .prepare(`SELECT id, ${col} AS v FROM tracks WHERE ${col} LIKE ?1`)
        .bind(`%${value}%`)
        .all<{ id: string; v: string | null }>();
      let updated = 0;
      for (const r of rows.results) {
        const vals = (r.v ?? "")
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!vals.includes(value)) continue; // LIKE matched a superstring only
        const next = vals.map((s) => (s === value ? newValue : s));
        await db.prepare(`UPDATE tracks SET ${col} = ?2 WHERE id = ?1`).bind(r.id, next.join(" / ")).run();
        updated += 1;
      }
      return json({ ok: true, values: list, tracksUpdated: updated });
    }

    case "set_vocab": {
      // Replace the whole ordered list for a facet (used for reordering).
      const facet = body.facet as VocabFacet;
      if (!VOCAB_KEY[facet]) return json({ error: "Unknown facet" }, 400);
      if (!Array.isArray(body.values)) return json({ error: "values required" }, 400);
      const seen = new Set<string>();
      const list: string[] = [];
      for (const raw of body.values) {
        if (typeof raw !== "string") continue;
        const v = raw.trim();
        const k = v.toLowerCase();
        if (v && !seen.has(k)) {
          seen.add(k);
          list.push(v);
        }
      }
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES (?1, ?2)
           ON CONFLICT(key) DO UPDATE SET value = ?2`,
        )
        .bind(VOCAB_KEY[facet], JSON.stringify(list))
        .run();
      return json({ ok: true, values: list });
    }

    default:
      return json({ error: `Unknown action: ${body.action}` }, 400);
  }
};
