// Shared helpers for the admin whitelisting endpoints: YouTube Data API
// lookups + the wl_handled table ("this video was already sent for claim
// removal"). Underscore-prefixed = not routed by Pages Functions.

import { bumpUsage } from "../_usage";
import type { D1Database } from "../_utils";

const YT = "https://www.googleapis.com/youtube/v3";

export interface WlVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  url: string;
}

interface ChannelResolved {
  uploads: string;
  title: string;
}

/** Lazily creates wl_handled (also in 0001_init.sql for fresh DBs). */
export const ensureWlHandled = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS wl_handled (
         video_id   TEXT PRIMARY KEY,
         user_id    TEXT NOT NULL,
         channel_id TEXT,
         video_url  TEXT,
         title      TEXT,
         marked_at  TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
};

export const ytChannel = async (key: string, channelUrl: string): Promise<ChannelResolved | null> => {
  // Derive the best lookup param from the stored URL.
  let param: string | null = null;
  const handle = channelUrl.match(/youtube\.com\/(@[\w.-]+)/i);
  const chanId = channelUrl.match(/youtube\.com\/channel\/([\w-]+)/i);
  const user = channelUrl.match(/youtube\.com\/user\/([\w.-]+)/i);
  const custom = channelUrl.match(/youtube\.com\/c\/([\w.-]+)/i);
  if (chanId) param = `id=${encodeURIComponent(chanId[1])}`;
  else if (handle) param = `forHandle=${encodeURIComponent(handle[1])}`;
  else if (user) param = `forUsername=${encodeURIComponent(user[1])}`;
  else if (custom) param = `forHandle=${encodeURIComponent("@" + custom[1])}`;
  if (!param) return null;

  const res = await fetch(`${YT}/channels?part=contentDetails,snippet&${param}&key=${key}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: { snippet?: { title?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
  };
  const item = data.items?.[0];
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return null;
  return { uploads, title: item?.snippet?.title ?? "" };
};

export const ytUploads = async (key: string, playlist: string) => {
  const res = await fetch(
    `${YT}/playlistItems?part=snippet&maxResults=20&playlistId=${encodeURIComponent(playlist)}&key=${key}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: { snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } } }[];
  };
  return (data.items ?? [])
    .map((i) => ({
      videoId: i.snippet?.resourceId?.videoId ?? "",
      title: i.snippet?.title ?? "",
      publishedAt: i.snippet?.publishedAt ?? "",
    }))
    .filter((v) => v.videoId);
};

/**
 * New uploads on a whitelisted channel since `cutoff`, newest first.
 * `db` is optional and only used to meter the YouTube quota we burn (2 units per
 * channel: one `channels` lookup + one `playlistItems` page) — see _usage.ts.
 */
export const channelNewVideos = async (
  key: string,
  channelUrl: string,
  cutoff: string,
  db?: D1Database,
): Promise<{ videos: WlVideo[]; channelTitle: string } | null> => {
  void bumpUsage(db, "youtube", 2);
  const channel = await ytChannel(key, channelUrl);
  if (!channel) return null;
  const videos = (await ytUploads(key, channel.uploads))
    .filter((v) => !cutoff || v.publishedAt >= cutoff)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .map((v) => ({ ...v, url: `https://www.youtube.com/watch?v=${v.videoId}` }));
  return { videos, channelTitle: channel.title };
};

/** All handled video ids -> marked_at (loaded once per request). */
export const handledMap = async (db: D1Database): Promise<Map<string, string>> => {
  await ensureWlHandled(db);
  const rows = await db
    .prepare(`SELECT video_id, marked_at FROM wl_handled`)
    .all<{ video_id: string; marked_at: string }>();
  return new Map(rows.results.map((r) => [r.video_id, r.marked_at]));
};
