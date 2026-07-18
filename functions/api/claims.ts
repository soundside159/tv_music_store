import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "./_utils";

// Content ID claim requests.
//
// POST  { videoUrl, trackSlugs? } — a customer asks us to get a claim released.
//                                   trackSlugs = the tracks heard in the video
//                                   (multiple per video; legacy trackSlug also
//                                   accepted). Re-submitting the same video
//                                   merges the tracks into the open ticket.
// GET                             — his own requests (admins: ?all=1 for every
//                                   one, incl. customer + per-track composer).
// PATCH { id, status }            — admin only: new / in_progress / done.
//
// THE VALIDATION MATTERS. A claim can only be released against a video that
// YouTube will actually show us: a PRIVATE video is invisible to the API, so we
// cannot find it, cannot send it for release, and would only be able to promise
// something we cannot do. Public and unlisted are both fine — unlisted is
// fetchable by id, which is all we need.

const YT = "https://www.googleapis.com/youtube/v3";

/** Pulls the 11-character video id out of any of YouTube's URL shapes. */
const videoIdOf = (raw: string): string | null => {
  const value = raw.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = p.exec(value);
    if (m) return m[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
};

interface YtVideo {
  id: string;
  snippet?: { title?: string; channelTitle?: string };
  status?: { privacyStatus?: string };
}

const ensureClaimsTable = async (ctx: Ctx) => {
  await ctx.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS claim_requests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT REFERENCES users(id),
       track_id TEXT,
       composer_id TEXT,
       video_url TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'new',
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       resolved_at TEXT,
       track_ids TEXT
     )`,
  ).run();
  // The prod table pre-dates track_ids; CREATE TABLE IF NOT EXISTS never alters
  // an existing table, so add the column the same self-healing way wl_channels
  // got channel_ref.
  try {
    await ctx.env.DB.prepare(`ALTER TABLE claim_requests ADD COLUMN track_ids TEXT`).run();
  } catch {
    // column already there
  }
};

/** JSON column -> string[] (never throws — bad data reads as no tracks). */
const parseIds = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

interface TrackInfo {
  id: string;
  slug: string;
  title: string;
  composer: string | null;
}

/** One IN(...) query for every track referenced by the given claims. */
const trackInfoMap = async (ctx: Ctx, ids: string[]): Promise<Map<string, TrackInfo>> => {
  const map = new Map<string, TrackInfo>();
  const unique = [...new Set(ids)].slice(0, 200);
  if (unique.length === 0) return map;
  const marks = unique.map((_, i) => `?${i + 1}`).join(",");
  const rows = await ctx.env.DB.prepare(
    `SELECT t.id, t.slug, t.title, c.display_name AS composer
       FROM tracks t
       LEFT JOIN composers c ON c.id = t.composer_id
      WHERE t.id IN (${marks})`,
  )
    .bind(...unique)
    .all<TrackInfo>();
  for (const r of rows.results) map.set(r.id, r);
  return map;
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in first", code: "auth" }, 401);

  const body = await readJson<{ videoUrl?: string; trackSlug?: string; trackSlugs?: string[] }>(
    ctx.request,
  );
  const raw = body?.videoUrl?.trim() ?? "";
  const videoId = videoIdOf(raw);
  if (!videoId) {
    return json({ error: "That does not look like a YouTube video link", code: "badurl" }, 400);
  }

  // Ask YouTube whether the video exists and whether we can see it.
  const key = ctx.env.YOUTUBE_API_KEY;
  if (key) {
    try {
      const res = await fetch(
        `${YT}/videos?part=snippet,status&id=${videoId}&key=${encodeURIComponent(key)}`,
      );
      const data = (await res.json()) as { items?: YtVideo[] };
      const video = data.items?.[0];
      if (!video) {
        return json(
          {
            error:
              "We cannot see that video. It has to be published first — a private video is invisible to YouTube's API, so no one can release a claim on it. Set it to Public or Unlisted and send the link again.",
            code: "private",
          },
          400,
        );
      }
      if (video.status?.privacyStatus === "private") {
        return json(
          {
            error:
              "That video is private. Make it Unlisted or Public and send the link again — a claim cannot be cleared on a video nobody can open.",
            code: "private",
          },
          400,
        );
      }
    } catch {
      // YouTube unreachable — take the request anyway, a human will look at it.
    }
  }

  await ensureClaimsTable(ctx);

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Which tracks the customer heard in the video (slugs -> ids + composer).
  const slugs = [
    ...new Set(
      [...(Array.isArray(body?.trackSlugs) ? body.trackSlugs : []), body?.trackSlug ?? ""]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean),
    ),
  ].slice(0, 10);
  let resolved: { id: string; composer_id: string | null }[] = [];
  if (slugs.length > 0) {
    const marks = slugs.map((_, i) => `?${i + 1}`).join(",");
    const rows = await ctx.env.DB.prepare(
      `SELECT id, composer_id FROM tracks WHERE slug IN (${marks})`,
    )
      .bind(...slugs)
      .all<{ id: string; composer_id: string | null }>();
    resolved = rows.results;
  }
  const trackIds = resolved.map((t) => t.id);

  // Already asked for this one? Don't create a second ticket — but DO merge any
  // newly named tracks into the open one, so "oh, and this track too" works.
  const existing = await ctx.env.DB.prepare(
    `SELECT id, track_ids, track_id FROM claim_requests
      WHERE user_id = ?1 AND video_url = ?2 AND status <> 'done' LIMIT 1`,
  )
    .bind(user.id, url)
    .first<{ id: number; track_ids: string | null; track_id: string | null }>();
  if (existing) {
    if (trackIds.length > 0) {
      const merged = [
        ...new Set([
          ...parseIds(existing.track_ids),
          ...(existing.track_id ? [existing.track_id] : []),
          ...trackIds,
        ]),
      ];
      await ctx.env.DB.prepare(
        `UPDATE claim_requests SET track_ids = ?1, track_id = COALESCE(track_id, ?2) WHERE id = ?3`,
      )
        .bind(JSON.stringify(merged), trackIds[0] ?? null, existing.id)
        .run();
    }
    return json({ ok: true, duplicate: true });
  }

  // Legacy single-track columns keep working: first named track + its composer.
  const trackId = trackIds[0] ?? null;
  const composerId = resolved.find((t) => t.composer_id)?.composer_id ?? null;

  await ctx.env.DB.prepare(
    `INSERT INTO claim_requests (user_id, track_id, composer_id, video_url, status, track_ids)
     VALUES (?1, ?2, ?3, ?4, 'new', ?5)`,
  )
    .bind(user.id, trackId, composerId, url, trackIds.length > 0 ? JSON.stringify(trackIds) : null)
    .run();

  return json({ ok: true });
};

interface ClaimRow {
  id: number;
  video_url: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  track_id: string | null;
  track_ids: string | null;
  user_email?: string;
  user_name?: string | null;
  user_id?: string;
}

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  await ensureClaimsTable(ctx);

  const isAdmin = user.role === "admin" || user.email === OWNER_EMAIL;
  const all = new URL(ctx.request.url).searchParams.get("all") === "1" && isAdmin;

  const rows = all
    ? await ctx.env.DB.prepare(
        `SELECT c.id, c.video_url, c.status, c.created_at, c.resolved_at,
                c.track_id, c.track_ids, c.user_id,
                u.email AS user_email, u.name AS user_name
           FROM claim_requests c
           LEFT JOIN users u ON u.id = c.user_id
          ORDER BY c.created_at DESC LIMIT 200`,
      ).all<ClaimRow>()
    : await ctx.env.DB.prepare(
        `SELECT c.id, c.video_url, c.status, c.created_at, c.resolved_at,
                c.track_id, c.track_ids
           FROM claim_requests c
          WHERE c.user_id = ?1
          ORDER BY c.created_at DESC LIMIT 100`,
      )
        .bind(user.id)
        .all<ClaimRow>();

  // Resolve every referenced track (JSON list + the legacy single column) in
  // one query, then hang [{id,title,composer}] off each claim.
  const claimIds = (r: ClaimRow) => {
    const ids = parseIds(r.track_ids);
    if (r.track_id && !ids.includes(r.track_id)) ids.unshift(r.track_id);
    return ids;
  };
  const info = await trackInfoMap(
    ctx,
    rows.results.flatMap((r) => claimIds(r)),
  );

  const claims = rows.results.map((r) => {
    const tracks = claimIds(r)
      .map((id) => info.get(id))
      .filter((t): t is TrackInfo => !!t)
      .map((t) => ({ id: t.id, slug: t.slug, title: t.title, composer: t.composer }));
    return {
      id: r.id,
      video_url: r.video_url,
      status: r.status,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      track_title: tracks[0]?.title ?? null, // legacy field, older UI reads it
      tracks,
      ...(all
        ? { user_id: r.user_id, user_email: r.user_email, user_name: r.user_name ?? null }
        : {}),
    };
  });

  return json({ claims });
};

const STATUSES = new Set(["new", "in_progress", "done"]);

export const onRequestPatch = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  const isAdmin = user && (user.role === "admin" || user.email === OWNER_EMAIL);
  if (!isAdmin) return json({ error: "Admins only" }, 403);
  await ensureClaimsTable(ctx);

  const body = await readJson<{ id?: number; status?: string }>(ctx.request);
  const id = typeof body?.id === "number" ? body.id : NaN;
  const status = body?.status ?? "";
  if (!Number.isInteger(id) || !STATUSES.has(status)) {
    return json({ error: "Bad request" }, 400);
  }

  await ctx.env.DB.prepare(
    `UPDATE claim_requests
        SET status = ?1,
            resolved_at = CASE WHEN ?1 = 'done' THEN datetime('now') ELSE NULL END
      WHERE id = ?2`,
  )
    .bind(status, id)
    .run();

  return json({ ok: true });
};
