import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";
import { ensureWlHandled } from "./_whitelist";

// Admin: record whitelisted-channel videos as "sent for claim removal".
// POST { videos: [{ videoId, userId, channelId, url, title }] } -> mark handled
// DELETE ?videoId=... -> un-mark (back into the "new" list)

const gate = async (ctx: Ctx) => {
  const admin = await getSessionUser(ctx);
  if (!admin) return json({ error: "Not signed in" }, 401);
  if (admin.role !== "admin" && admin.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }
  return null;
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const denied = await gate(ctx);
  if (denied) return denied;

  const body = await readJson<{
    videos?: { videoId?: string; userId?: string; channelId?: string; url?: string; title?: string }[];
  }>(ctx.request);
  const videos = (body?.videos ?? []).filter((v) => v.videoId && v.userId).slice(0, 200);
  if (videos.length === 0) return json({ error: "videos required" }, 400);

  await ensureWlHandled(ctx.env.DB);
  for (const v of videos) {
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO wl_handled (video_id, user_id, channel_id, video_url, title)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
      .bind(v.videoId, v.userId, v.channelId ?? null, v.url ?? null, v.title ?? null)
      .run();
  }
  return json({ ok: true, marked: videos.length });
};

export const onRequestDelete = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const denied = await gate(ctx);
  if (denied) return denied;

  const videoId = new URL(ctx.request.url).searchParams.get("videoId");
  if (!videoId) return json({ error: "videoId required" }, 400);

  await ensureWlHandled(ctx.env.DB);
  await ctx.env.DB.prepare(`DELETE FROM wl_handled WHERE video_id = ?1`).bind(videoId).run();
  return json({ ok: true });
};
