import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";

// POST /api/admin/upload?filename=<base-name> — admin only.
// Body = raw image bytes, content-type header decides the extension.
// Stores to R2 under covers/... and returns { path } for /api/file/covers/...

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB is plenty for a cover

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
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

  const contentType = (ctx.request.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) return json({ error: "Upload an image (png, jpg, webp, gif or svg)" }, 415);

  const bytes = await ctx.request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: "Empty file" }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: "Image too large (max 8 MB)" }, 413);

  const rawName = new URL(ctx.request.url).searchParams.get("filename") ?? "cover";
  const base =
    rawName
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "cover";

  const key = `covers/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await ctx.env.R2.put(key, bytes, { httpMetadata: { contentType } });

  return json({ ok: true, key, path: `/api/file/${key}` });
};
