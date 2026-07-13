import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx, type D1Database } from "../_utils";
import { parseManifest } from "../_zipStream";

// GET  /api/admin/storage  -> what is in R2 that NOTHING in the database points at.
// POST /api/admin/storage { confirm: true } -> deletes exactly those objects.
//
// Why this exists: until 2026-07-13 deleting a track (or a version, or stems)
// only removed the DATABASE rows — the audio stayed in the bucket forever. This
// sweep is the cleanup for everything that was orphaned back then, and a safety
// net for anything that slips through later.
//
// The rule is deliberately blunt: an object is an orphan ONLY if no row in D1
// references its key. Anything the DB still knows about is never touched, so the
// worst case of a bug here is that we skip a file, never that we delete a live one.

const SWEPT_PREFIXES = ["previews/", "masters/", "covers/"];

/** "/api/file/previews/x.mp3" (or a bare key) -> "previews/x.mp3". */
const toKey = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const m = v.match(/^\/api\/file\/(.+)$/);
  const key = m ? m[1] : v;
  return SWEPT_PREFIXES.some((p) => key.startsWith(p)) ? key : null;
};

/** Every R2 key the database still points at. */
const referencedKeys = async (db: D1Database): Promise<Set<string>> => {
  const keep = new Set<string>();
  const add = (v: string | null | undefined) => {
    const k = toKey(v);
    if (k) keep.add(k);
  };

  try {
    const rows = await db
      .prepare(
        `SELECT wav_manifest, stems_manifest, r2_key_wav_zip, r2_key_stems, cover, cover_thumb FROM tracks`,
      )
      .all<{
        wav_manifest: string | null;
        stems_manifest: string | null;
        r2_key_wav_zip: string | null;
        r2_key_stems: string | null;
        cover: string | null;
        cover_thumb: string | null;
      }>();
    for (const r of rows.results) {
      for (const e of parseManifest(r.wav_manifest) ?? []) keep.add(e.key);
      for (const e of parseManifest(r.stems_manifest) ?? []) keep.add(e.key);
      add(r.r2_key_wav_zip);
      add(r.r2_key_stems);
      add(r.cover);
      add(r.cover_thumb);
    }
  } catch {
    // legacy DB without a column — the queries below still narrow the sweep
  }

  try {
    const rows = await db
      .prepare(`SELECT preview_src, preview_128, r2_key_wav FROM track_versions`)
      .all<{ preview_src: string | null; preview_128: string | null; r2_key_wav: string | null }>();
    for (const r of rows.results) {
      add(r.preview_src);
      add(r.preview_128);
      add(r.r2_key_wav);
    }
  } catch {
    // ditto
  }

  // Cover images of collections / playlists / categories / composer avatars.
  for (const sql of [
    `SELECT image AS v FROM collections`,
    `SELECT image AS v FROM playlists`,
    `SELECT image AS v FROM categories`,
    `SELECT avatar AS v FROM composers`,
  ]) {
    try {
      const rows = await db.prepare(sql).all<{ v: string | null }>();
      for (const r of rows.results) add(r.v);
    } catch {
      // table/column not there — nothing to keep from it
    }
  }
  return keep;
};

/** Everything currently sitting in the bucket under the swept prefixes. */
const bucketObjects = async (
  r2: NonNullable<Ctx["env"]["R2"]>,
): Promise<{ key: string; size: number }[]> => {
  const out: { key: string; size: number }[] = [];
  for (const prefix of SWEPT_PREFIXES) {
    let cursor: string | undefined;
    for (;;) {
      const page = await r2.list?.({ prefix, cursor, limit: 1000 });
      if (!page) break;
      out.push(...page.objects.map((o) => ({ key: o.key, size: o.size })));
      if (!page.truncated || !page.cursor) break;
      cursor = page.cursor;
    }
  }
  return out;
};

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) return json({ error: "Admin only" }, 403);
  return null;
};

export const onRequestGet = async (ctx: Ctx) => {
  const gate = await requireAdmin(ctx);
  if (gate) return gate;
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  if (!ctx.env.R2?.list) return json({ error: "R2 not bound" }, 503);

  const keep = await referencedKeys(ctx.env.DB);
  const objects = await bucketObjects(ctx.env.R2);
  const orphans = objects.filter((o) => !keep.has(o.key));
  const bytes = orphans.reduce((n, o) => n + o.size, 0);

  return json({
    ok: true,
    total: objects.length,
    totalBytes: objects.reduce((n, o) => n + o.size, 0),
    orphans: orphans.length,
    orphanBytes: bytes,
    // A sample, so the owner can eyeball what would go before pressing delete.
    sample: orphans.slice(0, 20).map((o) => ({ key: o.key, size: o.size })),
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  const gate = await requireAdmin(ctx);
  if (gate) return gate;
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  if (!ctx.env.R2?.list || !ctx.env.R2?.delete) return json({ error: "R2 not bound" }, 503);

  const body = await readJson<{ confirm?: boolean }>(ctx.request);
  if (!body?.confirm) return json({ error: "confirm required" }, 400);

  const keep = await referencedKeys(ctx.env.DB);
  const objects = await bucketObjects(ctx.env.R2);
  const orphans = objects.filter((o) => !keep.has(o.key));

  let deleted = 0;
  let bytes = 0;
  for (const o of orphans) {
    try {
      await ctx.env.R2.delete(o.key);
      deleted += 1;
      bytes += o.size;
    } catch {
      // already gone — fine
    }
  }
  return json({ ok: true, deleted, bytes });
};
