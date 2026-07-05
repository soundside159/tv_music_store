import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";

// POST /api/admin/upload-audio?kind=preview|master&filename=<base> — admin only.
// Body = raw audio bytes; content-type header decides the extension.
//   preview -> previews/<base>-<uuid>.mp3  (public, served by /api/file, used as
//              track_versions.preview_src for playback + mp3 download)
//   master  -> masters/<base>-<uuid>.wav   (PRIVATE, stored as r2_key_wav; only
//              /api/download serves it, Max plan gated)

const PREVIEW_MAX = 25 * 1024 * 1024; // 25 MB
const MASTER_MAX = 95 * 1024 * 1024; // 95 MB (stay under Cloudflare's ~100 MB body limit)

const EXT_BY_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }
  if (!ctx.env.R2) {
    return json(
      { error: "R2 bucket is not bound yet (Pages -> Settings -> Bindings -> R2, name: R2)" },
      503,
    );
  }

  const url = new URL(ctx.request.url);
  const kind = url.searchParams.get("kind") === "master" ? "master" : "preview";

  const contentType = (ctx.request.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) return json({ error: "Upload an MP3 or WAV audio file" }, 415);
  if (kind === "preview" && ext !== "mp3") {
    return json({ error: "The preview must be an MP3" }, 415);
  }

  const bytes = await ctx.request.arrayBuffer();
  const max = kind === "master" ? MASTER_MAX : PREVIEW_MAX;
  if (bytes.byteLength === 0) return json({ error: "Empty file" }, 400);
  if (bytes.byteLength > max) {
    return json({ error: `File too large (max ${Math.round(max / 1024 / 1024)} MB)` }, 413);
  }

  const rawName = url.searchParams.get("filename") ?? kind;
  const base =
    rawName
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || kind;

  const prefix = kind === "master" ? "masters" : "previews";
  const key = `${prefix}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await ctx.env.R2.put(key, bytes, { httpMetadata: { contentType } });

  // Masters are private — no public path is returned, only the key.
  return json({
    ok: true,
    key,
    path: kind === "preview" ? `/api/file/${key}` : null,
  });
};
