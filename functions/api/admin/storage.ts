import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx, type D1Database } from "../_utils";
import { parseManifest } from "../_zipStream";

// GET  /api/admin/storage -> what is in R2 that NOTHING in the database points at.
// POST { confirm: true } -> deletes exactly those orphans.
// POST { confirm: true, wipeTransactions: true } -> clears the TEST money tables
//      (download history, licence codes, one-time orders, revenue, payout runs).
//
// There is deliberately NO "delete everything" action here: the owner spent real
// time building the playlists/collections and the tags, and one mis-click must
// never be able to take the catalogue with it. Tracks are deleted one by one (or
// by selection) in Tracks Edit, and their files go with them.
//
// Why this exists: until 2026-07-13 deleting a track (or a version, or stems)
// only removed the DATABASE rows — the audio stayed in the bucket forever. This
// sweep is the cleanup for everything that was orphaned back then, and a safety
// net for anything that slips through later.
//
// The rule is deliberately blunt: an object is an orphan ONLY if no row in D1
// references its key. Anything the DB still knows about is never touched, so the
// worst case of a bug here is that we skip a file, never that we delete a live one.

const SWEPT_PREFIXES = ["previews/", "masters/", "covers/", "sfx/"];

/** "/api/file/previews/x.mp3" (or a bare key) -> "previews/x.mp3". */
const toKey = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const m = v.match(/^\/api\/file\/(.+)$/);
  const key = m ? m[1] : v;
  return SWEPT_PREFIXES.some((p) => key.startsWith(p)) ? key : null;
};

// (SFX masters live under sfx/ — their own prefix, never mixed with masters/.)

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
      for (const e of parseManifest(r.stems_manifest) ?? []) {
        keep.add(e.key);
        add(e.preview); // the stem's streaming MP3 (mini-DAW layers)
      }
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

  // Sound effects: the WAV master (sfx/…) and its streaming MP3 (previews/…).
  try {
    const rows = await db.prepare(`SELECT wav_key, preview_src FROM sfx`).all<{
      wav_key: string | null;
      preview_src: string | null;
    }>();
    for (const r of rows.results) {
      add(r.wav_key);
      add(r.preview_src);
    }
  } catch {
    // the sfx table doesn't exist yet — nothing to keep from it
  }

  // Cover images of collections / playlists / categories / composer avatars.
  for (const sql of [
    `SELECT image AS v FROM collections`,
    `SELECT image AS v FROM playlists`,
    `SELECT image AS v FROM categories`,
    `SELECT image AS v FROM sfx_categories`,
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

  // What the megabytes actually ARE. (Licence PDFs are NOT in here — they are
  // generated on the fly per download and never stored.)
  const group = (prefix: string) => {
    const list = objects.filter((o) => o.key.startsWith(prefix));
    return { files: list.length, bytes: list.reduce((n, o) => n + o.size, 0) };
  };
  const breakdown = {
    previews: group("previews/"), // MP3 320 + 128 per version, MP3 320 per stem/sound
    masters: group("masters/"), // WAV versions + WAV stems (what customers download)
    covers: group("covers/"), // track / collection / playlist artwork
    sfx: group("sfx/"), // sound-effect WAV masters
  };

  const trackCount = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM tracks`)
    .first<{ n: number }>()
    .catch(() => null);

  return json({
    ok: true,
    total: objects.length,
    totalBytes: objects.reduce((n, o) => n + o.size, 0),
    orphans: orphans.length,
    orphanBytes: bytes,
    breakdown,
    tracks: trackCount?.n ?? 0,
    // A sample, so the owner can eyeball what would go before pressing delete.
    sample: orphans.slice(0, 20).map((o) => ({ key: o.key, size: o.size })),
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  const gate = await requireAdmin(ctx);
  if (gate) return gate;
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  if (!ctx.env.R2?.list || !ctx.env.R2?.delete) return json({ error: "R2 not bound" }, 503);

  const body = await readJson<{ confirm?: boolean; wipeTransactions?: boolean }>(ctx.request);
  if (!body?.confirm) return json({ error: "confirm required" }, 400);

  // TEST-DATA RESET (pre-launch only): the rows produced while playing with the
  // Stripe TEST keys have no accounting value — they only skew the revenue
  // engine, the composer payouts and the download counters. SUBSCRIPTIONS are
  // deliberately NOT touched: dropping them would silently demote a live paying
  // account to Free while its subscription keeps billing at the provider.
  if (body.wipeTransactions) {
    const db = ctx.env.DB;
    const cleared: Record<string, boolean> = {};
    for (const table of [
      "download_log", // download history + the Free-tier monthly counter
      "plan_licenses", // per-track licence codes minted for subscribers
      "subscription_licenses",
      "sync_orders", // one-time track licences (purchases)
      "revenue_events", // money booked into the payout engine
      "revenue_allocations", // its per-composer split
      "payout_runs",
    ]) {
      try {
        await db.prepare(`DELETE FROM ${table}`).run();
        cleared[table] = true;
      } catch {
        cleared[table] = false; // table not created yet — nothing to clear
      }
    }
    return json({ ok: true, clearedTransactions: cleared });
  }

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
