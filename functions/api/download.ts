import { getSessionUser, json, type Ctx } from "./_utils";

// POST { slug, versionId, format, src, title, label } -> checks the plan,
// enforces limits, logs to download_log and streams the audio file back.
//
// File sources, in priority order:
//   wav  -> R2 object at track_versions.r2_key_wav (Max plan only, needs R2 binding)
//   mp3  -> track_versions.preview_src (public MP3), fetched same-origin
//   mp3 fallback (track not in D1 yet, catalog on mocks) -> client-provided
//          src, accepted ONLY if it points into /audio/previews/*.mp3 —
//          those files are public anyway; the value here is limits + logging.
//
// Error codes the frontend relies on: auth | limit | plan | nofile

const FREE_MONTHLY_LIMIT = 3;

const sanitizeFilename = (s: string) =>
  s.replace(/[^\w\s\-().]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "track";

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in to download tracks", code: "auth" }, 401);

  const body = await (async () => {
    try {
      return (await ctx.request.json()) as {
        slug?: string;
        versionId?: string;
        format?: string;
        src?: string;
        title?: string;
        label?: string;
      };
    } catch {
      return null;
    }
  })();
  const slug = body?.slug?.trim();
  const versionId = body?.versionId?.trim();
  const format = body?.format === "wav" ? "wav" : "mp3";
  if (!slug || !versionId) return json({ error: "slug and versionId required" }, 400);

  // Current plan
  const sub = await ctx.env.DB.prepare(
    `SELECT plan, status FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ plan: string; status: string }>();
  const plan = sub?.status === "active" || sub?.status === "canceled" ? sub.plan : "free";

  // Plan gates
  if (format === "wav" && plan !== "max") {
    return json({ error: "WAV & stems are included in the Max plan", code: "plan" }, 403);
  }
  if (plan === "free") {
    const used = await ctx.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM download_log
        WHERE user_id = ?1 AND format = 'mp3'
          AND created_at >= datetime('now', 'start of month')`,
    )
      .bind(user.id)
      .first<{ n: number }>();
    if ((used?.n ?? 0) >= FREE_MONTHLY_LIMIT) {
      return json(
        { error: `Free plan limit reached (${FREE_MONTHLY_LIMIT} downloads/month)`, code: "limit" },
        403,
      );
    }
  }

  // Resolve the file
  const track = await ctx.env.DB.prepare(
    `SELECT id, title, composer_id FROM tracks WHERE slug = ?1`,
  )
    .bind(slug)
    .first<{ id: string; title: string; composer_id: string | null }>();

  let fileSrc: string | null = null;
  let r2Key: string | null = null;

  if (track) {
    const version = await ctx.env.DB.prepare(
      `SELECT preview_src, r2_key_wav, label FROM track_versions
        WHERE track_id = ?1 AND version_id = ?2 LIMIT 1`,
    )
      .bind(track.id, versionId)
      .first<{ preview_src: string; r2_key_wav: string | null; label: string }>();
    if (!version) return json({ error: "Version not found", code: "nofile" }, 404);
    if (format === "wav") {
      if (!version.r2_key_wav || !ctx.env.R2) {
        return json({ error: "WAV master is not uploaded yet for this track", code: "nofile" }, 404);
      }
      r2Key = version.r2_key_wav;
    } else {
      fileSrc = version.preview_src;
    }
  } else {
    // Mock-catalog fallback: public previews only, mp3 only.
    const src = body?.src ?? "";
    if (format !== "mp3" || !/^\/audio\/previews\/[\w\-/.]+\.mp3$/.test(src)) {
      return json({ error: "Track not found", code: "nofile" }, 404);
    }
    fileSrc = src;
  }

  // Fetch the audio
  let audioBody: ReadableStream;
  let contentType = format === "wav" ? "audio/wav" : "audio/mpeg";
  if (r2Key && ctx.env.R2) {
    const obj = await ctx.env.R2.get(r2Key);
    if (!obj) return json({ error: "File missing in storage", code: "nofile" }, 404);
    audioBody = obj.body;
    contentType = obj.httpMetadata?.contentType ?? contentType;
  } else {
    const origin = new URL(ctx.request.url).origin;
    const fileRes = await fetch(new URL(fileSrc as string, origin).toString());
    if (!fileRes.ok || !fileRes.body) {
      return json({ error: "File not found", code: "nofile" }, 404);
    }
    audioBody = fileRes.body;
  }

  // Log AFTER the file is resolved so failed attempts don't burn the limit.
  await ctx.env.DB.prepare(
    `INSERT INTO download_log (user_id, track_id, composer_id, plan_at_download, format)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(user.id, track?.id ?? slug, track?.composer_id ?? null, plan, format)
    .run();

  const title = sanitizeFilename(body?.title ?? track?.title ?? slug);
  const label = sanitizeFilename(body?.label ?? versionId);
  const filename = `${title} (${label}).${format}`;

  return new Response(audioBody, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
};
