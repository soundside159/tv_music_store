import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "./_utils";

// Content ID claim requests.
//
// POST { videoUrl, trackSlug? } — a customer asks us to get a claim released.
// GET                            — his own requests (admins: ?all=1 for every one).
//
// THE VALIDATION MATTERS. A claim can only be released against a video that
// YouTube will actually show us: a PRIVATE video is invisible to the API, so we
// cannot find it, cannot send it for release, and would only be able to promise
// something we cannot do. Public and unlisted are both fine — unlisted is
// fetchable by id, which is all we need.
//
// This is also why "whitelisting" cannot work in advance: a video has to exist
// before anyone can clear a claim on it.

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
       resolved_at TEXT
     )`,
  ).run();
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in first", code: "auth" }, 401);

  const body = await readJson<{ videoUrl?: string; trackSlug?: string }>(ctx.request);
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

  // Already asked for this one? Don't create a second ticket.
  const existing = await ctx.env.DB.prepare(
    `SELECT id FROM claim_requests WHERE user_id = ?1 AND video_url = ?2 AND status <> 'done' LIMIT 1`,
  )
    .bind(user.id, url)
    .first<{ id: number }>();
  if (existing) return json({ ok: true, duplicate: true });

  // Which track / composer, when the customer told us.
  let trackId: string | null = null;
  let composerId: string | null = null;
  if (body?.trackSlug) {
    const track = await ctx.env.DB.prepare(
      `SELECT id, composer_id FROM tracks WHERE slug = ?1 LIMIT 1`,
    )
      .bind(body.trackSlug)
      .first<{ id: string; composer_id: string | null }>();
    trackId = track?.id ?? null;
    composerId = track?.composer_id ?? null;
  }

  await ctx.env.DB.prepare(
    `INSERT INTO claim_requests (user_id, track_id, composer_id, video_url, status)
     VALUES (?1, ?2, ?3, ?4, 'new')`,
  )
    .bind(user.id, trackId, composerId, url)
    .run();

  return json({ ok: true });
};

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
                t.title AS track_title, u.email AS user_email
           FROM claim_requests c
           LEFT JOIN tracks t ON t.id = c.track_id
           LEFT JOIN users u ON u.id = c.user_id
          ORDER BY c.created_at DESC LIMIT 200`,
      ).all()
    : await ctx.env.DB.prepare(
        `SELECT c.id, c.video_url, c.status, c.created_at, c.resolved_at,
                t.title AS track_title
           FROM claim_requests c
           LEFT JOIN tracks t ON t.id = c.track_id
          WHERE c.user_id = ?1
          ORDER BY c.created_at DESC LIMIT 100`,
      )
        .bind(user.id)
        .all();

  return json({ claims: rows.results });
};
