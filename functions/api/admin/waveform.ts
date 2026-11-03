import { adminTokenOk, getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";

// POST /api/admin/waveform { src, profile }
//
// Stores a track preview's precomputed WAVEFORM (like Epidemic Sound's
// waveformUrl): a 1024-char string = 512 peak + 512 rms values, 6 bits each
// (see src/components/WaveformPreview.tsx). Saved to R2 next to the preview:
//   previews/x.mp3  ->  waveforms/previews/x.mp3.txt
// and served by /api/file/waveforms/... with a year-long cache, so visitors
// draw waveforms from ~1 KB instead of downloading every mp3.
// Written by STAFF browsers only (admin/editor), either while they browse or
// via the "Generate waveforms" button. No D1 writes, no catalogue bump.

const ALPHABET = /^[A-Za-z0-9_-]{1024}$/;

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.R2) return json({ error: "R2 bucket is not bound" }, 503);
  if (!adminTokenOk(ctx)) {
    const user = await getSessionUser(ctx);
    if (!user) return json({ error: "Not signed in" }, 401);
    if (user.role !== "admin" && user.role !== "editor" && user.email !== OWNER_EMAIL) {
      return json({ error: "Staff only" }, 403);
    }
  }
  const body = (await ctx.request.json().catch(() => ({}))) as { src?: unknown; profile?: unknown };
  const src = typeof body.src === "string" ? body.src : "";
  const m = src.match(/^\/api\/file\/(previews\/[A-Za-z0-9._\-/]+)$/);
  if (!m || m[1].includes("..")) return json({ error: "Bad src" }, 400);
  if (typeof body.profile !== "string" || !ALPHABET.test(body.profile)) {
    return json({ error: "Bad profile" }, 400);
  }
  await ctx.env.R2.put(`waveforms/${m[1]}.txt`, body.profile, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  return json({ ok: true });
};
