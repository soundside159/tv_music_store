import { cachedValue } from "../_cache";
import { adminTokenOk, getSessionUser, json, OWNER_EMAIL, readJson, sendEmail, type Ctx, type Env } from "../_utils";
import {
  addCustomChannel,
  addManualVideo,
  addToCustomList,
  createCustomList,
  customLists,
  removeCustomList,
  addSoloVideo,
  removeSoloVideo,
  allChannels,
  channelStates,
  checkFromOf,
  ensureWlScan,
  forceMatch,
  recheckLicenses,
  refreshChannels,
  removeCustomChannel,
  saveResult,
  scanCatalog,
  takeQueue,
  type ScanMatch,
} from "./_wlscan";
import { emailComposers, getSheetsConfig, removeMatch, sendAgain, setSheetsConfig, sheetUrl, syncSheets, updateSheets } from "./_wlsheets";

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
// POST {action:"custom_add", group, url}   -> owner's Custom list channel
// POST {action:"custom_remove", channelId}

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

  const lists = await customLists(db);
  const sheetsCfg = await getSheetsConfig(db);
  // Admin page only (not the scanner): read "Released" back from the composer
  // sheets, at most once in 5 minutes, so the page shows the real state.
  let syncedAt: string | null = null;
  if (!a.scanner && sheetsCfg.scriptUrl && sheetsCfg.token && url.searchParams.get("nosync") !== "1") {
    const SYNC_KEY = "wl_sheets_synced";
    try {
      const r = await db.prepare(`SELECT value FROM site_config WHERE key = ?1`).bind(SYNC_KEY).first<{ value: string }>();
      syncedAt = r?.value ?? null;
    } catch {
      // none yet
    }
    const age = syncedAt ? Date.now() - new Date(syncedAt).getTime() : Infinity;
    if (age > 5 * 60 * 1000) {
      try {
        await recheckLicenses(db); // a customer may have bought the track / a plan since the scan
        await syncSheets(db);
        syncedAt = new Date().toISOString();
        await db
          .prepare(`INSERT INTO site_config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
          .bind(SYNC_KEY, syncedAt)
          .run();
      } catch {
        // the sheets did not answer: show what we have
      }
    }
  }
  const matches = await db
    .prepare(
      `SELECT m.id, m.video_id, m.track_title, m.composer_id, m.regions, m.total_s, m.score,
              m.eligible, m.state, m.sheet_date, m.released_at, m.created_at, m.on_site, m.license, m.user_id,
              t.slug AS track_slug, v.title AS video_title, v.published_at, w.yt_title AS channel_title, w.id AS channel_id,
              u.email AS email, c.display_name AS composer
         FROM wl_matches m
         LEFT JOIN wl_videos v ON v.video_id = m.video_id
         LEFT JOIN wl_channels w ON w.id = m.channel_id
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN tracks t ON t.id = m.track_id
         LEFT JOIN composers c ON c.id = m.composer_id
        ORDER BY m.created_at DESC LIMIT 2000`,
    )
    .all<Record<string, unknown>>();

  // Every customer, with or without channels, so the desktop scanner can add
  // Solo videos for anyone. Plan = latest subscription row (free when none).
  const users = await db
    .prepare(
      `SELECT u.id, u.email, u.created_at, u.role,
              (SELECT s.plan FROM subscriptions s WHERE s.user_id = u.id
                  AND (s.status IS NULL OR s.status = 'active') ORDER BY s.rowid DESC LIMIT 1) AS plan
         FROM users u ORDER BY u.email`,
    )
    .all<{ id: string; email: string; created_at: string; role: string | null; plan: string | null }>();

  // Every video the site knows, for the desktop scanner's channel lists.
  const videos = await db
    .prepare(
      `SELECT video_id, channel_id, user_id, title, published_at, status, scanned_at, note, found
         FROM wl_videos ORDER BY published_at DESC LIMIT 20000`,
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
    customLists: lists,
    sheetsConnected: !!(sheetsCfg.scriptUrl && sheetsCfg.token),
    sheetsSyncedAt: syncedAt,
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
      group: c.custom_group ?? "",
      state: states.get(c.id)?.state ?? "noplan",
      plan: states.get(c.id)?.plan ?? "free",
      checked: chk.get(c.id) ?? 0,
      waiting: cnt.get(c.id)?.waiting ?? 0,
      released: cnt.get(c.id)?.released ?? 0,
      lead: cnt.get(c.id)?.lead ?? 0,
    })),
    users: users.results.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      plan: u.role === "admin" ? "max" : u.plan || "free",
    })),
    videos: videos.results.map((v) => ({
      videoId: v.video_id,
      channelId: v.channel_id,
      userId: v.user_id,
      title: v.title ?? "",
      publishedAt: v.published_at ?? "",
      status: v.status,
      scannedAt: v.scanned_at ?? "",
      note: v.note ?? "",
      found: Number(v.found ?? 0),
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
      license: m.license ?? (m.eligible ? "plan" : "none"),
      userId: m.user_id,
      trackSlug: m.track_slug ?? "",
      onSite: m.on_site === undefined || m.on_site === null ? true : !!m.on_site,
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
      return json(
        await refreshChannels(ctx.env as Env, !!body.force, typeof body.channelId === "string" ? body.channelId : undefined),
      );
    case "lease": {
      // The desktop scanner is about to check these videos itself.
      const ids = (Array.isArray(body.videoIds) ? body.videoIds : []).map(String).filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x));
      for (const id of ids.slice(0, 500)) {
        await db
          .prepare(`UPDATE wl_videos SET status = 'scanning', leased_at = datetime('now') WHERE video_id = ?1`)
          .bind(id)
          .run();
      }
      return json({ ok: true, leased: ids.length });
    }
    case "solo_add": {
      const vid = String(body.videoId ?? "");
      if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) return json({ error: "Bad video id" }, 400);
      const r = await addSoloVideo(ctx.env as Env, String(body.userId ?? ""), vid);
      return json(r, "error" in r ? 400 : 200);
    }
    case "reset_scans": {
      // Everything scanned goes back into the queue (one channel or all). The
      // found matches stay as history unless clearMatches is set.
      const chId = typeof body.channelId === "string" && body.channelId ? body.channelId : null;
      const where = chId ? `WHERE channel_id = ?1` : ``;
      const q = db.prepare(
        `UPDATE wl_videos SET status = 'queued', scanned_at = NULL, leased_at = NULL, found = 0, note = NULL ${where}`,
      );
      const r = await (chId ? q.bind(chId) : q).run();
      let cleared = 0;
      if (body.clearMatches) {
        const m = db.prepare(`DELETE FROM wl_matches WHERE state IN ('new','in_sheet','not_eligible','removed') ${where}`);
        const rm = await (chId ? m.bind(chId) : m).run();
        cleared = (rm as { meta?: { changes?: number } }).meta?.changes ?? 0;
      }
      return json({ ok: true, requeued: (r as { meta?: { changes?: number } }).meta?.changes ?? 0, cleared });
    }
    case "match_again": {
      const id = Number(body.matchId);
      if (!Number.isFinite(id)) return json({ error: "matchId" }, 400);
      await sendAgain(db, id);
      return json({ ok: true });
    }
    case "match_force": {
      // the owner releases a claim that no license covers
      const id = Number(body.matchId);
      if (!Number.isFinite(id)) return json({ error: "matchId" }, 400);
      await forceMatch(db, id);
      return json({ ok: true });
    }
    case "licenses_recheck":
      return json({ ok: true, freed: await recheckLicenses(db) });
    case "email_customer": {
      // tell a customer that his video uses our track without a license
      const id = Number(body.matchId);
      if (!Number.isFinite(id)) return json({ error: "matchId" }, 400);
      const m = await db
        .prepare(
          `SELECT m.id, m.track_title, m.state, u.email, u.name, t.slug, v.title AS video_title, m.video_id
             FROM wl_matches m
             LEFT JOIN users u ON u.id = m.user_id
             LEFT JOIN tracks t ON t.id = m.track_id
             LEFT JOIN wl_videos v ON v.video_id = m.video_id
            WHERE m.id = ?1`,
        )
        .bind(id)
        .first<{ id: number; track_title: string; state: string; email: string | null; name: string | null;
                 slug: string | null; video_title: string | null; video_id: string }>();
      if (!m) return json({ error: "unknown match" }, 404);
      if (!m.email) return json({ error: "the customer has no email" }, 400);
      const site = new URL(ctx.request.url).origin;
      const trackUrl = m.slug ? `${site}/track/${m.slug}` : site;
      const videoUrl = `https://www.youtube.com/watch?v=${m.video_id}`;
      const subject = `Your video "${m.video_title || m.video_id}" and the track "${m.track_title}"`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:560px">
<p>Hi ${m.name || "there"},</p>
<p>Thank you for sending us your video. We checked it and found our track <b>${m.track_title}</b> in
<a href="${videoUrl}">${m.video_title || "your video"}</a>.</p>
<p>We could not find a license for this track on your account, so we are not able to release the Content ID claim yet.
As soon as the track is licensed, the claim is released, usually within a day:</p>
<p><a href="${trackUrl}" style="display:inline-block;background:#111;color:#F4C430;font-weight:bold;padding:10px 16px;border-radius:9px;text-decoration:none">License this track</a></p>
<p>A subscription covers every track in the store and all your future videos, so if you use our music regularly it may be the easier option.</p>
<p>If you already have a license for this track under another account or email, just reply to this message and we will sort it out.</p>
<p>Best regards,<br>TV Music Store</p></div>`;
      const ok = await sendEmail(ctx.env as Env, m.email, subject, html);
      if (!ok) return json({ error: "email failed" }, 502);
      await db.prepare(`UPDATE wl_matches SET license = 'none:emailed' WHERE id = ?1 AND state = 'not_eligible'`).bind(id).run();
      return json({ ok: true, to: m.email });
    }
    case "match_remove": {
      // one match id, or every match of a video
      const ids: number[] = [];
      if (body.matchId !== undefined) ids.push(Number(body.matchId));
      if (typeof body.videoId === "string") {
        const rs = await db.prepare(`SELECT id FROM wl_matches WHERE video_id = ?1`).bind(body.videoId).all<{ id: number }>();
        ids.push(...rs.results.map((r) => r.id));
      }
      let removed = 0;
      let sheetRows = 0;
      for (const id of ids) {
        if (!Number.isFinite(id)) continue;
        const r = await removeMatch(db, id);
        if (!r.ok) return json({ error: r.error }, 502);
        removed++;
        sheetRows += r.sheetRows ?? 0;
      }
      return json({ ok: true, removed, sheetRows });
    }
    case "solo_remove":
      return json(await removeSoloVideo(db, String(body.videoId ?? "")));
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
          composer: typeof m.composer === "string" ? m.composer.slice(0, 120) : undefined,
          onSite: typeof m.onSite === "boolean" ? m.onSite : undefined,
          inBase: typeof m.inBase === "string" ? m.inBase : undefined,
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
        if (body.action === "sheets_update") {
          const one = body.matchId !== undefined ? Number(body.matchId) : undefined;
          return json({ ok: true, ...(await updateSheets(db, Number.isFinite(one) ? one : undefined)) });
        }
        if (body.action === "sheets_sync") {
          const freed = await recheckLicenses(db);
          const r = { freed, ...(await syncSheets(db)) };
          await db
            .prepare(`INSERT INTO site_config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
            .bind("wl_sheets_synced", new Date().toISOString())
            .run();
          return json({ ok: true, ...r });
        }
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
    case "custom_add": {
      const r = await addCustomChannel(ctx.env as Env, String(body.group ?? ""), String(body.url ?? ""));
      return "error" in r && r.error ? json(r, 400) : json(r);
    }
    case "custom_list_add": {
      const r = await createCustomList(db, String(body.name ?? ""));
      return "error" in r && r.error ? json(r, 400) : json(r);
    }
    case "custom_list_remove":
      return json(await removeCustomList(db, String(body.name ?? "")));
    case "custom_link": {
      // a channel or a video link into a list
      const r = await addToCustomList(ctx.env as Env, String(body.group ?? ""), String(body.url ?? ""));
      return "error" in r && r.error ? json(r, 400) : json(r);
    }
    case "custom_remove":
      return json(await removeCustomChannel(db, String(body.channelId ?? "")));
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
