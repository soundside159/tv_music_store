import { getSessionUser, json, OWNER_EMAIL, type Ctx, type Env } from "../_utils";
import { channelNewVideos, handledMap } from "./_whitelist";

// GET /api/admin/whitelist-videos?id=<wl_channels id> — admin only.
// On-demand (Pages has no cron): resolves the whitelisted channel via the
// YouTube Data API and returns recent uploads published AFTER it was whitelisted
// (each flagged `handled` when already sent for claim removal). Only serviced
// while the owning customer's subscription is active.

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
       FROM wl_channels w
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

  const resolved = await channelNewVideos(env.YOUTUBE_API_KEY, row.channel_url, row.added_at);
  if (!resolved) {
    return json({ error: "Couldn't resolve this channel on YouTube. Ask the customer for the @handle or /channel/ URL." }, 422);
  }

  const handled = await handledMap(ctx.env.DB);
  const videos = resolved.videos.map((v) => ({
    ...v,
    handled: handled.has(v.videoId),
    handledAt: handled.get(v.videoId) ?? null,
  }));

  return json({ videos, channelTitle: resolved.channelTitle, cutoff: row.added_at });
};
