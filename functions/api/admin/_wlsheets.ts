// Composer claim sheets (Google Sheets) for the whitelist chain.
//
// One Google Sheet per composer (like the Epic Elite release sheets). The site
// talks to them through a small Google Apps Script web app owned by the store
// account (tools/whitelist_sheets/Code.gs), so no Google Cloud project or
// service-account key is needed. Settings live in site_config 'wl_sheets':
//   { scriptUrl, token, sheets: { <composer_id>: <spreadsheet id> } }
//
// update: new eligible matches -> appended under today's date, state in_sheet
// sync:   rows whose Action is "Released" -> state released
// email:  sync, then mail each composer how many videos still wait

import { sendEmail, type D1Database, type Env } from "../_utils";
import { ensureWlScan } from "./_wlscan";

const KEY = "wl_sheets";

export interface SheetsConfig {
  scriptUrl: string;
  token: string;
  sheets: Record<string, string>;
}

export const getSheetsConfig = async (db: D1Database): Promise<SheetsConfig> => {
  try {
    const r = await db.prepare(`SELECT value FROM site_config WHERE key = ?1`).bind(KEY).first<{ value: string }>();
    if (r) {
      const c = JSON.parse(r.value) as Partial<SheetsConfig>;
      return { scriptUrl: c.scriptUrl ?? "", token: c.token ?? "", sheets: c.sheets ?? {} };
    }
  } catch {
    // not set yet
  }
  return { scriptUrl: "", token: "", sheets: {} };
};

export const setSheetsConfig = async (db: D1Database, c: SheetsConfig) => {
  await db
    .prepare(`INSERT INTO site_config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(KEY, JSON.stringify(c))
    .run();
};

export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

const callScript = async (c: SheetsConfig, payload: Record<string, unknown>) => {
  if (!c.scriptUrl || !c.token) throw new Error("Composer sheets are not connected yet (Whitelisting -> Composers -> Settings).");
  const res = await fetch(c.scriptUrl, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, token: c.token }),
    redirect: "follow",
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Sheets script answered with something unexpected: " + text.slice(0, 120));
  }
  if (data.error) throw new Error("Sheets script: " + String(data.error));
  return data;
};

const fmtTime = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const todayUk = () => {
  const d = new Date();
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

/** Append every new eligible match to its composer's sheet. */
export const updateSheets = async (db: D1Database) => {
  await ensureWlScan(db);
  const c = await getSheetsConfig(db);
  const rows = await db
    .prepare(
      `SELECT m.id, m.composer_id, m.track_title, m.regions, m.video_id, m.on_site,
              v.title AS video_title, v.published_at, w.yt_title AS channel_title, w.custom_group
         FROM wl_matches m
         LEFT JOIN wl_videos v ON v.video_id = m.video_id
         LEFT JOIN wl_channels w ON w.id = m.channel_id
        WHERE m.state = 'new' AND m.eligible = 1
        ORDER BY m.created_at`,
    )
    .all<{
      id: number;
      composer_id: string | null;
      on_site: number | null;
      track_title: string;
      regions: string | null;
      video_id: string;
      video_title: string | null;
      published_at: string | null;
      channel_title: string | null;
      custom_group: string | null;
    }>();
  const byComposer = new Map<string, typeof rows.results>();
  for (const r of rows.results) {
    const k = r.composer_id ?? "";
    byComposer.set(k, [...(byComposer.get(k) ?? []), r]);
  }
  const date = todayUk();
  const done: Record<string, number> = {};
  const missing: string[] = [];
  for (const [composerId, list] of byComposer) {
    const sheetId = c.sheets[composerId];
    if (!sheetId) {
      missing.push(composerId || "(no composer)");
      continue;
    }
    await callScript(c, {
      action: "append",
      sheetId,
      date,
      rows: list.map((r) => {
        let regions: [number, number][] = [];
        try {
          regions = JSON.parse(r.regions ?? "[]");
        } catch {
          // keep empty
        }
        return [
          // Custom-list channels show where the request came from: "[Pixabay] Channel"
          (r.custom_group ? `[${r.custom_group}] ` : "") + (r.channel_title ?? ""),
          `https://www.youtube.com/watch?v=${r.video_id}`,
          r.video_title ?? "",
          r.track_title,
          regions.map(([a, b]) => `${fmtTime(a)} - ${fmtTime(b)}`).join(", "),
          (r.published_at ?? "").slice(0, 10),
          "Release",
          "",
          `TVMS-${r.id}`,
          r.on_site === 0 ? "Not yet" : "Yes",
        ];
      }),
    });
    for (const r of list) {
      await db
        .prepare(`UPDATE wl_matches SET state = 'in_sheet', sheet_date = datetime('now') WHERE id = ?1`)
        .bind(r.id)
        .run();
    }
    done[composerId] = list.length;
  }
  return { added: done, missingSheets: missing };
};

/** Read every composer sheet; rows set to "Released" mark their match released. */
export const syncSheets = async (db: D1Database) => {
  await ensureWlScan(db);
  const c = await getSheetsConfig(db);
  let released = 0;
  for (const sheetId of Object.values(c.sheets)) {
    if (!sheetId) continue;
    const data = await callScript(c, { action: "status", sheetId });
    const rows = (data.rows as { ref: string; action: string }[]) ?? [];
    for (const r of rows) {
      const m = /^TVMS-(\d+)$/.exec(String(r.ref || "").trim());
      if (!m) continue;
      const isReleased = String(r.action || "").trim().toLowerCase() === "released";
      const res = await db
        .prepare(
          isReleased
            ? `UPDATE wl_matches SET state = 'released', released_at = datetime('now') WHERE id = ?1 AND state = 'in_sheet'`
            : `UPDATE wl_matches SET state = 'in_sheet', released_at = NULL WHERE id = ?1 AND state = 'released'`,
        )
        .bind(Number(m[1]))
        .run();
      if (isReleased && (res as { meta?: { changes?: number } }).meta?.changes) released++;
    }
  }
  return { released };
};

/** Sync, then tell each composer how many videos still wait (only if > 0). */
export const emailComposers = async (env: Env) => {
  const db = env.DB;
  const synced = await syncSheets(db);
  const c = await getSheetsConfig(db);
  const rows = await db
    .prepare(
      `SELECT m.composer_id, c.display_name AS name, u.email AS email,
              SUM(CASE WHEN m.state = 'in_sheet' THEN 1 ELSE 0 END) AS waiting,
              SUM(CASE WHEN m.state = 'in_sheet' AND m.sheet_date > datetime('now','-1 day') THEN 1 ELSE 0 END) AS today,
              SUM(CASE WHEN m.state = 'released' THEN 1 ELSE 0 END) AS released
         FROM wl_matches m
         LEFT JOIN composers c ON c.id = m.composer_id
         LEFT JOIN users u ON u.id = c.user_id
        WHERE m.composer_id IS NOT NULL
        GROUP BY m.composer_id`,
    )
    .all<{ composer_id: string; name: string | null; email: string | null; waiting: number; today: number; released: number }>();
  const sent: string[] = [];
  const skipped: string[] = [];
  for (const r of rows.results) {
    const sheetId = c.sheets[r.composer_id];
    if (!r.waiting || !sheetId || !r.email) {
      if (r.waiting) skipped.push(`${r.name ?? r.composer_id}: ${!r.email ? "no email" : "no sheet"}`);
      continue;
    }
    const n = r.waiting;
    const subject = `${n} video${n === 1 ? " is" : "s are"} waiting for a claim release`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:560px">
<h2 style="font-size:20px;margin:0 0 10px">${subject}</h2>
<p>Hi ${r.name ?? "there"},<br>customers with an active TV Music Store plan used your music. The videos and tracks are in your sheet. Please release the claims in your Content ID dashboard and set <b>Action</b> to <b>Released</b> in the sheet.</p>
<div style="border:1px solid #eee;border-radius:10px;padding:14px 16px;background:#fafafa;margin:14px 0">
<b>Waiting for release:</b> ${n} video${n === 1 ? "" : "s"}${r.today ? ` (${r.today} added today)` : ""}<br>
<b>Released so far:</b> ${r.released}</div>
<p><a href="${sheetUrl(sheetId)}" style="display:inline-block;background:#111;color:#F4C430;font-weight:bold;padding:10px 16px;border-radius:9px;text-decoration:none">Open my sheet</a></p>
<p style="font-size:12px;color:#777">Not your track? Write it in the "Your notes" column and we will check it.</p></div>`;
    const ok = await sendEmail(env, r.email, subject, html);
    (ok ? sent : skipped).push(`${r.name ?? r.composer_id}${ok ? "" : ": email failed"}`);
  }
  return { sent, skipped, releasedFromSheets: synced.released };
};
