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
import { parseManifest } from "../_zipStream";

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

// Vocab values must NEVER contain "/" — it is the storage separator for the
// tracks.use_case / genre / mood columns (values are joined with " / ").
// A value like "Social / Shorts" would split back into two tags, so its
// checkbox never reads as checked and every click appends another copy.
// Slashes are folded to "&" ("Social / Shorts" -> "Social & Shorts").
const cleanVocabValue = (v: string) =>
  v.replace(/\s*\/+\s*/g, " & ").replace(/\s+/g, " ").trim();

/**
 * Self-repair for the vocab-"/" incident (a value like "Social / Shorts" broke
 * the " / "-joined facet storage and left duplicate fragment tags on tracks).
 * Two parts:
 *  1. Any vocab value still containing "/" is renamed to its "&" form in
 *     site_config (runs whenever such a value exists).
 *  2. A ONE-TIME track sweep (flagged in site_config) collapses orphaned
 *     fragments back into their parent value — both for "/" values and for
 *     already-renamed "&" values (e.g. standalone "Social" + "Shorts" become
 *     one "Social & Shorts") — and removes duplicate tags. Fragments that are
 *     themselves canonical vocab values are left alone.
 * Cheap no-op when data is clean and the sweep already ran. Called from the
 * admin content GET.
 */
const REPAIR_FLAG_KEY = "vocab_slash_repair_v1";
const repairSlashVocabValues = async (db: D1Database, vocab: Record<VocabFacet, string[]>) => {
  const facets = Object.keys(VOCAB_KEY) as VocabFacet[];
  const hasSlash = facets.some((f) => vocab[f].some((v) => v.includes("/")));
  let sweepDone = false;
  try {
    sweepDone = !!(await db
      .prepare(`SELECT value FROM site_config WHERE key = ?1`)
      .bind(REPAIR_FLAG_KEY)
      .first());
  } catch {
    // site_config missing — nothing custom exists yet, skip the sweep
    sweepDone = true;
  }
  if (!hasSlash && sweepDone) return;

  for (const facet of facets) {
    const list = vocab[facet];

    // 1. Rename "/" values in the stored list ("Social / Shorts" -> "Social & Shorts").
    const renames: Array<{ parts: string[]; to: string }> = [];
    const seen = new Set<string>();
    const next: string[] = [];
    for (const v of list) {
      const nv = v.includes("/") ? cleanVocabValue(v) : v;
      if (v.includes("/")) {
        renames.push({ parts: v.split("/").map((s) => s.trim()).filter(Boolean), to: nv });
      }
      const k = nv.toLowerCase();
      if (nv && !seen.has(k)) {
        seen.add(k);
        next.push(nv);
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(list)) {
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES (?1, ?2)
           ON CONFLICT(key) DO UPDATE SET value = ?2`,
        )
        .bind(VOCAB_KEY[facet], JSON.stringify(next))
        .run();
      vocab[facet] = next;
    }

    // 2. Map fragments of already-"&"-renamed values too, so the sweep still
    // heals tracks when the owner renamed/deleted the "/" value by hand first.
    for (const v of next) {
      if (!v.includes("&")) continue;
      const parts = v.split("&").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) renames.push({ parts, to: v });
    }
    if (renames.length === 0 && sweepDone) continue;

    const canonical = new Set(next.map((v) => v.toLowerCase()));
    const col = VOCAB_COL[facet];
    const rows = await db
      .prepare(`SELECT id, ${col} AS v FROM tracks WHERE ${col} IS NOT NULL AND ${col} != ''`)
      .all<{ id: string; v: string | null }>();
    for (const r of rows.results) {
      const pieces = (r.v ?? "").split("/").map((s) => s.trim()).filter(Boolean);
      const out: string[] = [];
      const outSeen = new Set<string>();
      let changed = false;
      for (const p of pieces) {
        let val = p;
        if (!canonical.has(p.toLowerCase())) {
          const hit = renames.find((rn) => rn.parts.some((x) => x.toLowerCase() === p.toLowerCase()));
          if (hit) {
            val = hit.to;
            changed = true;
          }
        }
        const k = val.toLowerCase();
        if (outSeen.has(k)) {
          changed = true;
          continue;
        }
        outSeen.add(k);
        out.push(val);
      }
      if (changed) {
        await db.prepare(`UPDATE tracks SET ${col} = ?2 WHERE id = ?1`).bind(r.id, out.join(" / ")).run();
      }
    }
  }

  try {
    await db
      .prepare(
        `INSERT INTO site_config (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2`,
      )
      .bind(REPAIR_FLAG_KEY, new Date().toISOString())
      .run();
  } catch {
    // site_config missing — fine, the sweep will retry next GET
  }
};

// v2 storage: individual master files with client-computed CRCs; the download
// endpoint streams a zip from these manifests on the fly. Used by create_track,
// add_version (WAV master of a new version) and add_stems (dropped stem files).
const PREVIEW_PATH = /^\/(api\/file\/previews|audio\/previews)\//;
const cleanManifest = (raw: unknown) => {
  if (!Array.isArray(raw)) return null;
  const out: { key: string; name: string; size: number; crc: number; preview?: string }[] = [];
  for (const e of raw.slice(0, 40) as {
    key?: string;
    name?: string;
    size?: number;
    crc?: number;
    preview?: string;
  }[]) {
    if (
      typeof e?.key !== "string" ||
      !/^masters\//.test(e.key) ||
      typeof e.name !== "string" ||
      !Number.isFinite(e.size) ||
      !Number.isFinite(e.crc)
    )
      return null;
    out.push({
      key: e.key,
      name: e.name.replace(/[^\w\s\-().]/g, "_").slice(0, 120),
      size: Math.round(e.size as number),
      crc: (e.crc as number) >>> 0,
      // Stems carry a streamable MP3 alongside the master (see ManifestEntry).
      ...(typeof e.preview === "string" && PREVIEW_PATH.test(e.preview)
        ? { preview: e.preview }
        : {}),
    });
  }
  return out.length > 0 ? out : null;
};

/** "/api/file/previews/x.mp3" (or a bare key) -> "previews/x.mp3" (else null). */
const r2KeyOf = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const m = v.match(/^\/api\/file\/(.+)$/);
  const key = m ? m[1] : v;
  return /^(previews|masters|covers)\//.test(key) ? key : null;
};

/** Adds newer track columns on first use — saves the owner wrangler migrations. */
const ensureTrackCoverColumn = async (db: D1Database) => {
  const alters = [
    `ALTER TABLE tracks ADD COLUMN cover TEXT`,
    `ALTER TABLE tracks ADD COLUMN cover_thumb TEXT`,
    `ALTER TABLE tracks ADD COLUMN r2_key_wav_zip TEXT`,
    `ALTER TABLE tracks ADD COLUMN r2_key_stems TEXT`,
    // Individual-file storage (v2): JSON manifests [{key,name,size,crc}] —
    // the download endpoint streams a zip from these on the fly.
    `ALTER TABLE tracks ADD COLUMN wav_manifest TEXT`,
    `ALTER TABLE tracks ADD COLUMN stems_manifest TEXT`,
    `ALTER TABLE track_versions ADD COLUMN preview_128 TEXT`,
    // The "#" column of the owner's source spreadsheet. NOT unique: several
    // tracks can share a number (it groups releases, and will drive the
    // "newness" dates later). Kept as TEXT — it is a label, not a key.
    `ALTER TABLE tracks ADD COLUMN import_no TEXT`,
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

/**
 * Ensures a theme name exists in the persisted `playlist_themes` list — a
 * theme NEVER dies with its last playlist (the owner creates themes up front
 * and fills them later; deletion is only the explicit X in the admin).
 */
const registerPlaylistTheme = async (db: D1Database, theme: string) => {
  const t = theme.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!t) return;
  let list: string[] = [];
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'playlist_themes'`)
      .first<{ value: string }>();
    if (row) list = (JSON.parse(row.value) as unknown[]).filter((x): x is string => typeof x === "string");
  } catch {
    // none yet
  }
  if (list.some((x) => x.toLowerCase() === t.toLowerCase())) return;
  await db
    .prepare(
      `INSERT INTO site_config (key, value) VALUES ('playlist_themes', ?1)
       ON CONFLICT(key) DO UPDATE SET value = ?1`,
    )
    .bind(JSON.stringify([...list, t]))
    .run();
};

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
  // Any theme a playlist is saved with becomes a persistent theme (survives
  // deleting the playlist itself).
  if (table === "playlists" && theme) await registerPlaylistTheme(db, theme);
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
  // Self-heal legacy vocab values containing "/" (they broke the " / "-joined
  // facet storage and duplicated tags on tracks) — no-op when data is clean.
  await repairSlashVocabValues(db, vocabularies);
  // Global Extra-tags base (owner-curated, comma list in the Tags Base dialog);
  // the AI prompt-tagging picks a track's extra tags from here.
  let tagsBase: string[] = [];
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'extra_tags_base'`)
      .first<{ value: string }>();
    if (row) tagsBase = (JSON.parse(row.value) as unknown[]).filter((x): x is string => typeof x === "string");
  } catch {
    // none saved yet — fine
  }
  // Persisted playlist THEME names — an empty theme (no playlists yet) must
  // survive a refresh, so themes live as their own site_config list.
  let playlistThemes: string[] = [];
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'playlist_themes'`)
      .first<{ value: string }>();
    if (row) {
      playlistThemes = (JSON.parse(row.value) as unknown[]).filter(
        (x): x is string => typeof x === "string",
      );
    }
  } catch {
    // none saved yet — fine
  }
  // Backfill: themes living only on playlists (typed into a form before the
  // persistent list existed) become persistent too — so deleting the last
  // playlist of a theme never kills the theme.
  {
    const seenThemes = new Set(playlistThemes.map((t) => t.toLowerCase()));
    let grew = false;
    for (const p of playlists.results) {
      const t = (p.theme ?? "").trim();
      if (t && !seenThemes.has(t.toLowerCase())) {
        seenThemes.add(t.toLowerCase());
        playlistThemes.push(t);
        grew = true;
      }
    }
    if (grew) {
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES ('playlist_themes', ?1)
           ON CONFLICT(key) DO UPDATE SET value = ?1`,
        )
        .bind(JSON.stringify(playlistThemes))
        .run();
    }
  }
  // Composer profiles (pseudonyms) — the upload composer picker needs them.
  // Dead rows (no linked user AND no tracks — e.g. the Composer One/Two/Three
  // demo seeds from the first migration) are hidden: they only confused the
  // owner. Detached profiles that still OWN tracks stay listed, so their
  // tracks remain assignable/recoverable.
  let composers: { id: string; userId: string | null; displayName: string }[] = [];
  try {
    const cs = await db
      .prepare(
        `SELECT c.id, c.user_id, c.display_name,
                (SELECT COUNT(*) FROM tracks t WHERE t.composer_id = c.id) AS n
           FROM composers c ORDER BY c.display_name`,
      )
      .all<{ id: string; user_id: string | null; display_name: string; n: number }>();
    composers = cs.results
      .filter((c) => c.user_id || c.n > 0)
      .map((c) => ({ id: c.id, userId: c.user_id, displayName: c.display_name }));
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
    tagsBase,
    playlistThemes,
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
    kind?: "collection" | "playlist" | "category";
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
    /** delete_stem: R2 key ("masters/…") of the single stem file to remove. */
    key?: string;
    /** add_version: the version's WAV master, appended to wav_manifest (v2). */
    masterEntry?: { key?: string; name?: string; size?: number; crc?: number };
    /** add_stems: stem master files appended to stems_manifest (v2). */
    stems?: { key?: string; name?: string; size?: number; crc?: number }[];
    /** reorder_versions: the version ids in their NEW order (first = Main). */
    versionIds?: string[];
    /** reorder_stems: the stems' R2 keys in their NEW order. */
    keys?: string[];
    /** create_track v2: individual master files (zip is streamed at download). */
    wavManifest?: { key?: string; name?: string; size?: number; crc?: number }[];
    stemsManifest?: { key?: string; name?: string; size?: number; crc?: number }[];
    // add_version / delete_version / rename_version / set_main_version
    versionId?: string;
    label?: string;
    preview128?: string;
    versions?: {
      label?: string;
      previewSrc?: string;
      preview128?: string;
      duration?: string;
      /** R2 key of THIS version's WAV master (links the row to wav_manifest,
       *  so deleting the version can drop its file from the download zip). */
      wavKey?: string;
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
    /** set_license_prices: one-time single-track license prices (USD). */
    licensePrices?: { personal?: number; commercial?: number; professional?: number };
    fields?: {
      title?: string;
      bpm?: number;
      description?: string;
      cover?: string;
      /** Small square thumb for track rows (regenerated with the cover). */
      coverThumb?: string;
      tags?: string[];
      /** The "#" from the imported spreadsheet ("" clears it). */
      importNo?: string;
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
      // Reorder collections / playlists / categories (their `sort` drives
      // every public list). values = the full id list in the desired order.
      const table =
        body.kind === "collection"
          ? "collections"
          : body.kind === "playlist"
            ? "playlists"
            : body.kind === "category"
              ? "categories"
              : null;
      if (body.kind === "category") await ensureCategoryTables(db);
      if (!table || !Array.isArray(body.values)) {
        return json({ error: "kind and values required" }, 400);
      }
      for (let i = 0; i < body.values.length; i++) {
        await db.prepare(`UPDATE ${table} SET sort = ?2 WHERE id = ?1`).bind(body.values[i], i).run();
      }
      return json({ ok: true });
    }

    // Publication dates of the /guides articles (slug -> "YYYY-MM-DD").
    // The guide TEXT lives in the code bundle; only WHEN each one goes live is
    // editable here, so the owner can drip-feed them without a deploy. An
    // article whose date is in the future is invisible everywhere (page, list,
    // sitemap, prerender) until that day.
    case "set_guide_schedule": {
      const values = body.values as unknown;
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return json({ error: "values object required" }, 400);
      }
      const clean: Record<string, string> = {};
      for (const [slug, date] of Object.entries(values as Record<string, unknown>)) {
        if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (!/^[a-z0-9-]{3,80}$/.test(slug)) continue;
        clean[slug] = date;
      }
      await ensureSiteConfig(db);
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES ('guide_schedule', ?1)
           ON CONFLICT(key) DO UPDATE SET value = ?1`,
        )
        .bind(JSON.stringify(clean))
        .run();
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
          JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 50) : []),
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
          const rm = new Set((ch.remove ?? []).map((s) => String(s).toLowerCase()));
          // Case-insensitive dedupe on read — self-heals rows that ever
          // accumulated duplicate tags.
          const seen = new Set<string>();
          const vals: string[] = [];
          for (const v of splitVals(row[col])) {
            const k = v.toLowerCase();
            if (rm.has(k) || seen.has(k)) continue;
            seen.add(k);
            vals.push(v);
          }
          for (const a of ch.add ?? []) {
            const c = cleanVocabValue(String(a));
            const k = c.toLowerCase();
            if (!c || seen.has(k)) continue;
            seen.add(k);
            vals.push(c);
          }
          next[col] = vals.join(" / ");
        }
        const f = body.fields;
        if (f) {
          if (typeof f.title === "string" && f.title.trim()) next.title = f.title.trim();
          if (Number.isFinite(f.bpm)) next.bpm = Math.round(f.bpm as number);
          if (typeof f.description === "string") next.description = f.description;
          if (typeof f.cover === "string") next.cover = f.cover;
          if (typeof f.coverThumb === "string") next.cover_thumb = f.coverThumb;
          if (Array.isArray(f.tags)) next.tags = JSON.stringify(f.tags.slice(0, 50));
          if (typeof f.importNo === "string") next.import_no = f.importNo.trim().slice(0, 20) || null;
          if (typeof f.hasStems === "boolean") next.has_stems = f.hasStems ? 1 : 0;
          // Stems bundle: storing the key also switches the STEMS badge on.
          if (typeof f.stemsKey === "string" && /^masters\//.test(f.stemsKey)) {
            next.r2_key_stems = f.stemsKey;
            next.has_stems = 1;
          }
          if (f.clearStems) {
            // Drops BOTH the legacy pre-packed zip and the v2 per-file manifest.
            next.r2_key_stems = null;
            next.stems_manifest = null;
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
        // D1 (SQLite) caps bound variables at 100 PER STATEMENT. "Deselect all"
        // sends every playlist id × a couple hundred selected tracks in one
        // request, so both lists are chunked and each DELETE stays under the
        // cap (10 targets + 88 track ids = 98 variables, worst case).
        const chunk = <T,>(arr: T[], n: number): T[][] => {
          const out: T[][] = [];
          for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
          return out;
        };
        for (const targets of chunk(changes.remove ?? [], 10)) {
          for (const trackIds of chunk(ids, 88)) {
            const tMarks = targets.map((_, i) => `?${i + 1}`).join(", ");
            const idMarks = trackIds.map((_, i) => `?${targets.length + i + 1}`).join(", ");
            await db
              .prepare(`DELETE FROM ${table} WHERE ${col} IN (${tMarks}) AND track_id IN (${idMarks})`)
              .bind(...targets, ...trackIds)
              .run();
          }
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
      const tags = Array.isArray(body.tags) ? body.tags.slice(0, 50) : [];
      const wavZipKey =
        typeof body.wavZipKey === "string" && /^masters\//.test(body.wavZipKey)
          ? body.wavZipKey
          : null;
      const stemsKey =
        typeof body.stemsKey === "string" && /^masters\//.test(body.stemsKey)
          ? body.stemsKey
          : null;
      const wavManifest = cleanManifest(body.wavManifest);
      const stemsManifest = cleanManifest(body.stemsManifest);
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
              bpm, duration, description, tags, has_stems, cover, cover_thumb,
              r2_key_wav_zip, r2_key_stems, wav_manifest, stems_manifest, code, status)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)`,
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
          stemsKey || stemsManifest || body.hasStems ? 1 : 0,
          body.cover ?? "",
          body.coverThumb ?? "",
          wavZipKey,
          stemsKey,
          wavManifest ? JSON.stringify(wavManifest) : null,
          stemsManifest ? JSON.stringify(stemsManifest) : null,
          code,
          status,
        )
        .run();

      for (let i = 0; i < versions.length; i++) {
        const v = versions[i];
        const versionId = i === 0 ? "main" : `v${i + 1}`;
        const preview128 = isPreviewPath(v.preview128) ? v.preview128 : null;
        const vWavKey =
          typeof v.wavKey === "string" && /^masters\//.test(v.wavKey) ? v.wavKey : null;
        await db
          .prepare(
            `INSERT INTO track_versions
               (id, track_id, version_id, label, duration, preview_src, preview_128, r2_key_wav, sort)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
          )
          .bind(
            `${trackId}:${versionId}`,
            trackId,
            versionId,
            v.label?.trim() || (i === 0 ? "Main" : `Version ${i + 1}`),
            v.duration ?? "",
            v.previewSrc,
            preview128,
            vWavKey,
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
      // NOTE: this used to be `SELECT version_id, COALESCE(MAX(sort), -1) …` —
      // an aggregate next to a bare column, so SQLite returned ONE row however
      // many versions the track had. `usedIds` then held a single id, the new
      // version always tried to be "v2", and on any track that already had a v2
      // the INSERT died on the primary key: the previews were already uploaded,
      // the row never appeared, and the file became an orphan in R2. Read the
      // rows properly and compute both values from them.
      const existing = await db
        .prepare(`SELECT version_id, sort FROM track_versions WHERE track_id = ?1`)
        .bind(trackId)
        .all<{ version_id: string; sort: number | null }>();
      const rows = existing.results;
      const usedIds = new Set(rows.map((r) => r.version_id));
      let n = rows.length + 1;
      while (usedIds.has(`v${n}`)) n += 1;
      const versionId = `v${n}`;
      const maxSort = rows.reduce((m, r) => Math.max(m, r.sort ?? 0), -1);
      const preview128 =
        body.preview128 && /^\/(api\/file\/previews|audio\/previews)\//.test(body.preview128)
          ? body.preview128
          : null;
      try {
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
      } catch (e) {
        // A raw D1 throw becomes an HTML 500 and the client only sees "Request
        // failed" — while the previews it just uploaded sit orphaned in R2.
        return json(
          { error: `Could not add the version: ${e instanceof Error ? e.message : "database error"}` },
          500,
        );
      }
      if (typeof body.wavZipKey === "string" && /^masters\//.test(body.wavZipKey)) {
        await db.prepare(`UPDATE tracks SET r2_key_wav_zip = ?2 WHERE id = ?1`).bind(trackId, body.wavZipKey).run();
      }
      // v2 storage: the new version's WAV master joins wav_manifest, so the
      // customer's WAV zip (streamed at download time) contains it too.
      const me = cleanManifest(body.masterEntry ? [body.masterEntry] : undefined);
      if (me) {
        const row = await db
          .prepare(`SELECT wav_manifest FROM tracks WHERE id = ?1`)
          .bind(trackId)
          .first<{ wav_manifest: string | null }>();
        const current = parseManifest(row?.wav_manifest) ?? [];
        const merged = [...current.filter((e) => e.key !== me[0].key), ...me];
        await db
          .prepare(`UPDATE tracks SET wav_manifest = ?2 WHERE id = ?1`)
          .bind(trackId, JSON.stringify(merged))
          .run();
        // Link the row to its file: deleting this version later must be able to
        // drop exactly this master from the customer's WAV zip.
        await db
          .prepare(`UPDATE track_versions SET r2_key_wav = ?3 WHERE track_id = ?1 AND version_id = ?2`)
          .bind(trackId, versionId, me[0].key)
          .run();
      }
      return json({ ok: true, versionId });
    }

    case "add_stems": {
      // { id, stems: [{key,name,size,crc}] } — appends stem masters to the
      // track (v2 storage; the STEMS zip is streamed at download time) and
      // switches the STEMS download option on.
      const trackId = body.id;
      const incoming = cleanManifest(body.stems);
      if (!trackId || !incoming) return json({ error: "id and stems required" }, 400);
      await ensureTrackCoverColumn(db);

      const row = await db
        .prepare(`SELECT stems_manifest FROM tracks WHERE id = ?1`)
        .bind(trackId)
        .first<{ stems_manifest: string | null }>();
      if (!row) return json({ error: "Track not found" }, 404);

      const current = parseManifest(row.stems_manifest) ?? [];
      // Same filename twice = the owner re-dropped a file; the newer one wins.
      const byName = new Set(incoming.map((e) => e.name.toLowerCase()));
      const merged = [...current.filter((e) => !byName.has(e.name.toLowerCase())), ...incoming];
      await db
        .prepare(`UPDATE tracks SET stems_manifest = ?2, has_stems = 1 WHERE id = ?1`)
        .bind(trackId, JSON.stringify(merged))
        .run();
      return json({ ok: true, stems: merged.length });
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
      await ensureTrackCoverColumn(db);

      // What the customer downloads must mirror what the track actually HAS:
      // the deleted version's WAV master leaves wav_manifest (and R2) too.
      // Preferred link: track_versions.r2_key_wav (set on upload). Older rows
      // have no key, so we fall back to matching the manifest filename against
      // the version label (e.g. "…_30sec.wav" for the "30sec" version).
      const gone = await db
        .prepare(
          `SELECT label, r2_key_wav, preview_src, preview_128
             FROM track_versions WHERE track_id = ?1 AND version_id = ?2`,
        )
        .bind(trackId, versionId)
        .first<{
          label: string;
          r2_key_wav: string | null;
          preview_src: string | null;
          preview_128: string | null;
        }>();
      const trackRow = await db
        .prepare(`SELECT title, wav_manifest FROM tracks WHERE id = ?1`)
        .bind(trackId)
        .first<{ title: string; wav_manifest: string | null }>();

      await db
        .prepare(`DELETE FROM track_versions WHERE track_id = ?1 AND version_id = ?2`)
        .bind(trackId, versionId)
        .run();

      const manifest = parseManifest(trackRow?.wav_manifest);
      if (manifest && gone) {
        const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
        let next = manifest;
        if (gone.r2_key_wav) next = manifest.filter((e) => e.key !== gone.r2_key_wav);
        if (next.length === manifest.length) {
          // No stored key — match the file to the version by name. Only act on
          // an UNAMBIGUOUS single hit; never guess with a whole bundle at stake.
          const title = norm(trackRow?.title ?? "");
          const label = norm(gone.label ?? "");
          const suffix = (name: string) => {
            const base = norm(name.replace(/\.[a-z0-9]+$/i, ""));
            const i = title ? base.indexOf(title) : -1;
            return i >= 0 ? base.slice(i + title.length) : base;
          };
          if (label && label !== "main") {
            const hits = manifest.filter((e) => suffix(e.name) === label);
            if (hits.length === 1) next = manifest.filter((e) => e.key !== hits[0].key);
          }
        }
        if (next.length !== manifest.length) {
          const removed = manifest.filter((e) => !next.some((n) => n.key === e.key));
          await db
            .prepare(`UPDATE tracks SET wav_manifest = ?2 WHERE id = ?1`)
            .bind(trackId, next.length > 0 ? JSON.stringify(next) : null)
            .run();
          for (const e of removed) {
            try {
              await ctx.env.R2?.delete?.(e.key);
            } catch {
              // object already gone — the manifest is the source of truth
            }
          }
        }
      }

      // The version's MP3 previews (320 + 128) are its files too — delete a
      // version and NOTHING of it should be left paying rent in storage.
      for (const p of [gone?.preview_src, gone?.preview_128]) {
        const k = r2KeyOf(p);
        if (!k) continue;
        try {
          await ctx.env.R2?.delete?.(k);
        } catch {
          // already gone — fine
        }
      }

      if (typeof body.wavZipKey === "string" && /^masters\//.test(body.wavZipKey)) {
        await db.prepare(`UPDATE tracks SET r2_key_wav_zip = ?2 WHERE id = ?1`).bind(trackId, body.wavZipKey).run();
      }
      return json({ ok: true });
    }

    case "rename_version": {
      // { id, versionId, label, wavZipKey? } — the client also renames the
      // matching WAV inside the master bundle and re-uploads it, so customer
      // WAV downloads carry the new name too.
      const trackId = body.id;
      const versionId = body.versionId;
      const label = body.label?.trim();
      if (!trackId || !versionId || !label) return json({ error: "id, versionId and label required" }, 400);
      await db
        .prepare(`UPDATE track_versions SET label = ?3 WHERE track_id = ?1 AND version_id = ?2`)
        .bind(trackId, versionId, label.slice(0, 60))
        .run();
      if (typeof body.wavZipKey === "string" && /^masters\//.test(body.wavZipKey)) {
        await db.prepare(`UPDATE tracks SET r2_key_wav_zip = ?2 WHERE id = ?1`).bind(trackId, body.wavZipKey).run();
      }
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

    case "reorder_versions": {
      // { id, versionIds: [...] } — drag & drop order from the admin. The FIRST
      // one becomes the Main version (same rule the star already follows), so
      // the list the owner sees IS the list the customer gets, top to bottom.
      const trackId = body.id;
      const wanted = Array.isArray(body.versionIds)
        ? body.versionIds.filter((x): x is string => typeof x === "string" && !!x)
        : [];
      if (!trackId || wanted.length === 0) return json({ error: "id and versionIds required" }, 400);

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
      if (rows.results.length === 0) return json({ error: "Track has no versions" }, 404);

      // Anything the client didn't mention keeps its old relative place at the
      // end — a stale list can never silently drop a version.
      const byId = new Map(rows.results.map((r) => [r.version_id, r]));
      const ordered = [
        ...wanted.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r),
        ...rows.results.filter((r) => !wanted.includes(r.version_id)),
      ];

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
      // The track's headline duration follows its Main version.
      await db
        .prepare(`UPDATE tracks SET duration = ?2 WHERE id = ?1`)
        .bind(trackId, ordered[0].duration ?? "")
        .run();
      return json({ ok: true });
    }

    case "reorder_stems": {
      // { id, keys: [...] } — same drag & drop, for the stem files. The order is
      // the order they land in the customer's STEMS zip.
      const trackId = body.id;
      const wanted = Array.isArray(body.keys)
        ? body.keys.filter((x): x is string => typeof x === "string" && /^masters\//.test(x))
        : [];
      if (!trackId || wanted.length === 0) return json({ error: "id and keys required" }, 400);
      await ensureTrackCoverColumn(db);

      const row = await db
        .prepare(`SELECT stems_manifest FROM tracks WHERE id = ?1`)
        .bind(trackId)
        .first<{ stems_manifest: string | null }>();
      const manifest = parseManifest(row?.stems_manifest);
      if (!manifest) return json({ error: "This track has no stem files" }, 404);

      const byKey = new Map(manifest.map((e) => [e.key, e]));
      const next = [
        ...wanted.map((k) => byKey.get(k)).filter((e): e is NonNullable<typeof e> => !!e),
        ...manifest.filter((e) => !wanted.includes(e.key)),
      ];
      await db
        .prepare(`UPDATE tracks SET stems_manifest = ?2 WHERE id = ?1`)
        .bind(trackId, JSON.stringify(next))
        .run();
      return json({ ok: true });
    }

    case "delete_stem": {
      // { id: trackId, key: "masters/…" } — drops ONE stem file: the entry
      // leaves stems_manifest, the object leaves R2, and when the last stem is
      // gone has_stems flips off (the STEMS download option disappears).
      const trackId = body.id;
      const key = typeof body.key === "string" ? body.key : "";
      if (!trackId || !/^masters\//.test(key)) return json({ error: "id and key required" }, 400);
      await ensureTrackCoverColumn(db);

      const row = await db
        .prepare(`SELECT r2_key_stems, stems_manifest FROM tracks WHERE id = ?1`)
        .bind(trackId)
        .first<{ r2_key_stems: string | null; stems_manifest: string | null }>();
      if (!row) return json({ error: "Track not found" }, 404);

      const manifest = parseManifest(row.stems_manifest) ?? [];
      const next = manifest.filter((e) => e.key !== key);
      if (next.length === manifest.length) return json({ error: "Stem not found on this track" }, 404);

      const stillHasStems = next.length > 0 || !!row.r2_key_stems;
      await db
        .prepare(`UPDATE tracks SET stems_manifest = ?2, has_stems = ?3 WHERE id = ?1`)
        .bind(trackId, next.length > 0 ? JSON.stringify(next) : null, stillHasStems ? 1 : 0)
        .run();

      // Best-effort storage cleanup — the DB is the source of truth either way.
      // The stem's streaming MP3 goes with its master; leaving it behind is how
      // the bucket fills up with files nothing points at.
      const goneStem = manifest.find((e) => e.key === key);
      for (const k of [key, r2KeyOf(goneStem?.preview)]) {
        if (!k) continue;
        try {
          await ctx.env.R2?.delete?.(k);
        } catch {
          // object already gone / binding without delete — ignore
        }
      }
      return json({ ok: true, remaining: next.length, hasStems: stillHasStems });
    }

    case "delete_track": {
      const ids = Array.isArray(body.trackIds)
        ? [...new Set(body.trackIds.filter((x) => typeof x === "string" && x))].slice(0, 200)
        : body.id
          ? [body.id]
          : [];
      if (ids.length === 0) return json({ error: "trackIds required" }, 400);
      // D1 caps bound variables at 100 per statement — run every id-list
      // statement per chunk of 90 ids instead of one giant IN (...).
      const idChunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 90) idChunks.push(ids.slice(i, i + 90));
      await ensureTrackCoverColumn(db);

      // Collect every FILE these tracks own BEFORE the rows go — otherwise the
      // audio stays in R2 forever and the owner keeps paying for tracks that no
      // longer exist. Covers: previews (public), WAV + stem masters (private),
      // the legacy pre-packed zips, and the cover images we uploaded ourselves.
      const doomedKeys = new Set<string>();
      /** "/api/file/previews/x.mp3" (or a bare key) -> "previews/x.mp3". */
      const toKey = (v: string | null | undefined) => {
        if (!v) return null;
        const m = v.match(/^\/api\/file\/(.+)$/);
        const key = m ? m[1] : v;
        return /^(previews|masters|covers)\//.test(key) ? key : null;
      };
      try {
        for (const chunk of idChunks) {
        const marks = chunk.map((_, i) => `?${i + 1}`).join(", ");
        const rows = await db
          .prepare(
            `SELECT wav_manifest, stems_manifest, r2_key_wav_zip, r2_key_stems, cover, cover_thumb
               FROM tracks WHERE id IN (${marks})`,
          )
          .bind(...chunk)
          .all<{
            wav_manifest: string | null;
            stems_manifest: string | null;
            r2_key_wav_zip: string | null;
            r2_key_stems: string | null;
            cover: string | null;
            cover_thumb: string | null;
          }>();
        for (const r of rows.results) {
          for (const e of parseManifest(r.wav_manifest) ?? []) doomedKeys.add(e.key);
          for (const e of parseManifest(r.stems_manifest) ?? []) {
            doomedKeys.add(e.key);
            const pk = toKey(e.preview); // the stem's streaming MP3
            if (pk) doomedKeys.add(pk);
          }
          for (const v of [r.r2_key_wav_zip, r.r2_key_stems, r.cover, r.cover_thumb]) {
            const k = toKey(v);
            if (k) doomedKeys.add(k);
          }
        }
        const vrows = await db
          .prepare(
            `SELECT preview_src, preview_128, r2_key_wav FROM track_versions WHERE track_id IN (${marks})`,
          )
          .bind(...chunk)
          .all<{ preview_src: string | null; preview_128: string | null; r2_key_wav: string | null }>();
        for (const v of vrows.results) {
          for (const p of [v.preview_src, v.preview_128, v.r2_key_wav]) {
            const k = toKey(p);
            if (k) doomedKeys.add(k);
          }
        }
        }
      } catch {
        // legacy DB without some column — delete what we could read
      }

      for (const chunk of idChunks) {
        const marks = chunk.map((_, i) => `?${i + 1}`).join(", ");
        await db.prepare(`DELETE FROM track_versions WHERE track_id IN (${marks})`).bind(...chunk).run();
        await db.prepare(`DELETE FROM collection_tracks WHERE track_id IN (${marks})`).bind(...chunk).run();
        await db.prepare(`DELETE FROM playlist_tracks WHERE track_id IN (${marks})`).bind(...chunk).run();
        try {
          await db.prepare(`DELETE FROM category_tracks WHERE track_id IN (${marks})`).bind(...chunk).run();
        } catch {
          // category_tracks not created yet — fine
        }
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

      for (const chunk of idChunks) {
        const marks = chunk.map((_, i) => `?${i + 1}`).join(", ");
        await db.prepare(`DELETE FROM tracks WHERE id IN (${marks})`).bind(...chunk).run();
      }

      // Storage cleanup last: the DB is the source of truth, so a hiccup here
      // never blocks the delete — it only leaves an orphaned object behind.
      let filesDeleted = 0;
      for (const key of doomedKeys) {
        try {
          await ctx.env.R2?.delete?.(key);
          filesDeleted += 1;
        } catch {
          // already gone / no delete binding — carry on
        }
      }
      return json({ ok: true, deleted: ids.length, filesDeleted });
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
        // "/" is the storage separator — fold it to "&" so the value survives
        // the join/split round-trip (see cleanVocabValue).
        const clean = cleanVocabValue(value);
        if (!clean) return json({ error: "value required" }, 400);
        // It used to return ok and the UI cheerfully said "Value added" while
        // nothing happened — which reads as "the admin is broken". Say it plainly.
        const dupe = list.find((v) => v.toLowerCase() === clean.toLowerCase());
        if (dupe) {
          return json({ error: `"${dupe}" is already in the list`, code: "exists" }, 409);
        }
        list = [...list, clean];
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

    case "set_license_prices": {
      // Admin dashboard → "License prices" card. Stored in site_config; the
      // PayPal order endpoint prices carts from here (client is never trusted).
      const p = body.licensePrices;
      const valid = (v: unknown) => Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 100000;
      if (!p || !valid(p.personal) || !valid(p.commercial) || !valid(p.professional)) {
        return json({ error: "All three prices must be between 1 and 100000" }, 400);
      }
      const clean = {
        personal: Math.round(Number(p.personal) * 100) / 100,
        commercial: Math.round(Number(p.commercial) * 100) / 100,
        professional: Math.round(Number(p.professional) * 100) / 100,
      };
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES ('license_prices', ?1)
           ON CONFLICT(key) DO UPDATE SET value = ?1`,
        )
        .bind(JSON.stringify(clean))
        .run();
      return json({ ok: true, licensePrices: clean });
    }

    case "rename_vocab": {
      // Rename a value in place (keeps its position) AND rewrite every track
      // that carries it — so retagging for better sales is one action, no
      // manual re-ticking across the catalog.
      const facet = body.facet as VocabFacet;
      if (!VOCAB_KEY[facet]) return json({ error: "Unknown facet" }, 400);
      const value = body.value?.trim();
      const newValue = cleanVocabValue(body.newValue?.trim() ?? "");
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

    case "set_playlist_themes": {
      // Persisted playlist theme names (Playlists admin + /playlists page):
      // lets an empty theme exist before its first playlist is created.
      if (!Array.isArray(body.values)) return json({ error: "values required" }, 400);
      const seen = new Set<string>();
      const list: string[] = [];
      for (const raw of body.values) {
        if (typeof raw !== "string") continue;
        const v = raw.replace(/\s+/g, " ").trim().slice(0, 60);
        const k = v.toLowerCase();
        if (v && !seen.has(k)) {
          seen.add(k);
          list.push(v);
        }
        if (list.length >= 100) break;
      }
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES ('playlist_themes', ?1)
           ON CONFLICT(key) DO UPDATE SET value = ?1`,
        )
        .bind(JSON.stringify(list))
        .run();
      return json({ ok: true, values: list });
    }

    case "set_tags_base": {
      // Global Extra-tags base (Tags Base dialog in Tracks Edit). The AI
      // prompt-tagging picks a track's extra tags ONLY from this list.
      if (!Array.isArray(body.values)) return json({ error: "values required" }, 400);
      const seen = new Set<string>();
      const list: string[] = [];
      for (const raw of body.values) {
        if (typeof raw !== "string") continue;
        const v = raw.replace(/\s+/g, " ").trim().slice(0, 40);
        const k = v.toLowerCase();
        if (v && !seen.has(k)) {
          seen.add(k);
          list.push(v);
        }
        if (list.length >= 500) break;
      }
      await db
        .prepare(
          `INSERT INTO site_config (key, value) VALUES ('extra_tags_base', ?1)
           ON CONFLICT(key) DO UPDATE SET value = ?1`,
        )
        .bind(JSON.stringify(list))
        .run();
      return json({ ok: true, values: list });
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
        const v = cleanVocabValue(raw);
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
