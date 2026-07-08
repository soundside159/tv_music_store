import { getSessionUser, json, newId, readJson, type Ctx, type D1Database } from "../_utils";
import { ensureTrackCodes, generateTrackCode } from "../_codes";

// Composer panel API (stage 4 of the mass-import plan).
// GET  -> the signed-in composer's own tracks (all statuses) + their profile.
// POST -> create a track from the composer's simple Add-track flow. Created as
//         status='draft' + moderation_status='pending' — it lands in the admin
//         Tracks manager for review; the owner tags/covers it and publishes
//         (publish auto-approves). Composers never see other composers' tracks.

interface ComposerRow {
  id: string;
  display_name: string;
}

const getComposer = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  // Being a composer = having a `composers` profile linked to the user — the
  // role no longer matters (the owner is admin AND composer at the same time).
  const composer = await ctx.env.DB.prepare(
    `SELECT id, display_name FROM composers WHERE user_id = ?1 LIMIT 1`,
  )
    .bind(user.id)
    .first<ComposerRow>();
  if (!composer) {
    return {
      error: json(
        { error: "No composer profile yet — ask the site owner to enable Composer on your account." },
        403,
      ),
    };
  }
  return { user, composer };
};

/** Same lazy ALTERs as the admin editor — composer uploads need these columns. */
const ensureTrackColumns = async (db: D1Database) => {
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

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || newId("trk");

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await getComposer(ctx);
  if (gate.error) return gate.error;
  const db = ctx.env.DB;

  const rows = await db
    .prepare(
      `SELECT t.id, t.slug, t.title, t.duration, t.bpm, t.status, t.moderation_status, t.created_at,
              (SELECT COUNT(*) FROM track_versions v WHERE v.track_id = t.id) AS versions,
              (SELECT COUNT(*) FROM download_log d WHERE d.track_id = t.id) AS downloads
         FROM tracks t
        WHERE t.composer_id = ?1
        ORDER BY t.created_at DESC`,
    )
    .bind(gate.composer.id)
    .all<{
      id: string;
      slug: string;
      title: string;
      duration: string | null;
      bpm: number | null;
      status: string;
      moderation_status: string;
      created_at: string | null;
      versions: number;
      downloads: number;
    }>();

  return json({
    composer: { id: gate.composer.id, displayName: gate.composer.display_name },
    tracks: rows.results,
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await getComposer(ctx);
  if (gate.error) return gate.error;
  const db = ctx.env.DB;

  const body = await readJson<{
    title?: string;
    bpm?: number;
    description?: string;
    tags?: string[];
    versions?: { label?: string; previewSrc?: string; preview128?: string; duration?: string }[];
    wavZipKey?: string;
    stemsKey?: string;
  }>(ctx.request);
  const title = body?.title?.trim();
  if (!title) return json({ error: "Title required" }, 400);

  const isPreviewPath = (p: string | undefined): p is string =>
    !!p && /^\/(api\/file\/previews|audio\/previews)\//.test(p);
  const versions = (Array.isArray(body?.versions) ? body!.versions! : [])
    .filter((v) => isPreviewPath(v.previewSrc))
    .slice(0, 12);
  if (versions.length === 0) {
    return json({ error: "Upload at least one WAV (its 320 kbps preview is required)" }, 400);
  }

  await ensureTrackColumns(db);
  await ensureTrackCodes(db);
  const code = await generateTrackCode(db);
  if (code === null) return json({ error: "All track codes (1000-9999) are in use" }, 507);

  const trackId = newId("trk");
  const slug = `${code}-${slugify(title)}`;
  const bpm = Number.isFinite(body?.bpm) ? Math.round(body!.bpm as number) : null;
  const tags = Array.isArray(body?.tags) ? body!.tags!.slice(0, 12) : [];
  const wavZipKey =
    typeof body?.wavZipKey === "string" && /^masters\//.test(body.wavZipKey) ? body.wavZipKey : null;
  const stemsKey =
    typeof body?.stemsKey === "string" && /^masters\//.test(body.stemsKey) ? body.stemsKey : null;

  await db
    .prepare(
      `INSERT INTO tracks
         (id, slug, title, composer_id, category, genre, mood, use_case, style_of,
          bpm, duration, description, tags, has_stems, cover, cover_thumb,
          r2_key_wav_zip, r2_key_stems, code, status, moderation_status)
       VALUES (?1, ?2, ?3, ?4, 'production', '', '', '', '',
               ?5, ?6, ?7, ?8, ?9, '', '', ?10, ?11, ?12, 'draft', 'pending')`,
    )
    .bind(
      trackId,
      slug,
      title,
      gate.composer.id,
      bpm,
      versions[0].duration ?? "",
      body?.description ?? "",
      JSON.stringify(tags),
      stemsKey ? 1 : 0,
      wavZipKey,
      stemsKey,
      code,
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
};
