import { getSessionUser, json, OWNER_EMAIL, type Ctx, type Env } from "../_utils";
import { channelNewVideos, handledMap } from "./_whitelist";

// GET /api/admin/whitelist-videos-all — admin only. The morning claim-removal
// workflow: new uploads across EVERY active whitelisted channel in one list,
// grouped by channel, each video flagged `handled` when it was already sent to
// the Content ID provider. Sequential YouTube calls (2 per channel) to be
// gentle on the API quota; capped at 50 channels per request.

const MAX_CHANNELS = 50;

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

  const rows = await ctx.env.DB.prepare(
    `SELECT w.id, w.channel_url, w.added_at, w.user_id,
            u.email AS user_email, u.name AS user_name,
            s.plan AS plan, s.status AS status
       FROM wl_channels w
       LEFT JOIN users u ON u.id = w.user_id
       LEFT JOIN subscriptions s ON s.rowid = (
         SELECT rowid FROM subscriptions WHERE user_id = w.user_id ORDER BY rowid DESC LIMIT 1
       )
      ORDER BY w.added_at ASC`,
  ).all<{
    id: string;
    channel_url: string;
    added_at: string;
    user_id: string;
    user_email: string | null;
    user_name: string | null;
    plan: string | null;
    status: string | null;
  }>();

  const active = rows.results
    .filter((r) => (r.status ? r.status === "active" : false) && (r.plan ?? "free") !== "free")
    .slice(0, MAX_CHANNELS);

  const handled = await handledMap(ctx.env.DB);

  const groups: {
    channelId: string;
    channelUrl: string;
    channelTitle: string;
    userId: string;
    customerName: string;
    customerEmail: string;
    plan: string;
    error?: string;
    videos: {
      videoId: string;
      title: string;
      publishedAt: string;
      url: string;
      handled: boolean;
      handledAt: string | null;
    }[];
  }[] = [];

  for (const r of active) {
    const base = {
      channelId: r.id,
      channelUrl: r.channel_url,
      userId: r.user_id,
      customerName: r.user_name ?? "",
      customerEmail: r.user_email ?? "",
      plan: r.plan ?? "free",
    };
    const resolved = await channelNewVideos(
      env.YOUTUBE_API_KEY,
      r.channel_url,
      r.added_at,
      ctx.env.DB,
    );
    if (!resolved) {
      groups.push({ ...base, channelTitle: "", videos: [], error: "Couldn't resolve channel on YouTube" });
      continue;
    }
    groups.push({
      ...base,
      channelTitle: resolved.channelTitle,
      videos: resolved.videos.map((v) => ({
        ...v,
        handled: handled.has(v.videoId),
        handledAt: handled.get(v.videoId) ?? null,
      })),
    });
  }


  return json({ groups, activeChannels: active.length, totalChannels: rows.results.length });
};
