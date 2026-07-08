import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";

// GET /api/admin/master?track=<trackId> — admin only.
// Streams the track's private WAV zip from R2 so the track-page admin panel
// can rebuild it in the browser when a version is added or removed.
// 404 when the track has no zip (legacy uploads).

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }
  if (!ctx.env.R2) return json({ error: "R2 not bound" }, 503);

  const trackId = new URL(ctx.request.url).searchParams.get("track");
  if (!trackId) return json({ error: "track required" }, 400);

  const row = await (async () => {
    try {
      return await ctx.env.DB.prepare(`SELECT r2_key_wav_zip FROM tracks WHERE id = ?1`)
        .bind(trackId)
        .first<{ r2_key_wav_zip: string | null }>();
    } catch {
      return null; // column missing on a legacy DB
    }
  })();
  if (!row?.r2_key_wav_zip) return json({ error: "No WAV zip for this track", code: "nozip" }, 404);

  const obj = await ctx.env.R2.get(row.r2_key_wav_zip);
  if (!obj) return json({ error: "Zip missing in storage", code: "nozip" }, 404);

  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "cache-control": "no-store",
    },
  });
};
