// Whitelist auto-scanning: shared data layer (underscore = not routed).
//
// Chain:
//   customer adds a channel (wl_channels)
//   -> refreshChannels(): new uploads published on/after the channel's
//      check_from date go into wl_videos as 'queued'
//   -> the desktop scanner (tools/whitelist_tester) takes the queue, downloads
//      the audio, fingerprints it and posts the found tracks back
//   -> wl_matches: one row per (video, track); eligible = the customer had a
//      PAID plan when the video was published (license terms par. 4: tracks
//      used while subscribed stay licensed forever)
//   -> composer sheets / emails (_wlsheets.ts) move matches to in_sheet and
//      read 'Released' back.
//
// Custom lists (owner, 2026-11-05): channels the owner adds himself in
// Admin -> Whitelisting -> Custom, grouped by a name (e.g. "Pixabay": other
// stocks ask him to release claims). They belong to no customer
// (user_id = CUSTOM_USER), need no plan and are always released.

import { bumpUsage } from "../_usage";
import { newId, type D1Database, type Env } from "../_utils";
import { ytChannel } from "./_whitelist";

const YT = "https://www.googleapis.com/youtube/v3";
export const PLAN_LIMITS: Record<string, number> = { free: 0, pro: 3, max: 10 };
const CHECK_FROM_MARGIN_DAYS = 2;
const REFRESH_EVERY_MIN = 30;
const LEASE_MIN = 60;
export const CUSTOM_USER = "custom";
/** A customer's "Solo videos": single videos the owner adds for that customer
 *  without a channel. They live in a pseudo channel (channel_url = SOLO_URL)
 *  that never counts against the plan's channel limit and is never refreshed. */
export const SOLO_URL = "solo";
export const isSolo = (c: { channel_url: string }) => c.channel_url === SOLO_URL;

export const ensureSoloChannel = async (db: D1Database, userId: string) => {
  const id = "wch_solo_" + userId;
  await db
    .prepare(
      `INSERT OR IGNORE INTO wl_channels (id, user_id, channel_url, channel_ref, yt_title, yt_uploads, custom_group)
       VALUES (?1, ?2, ?3, NULL, 'Solo videos', NULL, NULL)`,
    )
    .bind(id, userId, SOLO_URL)
    .run();
  return id;
};

/** Add one video to a customer's Solo videos (queued for the scanner). */
export const addSoloVideo = async (env: Env, userId: string, videoId: string) => {
  const db = env.DB;
  await ensureWlScan(db);
  if (!env.YOUTUBE_API_KEY) return { error: "YOUTUBE_API_KEY is not set" };
  const user = await db.prepare(`SELECT id FROM users WHERE id = ?1`).bind(userId).first<{ id: string }>();
  if (!user) return { error: "No such customer" };
  void bumpUsage(db, "youtube", 1);
  const res = await fetch(`${YT}/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${env.YOUTUBE_API_KEY}`);
  const data = (await res.json().catch(() => ({}))) as {
    items?: { snippet?: { title?: string; publishedAt?: string; channelTitle?: string } }[];
  };
  const sn = data.items?.[0]?.snippet;
  if (!sn) return { error: "YouTube does not show this video (private or wrong link)." };
  const dup = await db.prepare(`SELECT channel_id FROM wl_videos WHERE video_id = ?1`).bind(videoId).first<{ channel_id: string }>();
  if (dup && !dup.channel_id.startsWith("wch_solo_") && !dup.channel_id.startsWith("wch_csolo_")) {
    return { error: "This video is already covered by a whitelisted channel." };
  }
  const chId = await ensureSoloChannel(db, userId);
  await db
    .prepare(
      `INSERT INTO wl_videos (video_id, channel_id, user_id, title, published_at, status, note)
       VALUES (?1, ?2, ?3, ?4, ?5, 'queued', 'solo')
       ON CONFLICT(video_id) DO UPDATE SET channel_id = ?2, user_id = ?3, note = 'solo', status = 'queued'`,
    )
    .bind(videoId, chId, userId, sn.title ?? "", sn.publishedAt ?? "")
    .run();
  return { ok: true, channelId: chId, title: sn.title ?? "", channelTitle: sn.channelTitle ?? "" };
};

export const removeSoloVideo = async (db: D1Database, videoId: string) => {
  await ensureWlScan(db);
  const r = await db
    .prepare(`DELETE FROM wl_videos WHERE video_id = ?1 AND (channel_id LIKE 'wch_solo_%' OR channel_id LIKE 'wch_csolo_%')`)
    .bind(videoId)
    .run();
  return { ok: !!(r as { meta?: { changes?: number } }).meta?.changes };
};

let ready = false;
export const ensureWlScan = async (db: D1Database) => {
  if (ready) return;
  for (const sql of [
    `ALTER TABLE wl_channels ADD COLUMN check_from TEXT`,
    `ALTER TABLE wl_channels ADD COLUMN yt_title TEXT`,
    `ALTER TABLE wl_channels ADD COLUMN yt_uploads TEXT`,
    `ALTER TABLE wl_channels ADD COLUMN last_refresh TEXT`,
    `ALTER TABLE wl_channels ADD COLUMN custom_group TEXT`,
  ]) {
    try {
      await db.prepare(sql).run();
    } catch {
      // column exists
    }
  }
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS wl_custom_lists (
         name       TEXT PRIMARY KEY,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS wl_videos (
         video_id     TEXT PRIMARY KEY,
         channel_id   TEXT NOT NULL,
         user_id      TEXT NOT NULL,
         title        TEXT,
         published_at TEXT,
         status       TEXT NOT NULL DEFAULT 'queued',
         leased_at    TEXT,
         scanned_at   TEXT,
         note         TEXT,
         found        INTEGER NOT NULL DEFAULT 0,
         created_at   TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_wl_videos_status ON wl_videos(status)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_wl_videos_channel ON wl_videos(channel_id)`).run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS wl_matches (
         id           INTEGER PRIMARY KEY AUTOINCREMENT,
         video_id     TEXT NOT NULL,
         channel_id   TEXT NOT NULL,
         user_id      TEXT NOT NULL,
         track_id     TEXT,
         track_title  TEXT NOT NULL,
         composer_id  TEXT,
         regions      TEXT,
         total_s      REAL NOT NULL DEFAULT 0,
         score        INTEGER NOT NULL DEFAULT 0,
         eligible     INTEGER NOT NULL DEFAULT 0,
         state        TEXT NOT NULL DEFAULT 'new',
         sheet_date   TEXT,
         released_at  TEXT,
         created_at   TEXT NOT NULL DEFAULT (datetime('now')),
         UNIQUE (video_id, track_title)
       )`,
    )
    .run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_wl_matches_state ON wl_matches(state)`).run();
  try {
    // why the claim may be released: plan (subscription on the publish date), track (the
    // customer bought this track), manual / custom (the owner's decision), none
    await db.prepare(`ALTER TABLE wl_matches ADD COLUMN license TEXT`).run();
  } catch {
    /* already there */
  }
  try {
    // 0 = the track is only in the owner's "unreleased" folder (not on the site yet)
    await db.prepare(`ALTER TABLE wl_matches ADD COLUMN on_site INTEGER NOT NULL DEFAULT 1`).run();
  } catch {
    // column exists
  }
  try {
    // where the scanner's base knows the track: 'site' | 'local' | 'both' (the scanner tells us)
    await db.prepare(`ALTER TABLE wl_matches ADD COLUMN in_base TEXT`).run();
  } catch {
    // column exists
  }
  ready = true;
};

/** YYYY-MM-DD minus n days. */
const minusDays = (iso: string, n: number) => {
  const d = new Date(iso.replace(" ", "T") + (iso.length <= 19 ? "Z" : ""));
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Admins have full access without a subscription: for whitelisting they
 *  count as Max (10 channels, claims always released). */
const isAdminUser = async (db: D1Database, userId: string) => {
  try {
    const u = await db.prepare(`SELECT role FROM users WHERE id = ?1`).bind(userId).first<{ role: string | null }>();
    return u?.role === "admin";
  } catch {
    return false;
  }
};

/** Current plan (only an active, non-free subscription counts; admins = max). */
export const currentPlan = async (db: D1Database, userId: string): Promise<string> => {
  if (await isAdminUser(db, userId)) return "max";
  const sub = await db
    .prepare(`SELECT plan, status FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`)
    .bind(userId)
    .first<{ plan: string; status: string | null }>();
  if (!sub) return "free";
  return sub.status && sub.status !== "active" ? "free" : sub.plan || "free";
};

/** Did the user have a PAID plan on this date? Uses the billing periods
 *  (subscription_licenses); falls back to the current plan when none exist. */
export const paidOn = async (db: D1Database, userId: string, isoDate: string): Promise<boolean> => {
  if (await isAdminUser(db, userId)) return true;
  const day = (isoDate || "").slice(0, 10);
  try {
    const any = await db
      .prepare(`SELECT 1 AS x FROM subscription_licenses WHERE user_id = ?1 LIMIT 1`)
      .bind(userId)
      .first<{ x: number }>();
    if (any) {
      const hit = await db
        .prepare(
          `SELECT 1 AS x FROM subscription_licenses
            WHERE user_id = ?1 AND plan != 'free'
              AND substr(period_start, 1, 10) <= ?2
              AND (period_end IS NULL OR substr(period_end, 1, 10) >= ?2)
            LIMIT 1`,
        )
        .bind(userId, day)
        .first<{ x: number }>();
      return !!hit;
    }
  } catch {
    // table missing - fall through
  }
  return (await currentPlan(db, userId)) !== "free";
};

/** Did the user buy a single-track license for this track (an unrefunded order)? */
export const boughtTrack = async (db: D1Database, userId: string, trackId: string): Promise<boolean> => {
  try {
    const r = await db
      .prepare(
        `SELECT 1 AS x FROM sync_orders
          WHERE user_id = ?1 AND track_id = ?2 AND COALESCE(status, 'active') != 'refunded' LIMIT 1`,
      )
      .bind(userId, trackId)
      .first<{ x: number }>();
    return !!r;
  } catch {
    return false;
  }
};

/** Matches found without a license: the customer may have bought the track or a plan
 *  since the scan. Re-checks every one of them and frees those that are covered now.
 *  Returns how many became eligible. */
export const recheckLicenses = async (db: D1Database): Promise<number> => {
  const rows = await db
    .prepare(
      `SELECT m.id, m.user_id, m.track_id, v.published_at
         FROM wl_matches m LEFT JOIN wl_videos v ON v.video_id = m.video_id
        WHERE m.state = 'not_eligible'`,
    )
    .all<{ id: number; user_id: string; track_id: string | null; published_at: string | null }>();
  let freed = 0;
  for (const r of rows.results) {
    const license = (await paidOn(db, r.user_id, r.published_at || "")) ? "plan"
      : r.track_id && (await boughtTrack(db, r.user_id, r.track_id)) ? "track" : "";
    if (!license) continue;
    await db
      .prepare(`UPDATE wl_matches SET eligible = 1, state = 'new', license = ?2 WHERE id = ?1`)
      .bind(r.id, license)
      .run();
    freed++;
  }
  return freed;
};

/** The owner releases a claim although no license covers it (his decision). */
export const forceMatch = async (db: D1Database, matchId: number): Promise<void> => {
  await db
    .prepare(`UPDATE wl_matches SET eligible = 1, state = 'new', license = 'manual' WHERE id = ?1 AND state = 'not_eligible'`)
    .bind(matchId)
    .run();
};

export interface ChannelRow {
  id: string;
  user_id: string;
  channel_url: string;
  added_at: string;
  check_from: string | null;
  yt_title: string | null;
  yt_uploads: string | null;
  last_refresh: string | null;
  user_created: string | null;
  email: string | null;
  custom_group: string | null;
}

export const allChannels = async (db: D1Database): Promise<ChannelRow[]> => {
  const r = await db
    .prepare(
      `SELECT w.id, w.user_id, w.channel_url, w.added_at, w.check_from, w.yt_title, w.yt_uploads,
              w.last_refresh, w.custom_group, u.created_at AS user_created, u.email AS email
         FROM wl_channels w LEFT JOIN users u ON u.id = w.user_id
        ORDER BY w.user_id, w.added_at`,
    )
    .all<ChannelRow>();
  return r.results;
};

/** check_from: admin override, else registration date minus 2 days. */
export const checkFromOf = (c: ChannelRow) =>
  c.check_from || minusDays(c.user_created || c.added_at, CHECK_FROM_MARGIN_DAYS);

/** Channel state by the owner's CURRENT plan: active / paused (over the plan's
 *  channel limit, newest channels first to pause) / noplan. */
export const channelStates = async (db: D1Database, channels: ChannelRow[]) => {
  const out = new Map<string, { state: "active" | "paused" | "noplan"; plan: string }>();
  const byUser = new Map<string, ChannelRow[]>();
  for (const c of channels) {
    if (c.custom_group) {
      out.set(c.id, { plan: "custom", state: "active" }); // owner's own list: always on
      continue;
    }
    byUser.set(c.user_id, [...(byUser.get(c.user_id) ?? []), c]);
  }
  for (const [uid, list] of byUser) {
    const plan = await currentPlan(db, uid);
    const limit = PLAN_LIMITS[plan] ?? 0;
    let i = 0;
    for (const c of list) {
      if (isSolo(c)) {
        out.set(c.id, { plan, state: limit === 0 ? "noplan" : "active" }); // solo videos: no channel limit
        continue;
      }
      out.set(c.id, { plan, state: limit === 0 ? "noplan" : i < limit ? "active" : "paused" });
      i++;
    }
  }
  return out;
};

/** All uploads of a channel published on/after `since` (pages through the
 *  uploads playlist, newest first, stops at the first older video). */
const uploadsSince = async (key: string, playlist: string, since: string, db: D1Database) => {
  const out: { videoId: string; title: string; publishedAt: string }[] = [];
  let page = "";
  for (let i = 0; i < 10; i++) {
    void bumpUsage(db, "youtube", 1);
    const res = await fetch(
      `${YT}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlist)}` +
        (page ? `&pageToken=${page}` : "") +
        `&key=${key}`,
    );
    if (!res.ok) break;
    const data = (await res.json()) as {
      nextPageToken?: string;
      items?: {
        snippet?: { title?: string; resourceId?: { videoId?: string } };
        contentDetails?: { videoPublishedAt?: string };
      }[];
    };
    let older = false;
    for (const it of data.items ?? []) {
      const id = it.snippet?.resourceId?.videoId;
      const pub = it.contentDetails?.videoPublishedAt ?? "";
      if (!id || !pub) continue; // private / not yet published
      if (pub.slice(0, 10) < since) {
        older = true;
        continue;
      }
      out.push({ videoId: id, title: it.snippet?.title ?? "", publishedAt: pub });
    }
    if (older || !data.nextPageToken) break;
    page = data.nextPageToken;
  }
  return out;
};

/** Queue new videos of every active / noplan channel (paused ones are skipped).
 *  Each channel is asked at most every 30 min unless `force`. */
export const refreshChannels = async (env: Env, force = false, onlyId?: string) => {
  const db = env.DB;
  await ensureWlScan(db);
  if (!env.YOUTUBE_API_KEY) return { error: "YOUTUBE_API_KEY is not set", queued: 0, channels: 0 };
  const channels = await allChannels(db);
  const states = await channelStates(db, channels);
  const now = new Date();
  let queued = 0;
  let asked = 0;
  for (const c of channels) {
    if (isSolo(c)) continue;
    if (onlyId && c.id !== onlyId) continue;
    if (states.get(c.id)?.state === "paused") continue;
    if (!force && c.last_refresh) {
      const age = (now.getTime() - new Date(c.last_refresh + "Z").getTime()) / 60000;
      if (age < REFRESH_EVERY_MIN) continue;
    }
    let uploads = c.yt_uploads;
    if (!uploads) {
      void bumpUsage(db, "youtube", 1);
      const ch = await ytChannel(env.YOUTUBE_API_KEY, c.channel_url);
      if (!ch) continue;
      uploads = ch.uploads;
      await db
        .prepare(`UPDATE wl_channels SET yt_uploads = ?2, yt_title = ?3 WHERE id = ?1`)
        .bind(c.id, ch.uploads, ch.title)
        .run();
    }
    asked++;
    const vids = await uploadsSince(env.YOUTUBE_API_KEY, uploads, checkFromOf(c), db);
    for (const v of vids) {
      const r = await db
        .prepare(
          `INSERT OR IGNORE INTO wl_videos (video_id, channel_id, user_id, title, published_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(v.videoId, c.id, c.user_id, v.title, v.publishedAt)
        .run();
      if ((r as { meta?: { changes?: number } }).meta?.changes) queued++;
    }
    await db
      .prepare(`UPDATE wl_channels SET last_refresh = datetime('now') WHERE id = ?1`)
      .bind(c.id)
      .run();
  }
  return { queued, channels: asked };
};

/** Hand the scanner up to `limit` queued videos (leased for an hour). */
export const takeQueue = async (db: D1Database, limit: number) => {
  await ensureWlScan(db);
  await db
    .prepare(
      `UPDATE wl_videos SET status = 'queued', leased_at = NULL
        WHERE status = 'scanning' AND leased_at < datetime('now', ?1)`,
    )
    .bind(`-${LEASE_MIN} minutes`)
    .run();
  // Videos of a channel that was removed (by the customer, with the account,
  // or a Custom list) must not be scanned: drop the leftovers first.
  await db
    .prepare(
      `DELETE FROM wl_videos WHERE status IN ('queued','scanning')
         AND channel_id NOT IN (SELECT id FROM wl_channels)`,
    )
    .run();
  const rows = await db
    .prepare(
      `SELECT v.video_id, v.title, v.published_at, w.yt_title AS channel_title
         FROM wl_videos v JOIN wl_channels w ON w.id = v.channel_id
        WHERE v.status = 'queued' ORDER BY v.published_at DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<{ video_id: string; title: string; published_at: string; channel_title: string | null }>();
  for (const r of rows.results) {
    await db
      .prepare(`UPDATE wl_videos SET status = 'scanning', leased_at = datetime('now') WHERE video_id = ?1`)
      .bind(r.video_id)
      .run();
  }
  const left = await db
    .prepare(`SELECT COUNT(*) AS n FROM wl_videos WHERE status = 'queued'`)
    .first<{ n: number }>();
  return {
    videos: rows.results.map((r) => ({
      videoId: r.video_id,
      url: `https://www.youtube.com/watch?v=${r.video_id}`,
      title: r.title,
      publishedAt: r.published_at,
      channelTitle: r.channel_title ?? "",
    })),
    queueLeft: left?.n ?? 0,
  };
};

export interface ScanMatch {
  trackId?: string;
  track: string;
  regions: [number, number][];
  total: number;
  score: number;
  composer?: string;
  onSite?: boolean;
  /** scanner base: 'site' | 'local' | 'both' */
  inBase?: string;
}

/** Store the scanner's answer for one video. */
export const saveResult = async (
  db: D1Database,
  videoId: string,
  matches: ScanMatch[],
  error?: string,
  opts: { append?: boolean } = {},
) => {
  await ensureWlScan(db);
  const v = await db
    .prepare(
      `SELECT v.video_id, v.channel_id, v.user_id, v.published_at, v.note, w.custom_group
         FROM wl_videos v LEFT JOIN wl_channels w ON w.id = v.channel_id WHERE v.video_id = ?1`,
    )
    .bind(videoId)
    .first<{
      video_id: string;
      channel_id: string;
      user_id: string;
      published_at: string;
      note: string | null;
      custom_group: string | null;
    }>();
  if (!v) return { ok: false, error: "unknown video" };
  if (error) {
    await db
      .prepare(`UPDATE wl_videos SET status = 'error', note = ?2, scanned_at = datetime('now') WHERE video_id = ?1`)
      .bind(videoId, error.slice(0, 300))
      .run();
    return { ok: true };
  }
  // A video the owner added by hand (an old video of a customer he brought in)
  // is released whatever the date: that was his decision.
  // Channels of the owner's Custom lists are always released.
  const videoLicense = v.custom_group ? "custom" : v.note === "manual" ? "manual"
    : (await paidOn(db, v.user_id, v.published_at)) ? "plan" : "";
  for (const m of matches) {
    const local = !m.trackId || m.trackId.startsWith("local:");
    const t = !local
      ? await db
          .prepare(`SELECT id, title, composer_id FROM tracks WHERE id = ?1`)
          .bind(m.trackId)
          .first<{ id: string; title: string; composer_id: string | null }>()
      : await db
          .prepare(`SELECT id, title, composer_id FROM tracks WHERE lower(title) = lower(?1) LIMIT 1`)
          .bind(m.track)
          .first<{ id: string; title: string; composer_id: string | null }>();
    // A track from the owner's unreleased folder: its composer comes by name.
    let composerId = t?.composer_id ?? null;
    if (!composerId && m.composer) {
      const c = await db
        .prepare(`SELECT id FROM composers WHERE lower(display_name) = lower(?1) LIMIT 1`)
        .bind(m.composer)
        .first<{ id: string }>();
      composerId = c?.id ?? null;
    }
    const onSite = m.onSite === false ? 0 : t ? 1 : 0;
    // no subscription: a bought single-track license still covers this track
    const license = videoLicense || (t && (await boughtTrack(db, v.user_id, t.id)) ? "track" : "none");
    const eligible = license === "none" ? 0 : 1;
    await db
      .prepare(
        `INSERT INTO wl_matches (video_id, channel_id, user_id, track_id, track_title, composer_id,
                                 regions, total_s, score, eligible, state, on_site, in_base, license)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(video_id, track_title) DO UPDATE SET
           regions = excluded.regions, total_s = excluded.total_s, score = excluded.score,
           on_site = excluded.on_site, in_base = excluded.in_base,
           license = CASE WHEN wl_matches.state = 'not_eligible' THEN excluded.license ELSE wl_matches.license END,
           eligible = CASE WHEN wl_matches.state = 'not_eligible' THEN excluded.eligible ELSE wl_matches.eligible END,
           state = CASE WHEN wl_matches.state = 'not_eligible' THEN excluded.state ELSE wl_matches.state END`,
      )
      .bind(
        videoId,
        v.channel_id,
        v.user_id,
        t?.id ?? (local ? null : m.trackId) ?? null,
        t?.title ?? m.track,
        composerId,
        JSON.stringify(m.regions.slice(0, 20)),
        Math.round(m.total),
        Math.round(m.score),
        eligible,
        eligible ? "new" : "not_eligible",
        onSite,
        ["site", "local", "both"].includes(String(m.inBase)) ? String(m.inBase) : null,
        license,
      )
      .run();
  }
  await db
    .prepare(
      `UPDATE wl_videos SET status = 'done', scanned_at = datetime('now'), leased_at = NULL,
              found = CASE WHEN ?3 = 1 THEN found + ?2 ELSE ?2 END
        WHERE video_id = ?1`,
    )
    .bind(videoId, matches.length, opts.append ? 1 : 0)
    .run();
  return { ok: true, eligible: !!eligible };
};

/** Published tracks with their full-version preview, for the scanner's base. */
export const scanCatalog = async (db: D1Database) => {
  const rows = await db
    .prepare(
      `SELECT t.id, t.slug, t.title, t.created_at, c.display_name AS composer,
              (SELECT v.preview_src FROM track_versions v WHERE v.track_id = t.id ORDER BY v.sort ASC LIMIT 1) AS src
         FROM tracks t LEFT JOIN composers c ON c.id = t.composer_id
        WHERE t.status IN ('published', 'unlisted')`,
    )
    .all<{
      id: string;
      slug: string | null;
      title: string;
      created_at: string | null;
      composer: string | null;
      src: string | null;
    }>();
  return rows.results.filter((r) => r.src).map((r) => ({
    id: r.id,
    slug: r.slug ?? "",
    title: r.title,
    addedAt: (r.created_at ?? "").slice(0, 10),
    composer: r.composer ?? "TV Music Store",
    src: r.src as string,
  }));
};

/** Owner adds one video by hand (scanner "Check a video" -> Send to site).
 *  The video's channel must be one of the customers' whitelisted channels. */
export const addManualVideo = async (env: Env, videoId: string) => {
  const db = env.DB;
  await ensureWlScan(db);
  if (!env.YOUTUBE_API_KEY) return { error: "YOUTUBE_API_KEY is not set" };
  void bumpUsage(db, "youtube", 1);
  const res = await fetch(`${YT}/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${env.YOUTUBE_API_KEY}`);
  const data = (await res.json().catch(() => ({}))) as {
    items?: { snippet?: { channelId?: string; title?: string; publishedAt?: string; channelTitle?: string } }[];
  };
  const sn = data.items?.[0]?.snippet;
  if (!sn?.channelId) return { error: "YouTube does not show this video (private or wrong link)." };
  const uploads = "UU" + sn.channelId.slice(2);
  let ch = await db
    .prepare(`SELECT id, user_id FROM wl_channels WHERE yt_uploads = ?1 ORDER BY added_at LIMIT 1`)
    .bind(uploads)
    .first<{ id: string; user_id: string }>();
  if (!ch) {
    // channels not resolved yet: resolve them now and try again
    for (const c of await allChannels(db)) {
      if (c.yt_uploads || isSolo(c)) continue;
      const r = await ytChannel(env.YOUTUBE_API_KEY, c.channel_url);
      if (r) {
        await db
          .prepare(`UPDATE wl_channels SET yt_uploads = ?2, yt_title = ?3 WHERE id = ?1`)
          .bind(c.id, r.uploads, r.title)
          .run();
      }
    }
    ch = await db
      .prepare(`SELECT id, user_id FROM wl_channels WHERE yt_uploads = ?1 ORDER BY added_at LIMIT 1`)
      .bind(uploads)
      .first<{ id: string; user_id: string }>();
  }
  if (!ch) {
    return {
      error: `"${sn.channelTitle ?? "This channel"}" is not on any customer's whitelist or Custom list.`,
    };
  }
  await db
    .prepare(
      `INSERT INTO wl_videos (video_id, channel_id, user_id, title, published_at, status, note)
       VALUES (?1, ?2, ?3, ?4, ?5, 'scanning', 'manual')
       ON CONFLICT(video_id) DO UPDATE SET note = 'manual', status = 'scanning'`,
    )
    .bind(videoId, ch.id, ch.user_id, sn.title ?? "", sn.publishedAt ?? "")
    .run();
  // earlier not-eligible matches of this video become releasable too
  await db
    .prepare(`UPDATE wl_matches SET eligible = 1, state = 'new' WHERE video_id = ?1 AND state = 'not_eligible'`)
    .bind(videoId)
    .run();
  return { ok: true, channelTitle: sn.channelTitle ?? "" };
};

/** Owner adds a channel to one of his Custom lists (e.g. "Pixabay"). */
export const addCustomChannel = async (env: Env, group: string, url: string) => {
  const db = env.DB;
  await ensureWlScan(db);
  const name = group.trim().slice(0, 60);
  const link = url.trim();
  if (!name) return { error: "Enter a list name (for example Pixabay)." };
  if (!/^(https?:\/\/)?(www\.|m\.)?youtube\.com\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)/i.test(link)) {
    return { error: "Paste a YouTube channel link (youtube.com/@name or youtube.com/channel/...)." };
  }
  const full = link.startsWith("http") ? link : `https://${link}`;
  let title = "";
  let uploads: string | null = null;
  if (env.YOUTUBE_API_KEY) {
    void bumpUsage(db, "youtube", 1);
    const ch = await ytChannel(env.YOUTUBE_API_KEY, full);
    if (!ch) return { error: "YouTube does not know this channel. Check the link." };
    title = ch.title;
    uploads = ch.uploads;
  }
  if (uploads) {
    const dup = await db
      .prepare(`SELECT custom_group, user_id FROM wl_channels WHERE yt_uploads = ?1 LIMIT 1`)
      .bind(uploads)
      .first<{ custom_group: string | null; user_id: string }>();
    if (dup) {
      return {
        error: dup.custom_group
          ? `This channel is already in the "${dup.custom_group}" list.`
          : "This channel is already on a customer's whitelist.",
      };
    }
  }
  const id = newId("wch");
  await db.prepare(`INSERT OR IGNORE INTO wl_custom_lists (name) VALUES (?1)`).bind(name).run();
  await db
    .prepare(
      `INSERT INTO wl_channels (id, user_id, channel_url, channel_ref, yt_title, yt_uploads, custom_group)
       VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6)`,
    )
    .bind(id, CUSTOM_USER, full, title || null, uploads, name)
    .run();
  return { ok: true, id, title };
};

/** Custom lists live on their own, so an empty list can exist. */
export const customLists = async (db: D1Database): Promise<string[]> => {
  await ensureWlScan(db);
  const a = await db.prepare(`SELECT name FROM wl_custom_lists ORDER BY name`).all<{ name: string }>();
  const b = await db
    .prepare(`SELECT DISTINCT custom_group AS name FROM wl_channels WHERE custom_group IS NOT NULL`)
    .all<{ name: string }>();
  const names = new Set<string>([...a.results.map((r) => r.name), ...b.results.map((r) => r.name)]);
  return [...names].sort((x, y) => x.localeCompare(y));
};

export const createCustomList = async (db: D1Database, name: string) => {
  await ensureWlScan(db);
  const n = name.trim().slice(0, 60);
  if (!n) return { error: "Enter a list name." };
  await db.prepare(`INSERT OR IGNORE INTO wl_custom_lists (name) VALUES (?1)`).bind(n).run();
  return { ok: true, name: n };
};

/** Remove a whole list: its channels, their queued videos; found matches stay as history. */
export const removeCustomList = async (db: D1Database, name: string) => {
  await ensureWlScan(db);
  const chans = await db.prepare(`SELECT id FROM wl_channels WHERE custom_group = ?1`).bind(name).all<{ id: string }>();
  for (const c of chans.results) await removeCustomChannel(db, c.id);
  await db.prepare(`DELETE FROM wl_custom_lists WHERE name = ?1`).bind(name).run();
  return { ok: true, removed: chans.results.length };
};

/** The pseudo channel that holds a list's single videos (like a customer's Solo videos). */
export const ensureCustomSoloChannel = async (db: D1Database, group: string) => {
  const id = "wch_csolo_" + group.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
  await db
    .prepare(
      `INSERT OR IGNORE INTO wl_channels (id, user_id, channel_url, channel_ref, yt_title, yt_uploads, custom_group)
       VALUES (?1, ?2, ?3, NULL, 'Videos', NULL, ?4)`,
    )
    .bind(id, CUSTOM_USER, SOLO_URL, group)
    .run();
  return id;
};

/** One link into a list: a channel link adds a channel, a video link adds a single video. */
export const addToCustomList = async (env: Env, group: string, link: string) => {
  const db = env.DB;
  await ensureWlScan(db);
  const name = group.trim().slice(0, 60);
  if (!name) return { error: "Pick a list first." };
  const vid = /(?:v=|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(link.trim());
  if (!vid) return addCustomChannel(env, name, link);
  if (!env.YOUTUBE_API_KEY) return { error: "YOUTUBE_API_KEY is not set" };
  await createCustomList(db, name);
  void bumpUsage(db, "youtube", 1);
  const res = await fetch(`${YT}/videos?part=snippet&id=${encodeURIComponent(vid[1])}&key=${env.YOUTUBE_API_KEY}`);
  const data = (await res.json().catch(() => ({}))) as {
    items?: { snippet?: { title?: string; publishedAt?: string; channelTitle?: string } }[];
  };
  const sn = data.items?.[0]?.snippet;
  if (!sn) return { error: "YouTube does not show this video (private or wrong link)." };
  const chId = await ensureCustomSoloChannel(db, name);
  await db
    .prepare(
      `INSERT INTO wl_videos (video_id, channel_id, user_id, title, published_at, status, note)
       VALUES (?1, ?2, ?3, ?4, ?5, 'queued', 'solo')
       ON CONFLICT(video_id) DO UPDATE SET channel_id = ?2, user_id = ?3, note = 'solo', status = 'queued'`,
    )
    .bind(vid[1], chId, CUSTOM_USER, sn.title ?? "", sn.publishedAt ?? "")
    .run();
  return { ok: true, video: true, title: sn.title ?? "", channelTitle: sn.channelTitle ?? "" };
};

/** Remove a Custom channel. Its found matches stay (history); videos not
 *  checked yet leave the queue. */
export const removeCustomChannel = async (db: D1Database, id: string) => {
  await ensureWlScan(db);
  await db
    .prepare(`DELETE FROM wl_videos WHERE channel_id = ?1 AND status IN ('queued','scanning')`)
    .bind(id)
    .run();
  const r = await db
    .prepare(`DELETE FROM wl_channels WHERE id = ?1 AND custom_group IS NOT NULL`)
    .bind(id)
    .run();
  return { ok: !!(r as { meta?: { changes?: number } }).meta?.changes };
};
