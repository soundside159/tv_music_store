import { getSessionUser, json, OWNER_EMAIL, type Ctx, type Env } from "../_utils";

// GET /api/admin/whitelist-videos?id=<whitelist_channel_id> — admin only.
// On-demand (Pages has no cron): resolves the whitelisted channel via the
// YouTube Data API and returns recent uploads published AFTER it was whitelisted,
// so the owner can open each and clear Content ID claims. Only serviced while the
// owning customer's subscription is active.

const YT = "https://www.googleapis.com/youtube/v3";

interface ChannelResolved {
  uploads: string;
  title: string;
}

const ytChannel = async (key: string, channelUrl: string): Promise<ChannelResolved | null> => {
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

const ytUploads = async (key: string, playlist: string) => {
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

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const admin = await getSessionUser(ctx);
  if (!admin) return json({ error: "Not signed in" }, 401);
  if (admin.role !== "admin" && admin.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }

  const env = ctx.env as Env;
  if (!env.YOUTUBE_API_KEY) {
    return json({ error: "YouTube monitoring is not configured (set YOUTUBE_API_KEY).", code: "nokey" }, 503);
  }

  const id = new URL(ctx.request.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  const row = await ctx.env.DB.prepare(
    `SELECT w.channel_url, w.added_at, w.user_id,
            s.plan AS plan, s.status AS status
       FROM whitelist_channels w
       LEFT JOIN subscriptions s ON s.rowid = (
         SELECT rowid FROM subscriptions WHERE user_id = w.user_id ORDER BY rowid DESC LIMIT 1
       )
      WHERE w.id = ?1`,
  )
    .bind(id)
    .first<{ channel_url: string; added_at: string; user_id: string; plan: string | null; status: string | null }>();
  if (!row) return json({ error: "Channel not found" }, 404);

  const active = (row.status ? row.status === "active" : false) && (row.plan ?? "free") !== "free";
  if (!active) {
    return json({ videos: [], inactive: true, cutoff: row.added_at });
  }

  const channel = await ytChannel(env.YOUTUBE_API_KEY, row.channel_url);
  if (!channel) {
    return json({ error: "Couldn't resolve this channel on YouTube. Ask the customer for the @handle or /channel/ URL." }, 422);
  }

  const cutoff = row.added_at; // videos published after the channel was whitelisted
  const videos = (await ytUploads(env.YOUTUBE_API_KEY, channel.uploads))
    .filter((v) => !cutoff || v.publishedAt >= cutoff)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .map((v) => ({ ...v, url: `https://www.youtube.com/watch?v=${v.videoId}` }));

  return json({ videos, channelTitle: channel.title, cutoff });
};
