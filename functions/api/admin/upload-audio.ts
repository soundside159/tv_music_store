import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";

// POST /api/admin/upload-audio?kind=<kind>&filename=<base> — admin only.
// Body = raw file bytes; content-type header decides the extension.
//   preview     -> previews/<base>-<uuid>.mp3   (public: 320 kbps site preview + 320 download)
//   preview128  -> previews/<base>-<uuid>.mp3   (public: 128 kbps download)
//   master      -> masters/<base>-<uuid>.<ext>  (PRIVATE single WAV/MP3 master — legacy)
//   wavzip      -> masters/<base>-<uuid>.zip    (PRIVATE zip of all WAV versions, Max/licensed
//                  download only; only /api/download serves the masters/ prefix)
//   stems       -> masters/stems-<base>-<uuid>.zip (PRIVATE stems bundle, Max/licensed download)

const PREVIEW_MAX = 25 * 1024 * 1024; // 25 MB
const MASTER_MAX = 95 * 1024 * 1024; // 95 MB (stay under Cloudflare's ~100 MB body limit)

const EXT_BY_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

type Kind = "preview" | "preview128" | "master" | "wavzip" | "stems";
const PUBLIC_KINDS: Kind[] = ["preview", "preview128"];

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const isAdmin = user.role === "admin" || user.email === OWNER_EMAIL;
  // Composers may upload track material too (their Add-track flow encodes
  // previews client-side and zips WAVs/stems, same as the admin pipeline).
  if (!isAdmin && user.role !== "composer") {
    return json({ error: "Admin only" }, 403);
  }
  if (!ctx.env.R2) {
    return json(
      { error: "R2 bucket is not bound yet (Pages -> Settings -> Bindings -> R2, name: R2)" },
      503,
    );
  }

  const url = new URL(ctx.request.url);
  const kindParam = url.searchParams.get("kind");
  const kind: Kind =
    kindParam === "master" || kindParam === "wavzip" || kindParam === "preview128" || kindParam === "stems"
      ? kindParam
      : "preview";
  if (!isAdmin && kind === "master") {
    return json({ error: "Admin only" }, 403);
  }
  const isPublic = PUBLIC_KINDS.includes(kind);

  const contentType = (ctx.request.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) return json({ error: "Unsupported file type" }, 415);
  if (isPublic && ext !== "mp3") {
    return json({ error: "Previews must be MP3" }, 415);
  }
  if ((kind === "wavzip" || kind === "stems") && ext !== "zip") {
    return json({ error: kind === "stems" ? "Stems must be a .zip" : "The WAV bundle must be a .zip" }, 415);
  }

  const bytes = await ctx.request.arrayBuffer();
  const max = isPublic ? PREVIEW_MAX : MASTER_MAX;
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

  const prefix = isPublic ? "previews" : "masters";
  const stemsTag = kind === "stems" ? "stems-" : "";
  const key = `${prefix}/${stemsTag}${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await ctx.env.R2.put(key, bytes, { httpMetadata: { contentType } });

  // Public kinds return a servable path; private kinds return the key only.
  return json({
    ok: true,
    key,
    path: isPublic ? `/api/file/${key}` : null,
  });
};
