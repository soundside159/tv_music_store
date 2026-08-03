import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";

// ---------------------------------------------------------------------------
// POST /api/admin/fetch-image  { url }
//
// "Paste a direct image link" for cover art: the SERVER downloads the picture
// and stores it in our own R2, exactly like a manual upload. Doing it here and
// not in the browser is the whole point — remote hosts don't send CORS headers,
// so the page itself cannot read those bytes, and we must not hotlink either:
// the cover has to live on our storage or it breaks the day the source moves.
//
// Same permissions as /api/admin/upload (admin, owner or a composer).
// Returns { ok, path } where path is /api/file/covers/...
// ---------------------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Block anything that could point back inside our own network (SSRF). */
const isPublicHttpsUrl = (raw: string): URL | null => {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    /^\[?::1\]?$/.test(host) ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host)
  ) {
    return null;
  }
  return u;
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  let allowed = user.role === "admin" || user.email === OWNER_EMAIL || user.role === "composer";
  if (!allowed) {
    const cmp = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(user.id)
      .first();
    allowed = !!cmp;
  }
  if (!allowed) return json({ error: "Composer or admin account required" }, 403);
  if (!ctx.env.R2) {
    return json({ error: "R2 bucket is not bound yet (Pages -> Settings -> Bindings -> R2)" }, 503);
  }

  const body = await readJson<{ url?: string; filename?: string }>(ctx.request);
  const target = isPublicHttpsUrl(body?.url ?? "");
  if (!target) return json({ error: "Paste a full public image link (https://…)" }, 400);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        // Some CDNs answer 403 to a bare fetch; a normal browser Accept header
        // is enough for the usual cover-art hosts.
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
        "user-agent": "Mozilla/5.0 (compatible; TVMusicStore/1.0; +https://tvmusicstore.com)",
      },
    });
  } catch {
    return json({ error: "Could not reach that link" }, 502);
  }
  if (!upstream.ok) return json({ error: `The link answered ${upstream.status}` }, 502);

  const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    return json(
      { error: contentType ? `That link is ${contentType}, not an image` : "That link is not an image" },
      415,
    );
  }

  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return json({ error: "Image too large (max 8 MB)" }, 413);

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: "The link returned an empty file" }, 502);
  if (bytes.byteLength > MAX_BYTES) return json({ error: "Image too large (max 8 MB)" }, 413);

  const rawName =
    body?.filename ??
    decodeURIComponent(target.pathname.split("/").pop() ?? "") ??
    "cover";
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
