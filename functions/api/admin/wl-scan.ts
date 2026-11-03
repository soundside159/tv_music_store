import { cachedValue } from "../_cache";
import { adminTokenOk, getSessionUser, json, OWNER_EMAIL, readJson, type Ctx, type Env } from "../_utils";
import {
  addManualVideo,
  allChannels,
  channelStates,
  checkFromOf,
  ensureWlScan,
  refreshChannels,
  saveResult,
  scanCatalog,
  takeQueue,
  type ScanMatch,
} from "./_wlscan";
import { emailComposers, getSheetsConfig, setSheetsConfig, sheetUrl, syncSheets, updateSheets } from "./_wlsheets";

// /api/admin/wl-scan - whitelist auto-scanning (see _wlscan.ts for the chain).
// Used by the admin page (session) and the desktop scanner (x-admin-token).
//
// GET  ?action=overview          -> everything the admin Whitelisting page shows
// GET  ?action=queue&limit=3     -> scanner: videos to check (refreshes channels first)
// GET  ?action=catalog           -> scanner: published tracks + full-version preview
// POST {action:"refresh", force} -> look for new videos now
// POST {action:"result", videoId, matches:[...], error?}
// POST {action:"check_from", channelId, date|null}
// POST {action:"requeue", videoId}
// POST {action:"manual", videoId}      -> owner adds an old video by hand (released whatever the date)
// POST {action:"sheets_update"}  -> new matches into composer sheets
// POST {action:"sheets_sync"}    -> read "Released" back from the sheets
// POST {action:"email_composers"}
// POST {action:"sheets_config", scriptUrl, token, sheets:{composerId: sheetIdOrUrl}}

const SEEN_KEY = "wl_scanner_seen";

const auth = async (ctx: Ctx) => {
  if (adminTokenOk(ctx)) return { scanner: true };
  const u = await getSessionUser(ctx);
  if (!u) return { error: json({ error: "Not signed in" }, 401) };
  if (u.role !== "admin" && u.email !== OWNER_EMAIL) return { error: json({ error: "Admin only" }, 403) };
  return { scanner: false };
};

const markSeen = async (ctx: Ctx, info: string) => {
  try {
    await ctx.env.DB.prepare(
      `INSERT INTO site_config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
      .bind(SEEN_KEY, JSON.stringify({ at: new Date().toISOString(), info }))
      .run();
  } catch {
    // site_config missing - not important
  }
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const a = await auth(ctx);
  if (a.error) return a.error;
  const db = ctx.env.DB;
  await ensureWlScan(db);
  const url = new URL(ctx.request.url);
  const action = url.searchParams.get("action") ?? "overview";

  if (action === "queue") {
    const host = (url.searchParams.get("host") ?? "scanner").slice(0, 40);
    const refreshed = await refreshChannels(ctx.env as Env);
    const q = await takeQueue(db, Math.max(1, Math.min(10, Number(url.searchParams.get("limit") ?? 3) || 3)));
    await markSeen(ctx, host);
    return json({ ...q, refreshed });
  }
  if (action === "catalog") {
    // Edge-cached per catalogue version: a few thousand rows per build.
    return json({ tracks: await cachedValue(ctx, "wl-catalog", () => scanCatalog(db), 6 * 3600) });
  }

  // ---- overview for the admin page ----
  const channels = await allChannels(db);
  const states = await channelStates(db, channels);
  const counts = await db
    .prepare(
      `SELECT channel_id,
              SUM(CASE WHEN state IN ('new','in_sheet') THEN 1 ELSE 0 END) AS waiting,
              SUM(CASE WHEN state = 'released' THEN 1 ELSE 0 END) AS released,
              SUM(CASE WHEN state = 'not_eligible' THEN 1 ELSE 0 END) AS lead
         FROM wl_matches GROUP BY channel_id`,
    )
    .all<{ channel_id: string; waiting: number; released: number; lead: number }>();
  const cnt = new Map(counts.results.map((r) => [r.channel_id, r]));
  const checked = await db
    .prepare(`SELECT channel_id, COUNT(*) AS n FROM wl_videos WHERE status = 'done' GROUP BY channel_id`)
    .all<{ channel_id: string; n: number }>();
  const chk = new Map(checked.results.map((r) => [r.channel_id, r.n]));

  const matches = await db
    .prepare(
      `SELECT m.id, m.video_id, m.track_title, m.composer_id, m.regions, m.total_s, m.score,
              m.eligible, m.state, m.sheet_date, m.released_at, m.created_at,
              v.title AS video_title, v.published_at, w.yt_title AS channel_title, w.id AS channel_id,
              u.email AS email, c.display_name AS composer
         FROM wl_matches m
         LEFT JOIN wl_videos v ON v.video_id = m.video_id
         LEFT JOIN wl_channels w ON w.id = m.channel_id
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN composers c ON c.id = m.composer_id
        ORDER BY m.created_at DESC LIMIT 2000`,
    )
    .all<Record<string, unknown>>();

  const q = await db
    .prepare(
      `SELECT SUM(CASE WHEN status = 'queued' OR status = 'scanning' THEN 1 ELSE 0 END) AS queue,
              SUM(CASE WHEN status = 'done' AND scanned_at > datetime('now','-7 days') THEN 1 ELSE 0 END) AS week,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
         FROM wl_videos`,
    )
    .first<{ queue: number; week: number; errors: number }>();
  let seen: { at: string; info: string } | null = null;
  try {
    const r = await db.prepare(`SELECT value FROM site_config WHERE key = ?1`).bind(SEEN_KEY).first<{ value: string }>();
    if (r) seen = JSON.parse(r.value);
  } catch {
    // none yet
  }

  const sheetsCfg = await getSheetsConfig(db);
  const composers = await db
    .prepare(
      `SELECT c.id, c.display_name AS name, u.email AS email FROM composers c
         LEFT JOIN users u ON u.id = c.user_id
        WHERE c.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM tracks t WHERE t.composer_id = c.id)
        ORDER BY c.display_name`,
    )
    .all<{ id: string; name: string; email: string | null }>();

  return json({
    composers: composers.results.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? "",
      sheetId: sheetsCfg.sheets[c.id] ?? "",
      sheetUrl: sheetsCfg.sheets[c.id] ? sheetUrl(sheetsCfg.sheets[c.id]) : "",
    })),
    sheetsConnected: !!(sheetsCfg.scriptUrl && sheetsCfg.token),
    scriptUrl: sheetsCfg.scriptUrl,
    scanner: { lastSeen: seen?.at ?? null, host: seen?.info ?? null, queue: q?.queue ?? 0, week: q?.week ?? 0, errors: q?.errors ?? 0 },
    channels: channels.map((c) => ({
      id: c.id,
      userId: c.user_id,
      email: c.email ?? "",
      url: c.channel_url,
      title: c.yt_title ?? "",
      addedAt: c.added_at,
      checkFrom: checkFromOf(c),
      checkFromCustom: !!c.check_from,
      state: states.get(c.id)?.state ?? "noplan",
      plan: states.get(c.id)?.plan ?? "free",
      checked: chk.get(c.id) ?? 0,
      waiting: cnt.get(c.id)?.waiting ?? 0,
      released: cnt.get(c.id)?.released ?? 0,
      lead: cnt.get(c.id)?.lead ?? 0,
    })),
    matches: matches.results.map((m) => ({
      id: m.id,
      videoId: m.video_id,
      videoTitle: m.video_title ?? "",
      publishedAt: m.published_at ?? "",
      channelId: m.channel_id,
      channelTitle: m.channel_title ?? "",
      email: m.email ?? "",
      track: m.track_title,
      composerId: m.composer_id ?? "",
      composer: m.composer ?? "TV Music Store",
      regions: (() => {
        try {
          return JSON.parse(String(m.regions ?? "[]"));
        } catch {
          return [];
        }
      })(),
      total: m.total_s,
      score: m.score,
      eligible: !!m.eligible,
      state: m.state,
      sheetDate: m.sheet_date,
      releasedAt: m.released_at,
      createdAt: m.created_at,
    })),
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const a = await auth(ctx);
  if (a.error) return a.error;
  const db = ctx.env.DB;
  await ensureWlScan(db);
  const body = (await readJson<Record<string, unknown>>(ctx.request)) ?? {};

  switch (body.action) {
    case "refresh":
      return json(await refreshChannels(ctx.env as Env, !!body.force));
    case "result": {
      const videoId = String(body.videoId ?? "");
      const raw = Array.isArray(body.matches) ? (body.matches as ScanMatch[]) : [];
      const matches = raw
        .filter((m) => m && typeof m.track === "string")
        .slice(0, 30)
        .map((m) => ({
          trackId: typeof m.trackId === "string" ? m.trackId : undefined,
          track: m.track.slice(0, 200),
          regions: Array.isArray(m.regions) ? m.regions.filter((r) => Array.isArray(r) && r.length === 2) : [],
          total: Number(m.total) || 0,
          score: Number(m.score) || 0,
        }));
      return json(
        await saveResult(db, videoId, matches, typeof body.error === "string" ? body.error : undefined, {
          append: !!body.append,
        }),
      );
    }
    case "manual": {
      const vid = String(body.videoId ?? "");
      if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) return json({ error: "Bad video id" }, 400);
      const r = await addManualVideo(ctx.env as Env, vid);
      return json(r, "error" in r ? 400 : 200);
    }
    case "check_from": {
      const id = String(body.channelId ?? "");
      const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
      await db
        .prepare(`UPDATE wl_channels SET check_from = ?2, last_refresh = NULL WHERE id = ?1`)
        .bind(id, date)
        .run();
      return json({ ok: true });
    }
    case "sheets_update":
    case "sheets_sync":
    case "email_composers": {
      try {
        if (body.action === "sheets_update") return json({ ok: true, ...(await updateSheets(db)) });
        if (body.action === "sheets_sync") return json({ ok: true, ...(await syncSheets(db)) });
        return json({ ok: true, ...(await emailComposers(ctx.env as Env)) });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }
    case "sheets_config": {
      const cur = await getSheetsConfig(db);
      const sheets: Record<string, string> = { ...cur.sheets };
      if (body.sheets && typeof body.sheets === "object") {
        for (const [k, v] of Object.entries(body.sheets as Record<string, unknown>)) {
          const raw = String(v ?? "").trim();
          const id = /\/d\/([A-Za-z0-9_-]+)/.exec(raw)?.[1] ?? raw;
          if (id) sheets[k] = id;
          else delete sheets[k];
        }
      }
      await setSheetsConfig(db, {
        scriptUrl: typeof body.scriptUrl === "string" ? body.scriptUrl.trim() : cur.scriptUrl,
        token: typeof body.token === "string" && body.token ? body.token.trim() : cur.token,
        sheets,
      });
      return json({ ok: true });
    }
    case "requeue": {
      await db
        .prepare(`UPDATE wl_videos SET status = 'queued', leased_at = NULL WHERE video_id = ?1`)
        .bind(String(body.videoId ?? ""))
        .run();
      return json({ ok: true });
    }
  }
  return json({ error: "Unknown action" }, 400);
};
