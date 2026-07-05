import { json, type Ctx } from "../_utils";

// GET /api/file/covers/... — public delivery of R2 images (covers, panels).
// SECURITY: only the covers/ and images/ prefixes are public here. Audio
// masters (masters/, wav keys) are served exclusively by /api/download with
// plan checks — never add them to this allowlist.

const PUBLIC_PREFIXES = ["covers/", "images/"];

interface CtxWithParams extends Ctx {
  params: { path?: string | string[] };
}

export const onRequestGet = async (ctx: CtxWithParams) => {
  if (!ctx.env.R2) return json({ error: "R2 bucket is not bound" }, 503);

  const raw = ctx.params.path;
  const key = (Array.isArray(raw) ? raw.join("/") : (raw ?? "")).replace(/^\/+/, "");
  if (!key || key.includes("..") || !PUBLIC_PREFIXES.some((p) => key.startsWith(p))) {
    return json({ error: "Not found" }, 404);
  }

  const obj = await ctx.env.R2.get(key);
  if (!obj) return json({ error: "Not found" }, 404);

  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      // Keys are content-addressed (uuid suffix), safe to cache hard.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};
