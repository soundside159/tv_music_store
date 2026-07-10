import { getSessionUser, json, type Ctx } from "./_utils";
import { crc32, parseManifest, streamZip, type ZipEntrySpec } from "./_zipStream";

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

// The part of a version label that isn't the track title (so it isn't duplicated
// in the filename). "Opening Up Space (short version)" + "Opening Up Space" ->
// "short version"; the main version returns "".
const cleanVersionSuffix = (label: string, title: string): string => {
  let s = (label ?? "").trim();
  const t = (title ?? "").trim();
  if (t && s.toLowerCase().startsWith(t.toLowerCase())) s = s.slice(t.length);
  s = s.replace(/^[\s\-–—()[\]]+|[\s\-–—()[\]]+$/g, "").trim();
  if (/^(main|full|original|full version)$/i.test(s)) s = "";
  return s;
};

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
        quality?: number | string;
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
  const format = body?.format === "wav" ? "wav" : body?.format === "stems" ? "stems" : "mp3";
  const quality = String(body?.quality) === "128" ? 128 : 320;
  if (!slug || !versionId) return json({ error: "slug and versionId required" }, 400);

  // Current plan
  const sub = await ctx.env.DB.prepare(
    `SELECT plan, status FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ plan: string; status: string }>();
  const plan = sub?.status === "active" || sub?.status === "canceled" ? sub.plan : "free";

  // Resolve the track FIRST (needed for the one-time-license check below).
  // Select the newer columns defensively — older DBs may not have
  // r2_key_wav_zip yet (added lazily by the admin content API).
  const track = await (async () => {
    try {
      return await ctx.env.DB.prepare(
        `SELECT id, title, composer_id, r2_key_wav_zip, r2_key_stems, wav_manifest, stems_manifest
           FROM tracks WHERE slug = ?1`,
      )
        .bind(slug)
        .first<{
          id: string;
          title: string;
          composer_id: string | null;
          r2_key_wav_zip: string | null;
          r2_key_stems: string | null;
          wav_manifest: string | null;
          stems_manifest: string | null;
        }>();
    } catch {
      try {
        const mid = await ctx.env.DB.prepare(
          `SELECT id, title, composer_id, r2_key_wav_zip, r2_key_stems FROM tracks WHERE slug = ?1`,
        )
          .bind(slug)
          .first<{
            id: string;
            title: string;
            composer_id: string | null;
            r2_key_wav_zip: string | null;
            r2_key_stems: string | null;
          }>();
        return mid ? { ...mid, wav_manifest: null, stems_manifest: null } : null;
      } catch {
        const legacy = await ctx.env.DB.prepare(
          `SELECT id, title, composer_id FROM tracks WHERE slug = ?1`,
        )
          .bind(slug)
          .first<{ id: string; title: string; composer_id: string | null }>();
        return legacy
          ? { ...legacy, r2_key_wav_zip: null, r2_key_stems: null, wav_manifest: null, stems_manifest: null }
          : null;
      }
    }
  })();

  // One-time sync license for THIS track (any tier — all tiers include WAV).
  // sync_orders.track_id normally holds tracks.id, but the PayPal capture falls
  // back to the slug when the track row was missing at purchase time.
  const licenseOrder = await (async () => {
    try {
      return await ctx.env.DB.prepare(
        `SELECT id FROM sync_orders WHERE user_id = ?1 AND track_id IN (?2, ?3) LIMIT 1`,
      )
        .bind(user.id, track?.id ?? slug, slug)
        .first<{ id: string }>();
    } catch {
      return null;
    }
  })();
  const hasLicense = !!licenseOrder;

  // Plan gates (a purchased one-time license bypasses them for its track)
  if ((format === "wav" || format === "stems") && plan !== "max" && !hasLicense) {
    return json(
      {
        error: `${format === "stems" ? "Stems" : "WAV files"} come with the Max plan or a one-time license for this track`,
        code: "plan",
      },
      403,
    );
  }
  if (plan === "free" && !hasLicense) {
    const used = await ctx.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM download_log
        WHERE user_id = ?1 AND format = 'mp3'
          AND plan_at_download != 'license'
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

  let fileSrc: string | null = null;
  let r2Key: string | null = null;
  let isZip = false;
  // v2 storage: individual master files — the zip is streamed at download time.
  let manifestEntries: ReturnType<typeof parseManifest> = null;

  if (track) {
    const version = await (async () => {
      try {
        return await ctx.env.DB.prepare(
          `SELECT preview_src, preview_128, r2_key_wav, label FROM track_versions
            WHERE track_id = ?1 AND version_id = ?2 LIMIT 1`,
        )
          .bind(track.id, versionId)
          .first<{ preview_src: string; preview_128: string | null; r2_key_wav: string | null; label: string }>();
      } catch {
        const legacy = await ctx.env.DB.prepare(
          `SELECT preview_src, r2_key_wav, label FROM track_versions
            WHERE track_id = ?1 AND version_id = ?2 LIMIT 1`,
        )
          .bind(track.id, versionId)
          .first<{ preview_src: string; r2_key_wav: string | null; label: string }>();
        return legacy ? { ...legacy, preview_128: null } : null;
      }
    })();
    if (!version) return json({ error: "Version not found", code: "nofile" }, 404);
    if (format === "stems") {
      const m = parseManifest(track.stems_manifest);
      if (m && ctx.env.R2) {
        manifestEntries = m;
        isZip = true;
      } else if (track.r2_key_stems && ctx.env.R2) {
        r2Key = track.r2_key_stems;
        isZip = true;
      } else {
        return json({ error: "Stems are not uploaded yet for this track", code: "nofile" }, 404);
      }
    } else if (format === "wav") {
      // Preferred: v2 manifest (zip streamed on the fly, license PDF inside).
      // Legacy: one pre-packed zip, or a single per-version WAV.
      const m = parseManifest(track.wav_manifest);
      const wavKey = track.r2_key_wav_zip ?? version.r2_key_wav;
      if (m && ctx.env.R2) {
        manifestEntries = m;
        isZip = true;
      } else if (wavKey && ctx.env.R2) {
        r2Key = wavKey;
        isZip = /\.zip$/i.test(wavKey) || Boolean(track.r2_key_wav_zip);
      } else {
        return json({ error: "WAV files are not uploaded yet for this track", code: "nofile" }, 404);
      }
    } else {
      fileSrc = quality === 128 && version.preview_128 ? version.preview_128 : version.preview_src;
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
  let contentType = isZip ? "application/zip" : format === "wav" ? "audio/wav" : "audio/mpeg";
  if (manifestEntries && ctx.env.R2) {
    // v2: stream a zip straight out of the individual master files.
    const zipEntries: ZipEntrySpec[] = [];
    for (const m of manifestEntries) {
      const obj = await ctx.env.R2.get(m.key);
      if (!obj) return json({ error: `File missing in storage (${m.name})`, code: "nofile" }, 404);
      zipEntries.push({ name: m.name, size: m.size, crc: m.crc, body: obj.body });
    }
    // Drop the license certificate PDF into the bundle too (owner request) —
    // best-effort: the zip still ships if the PDF endpoint hiccups.
    try {
      const licPath = licenseOrder
        ? `/api/license-pdf?order=${encodeURIComponent(licenseOrder.id)}`
        : `/api/license-pdf?slug=${encodeURIComponent(slug)}`;
      const licRes = await fetch(new URL(licPath, new URL(ctx.request.url).origin).toString(), {
        headers: { cookie: ctx.request.headers.get("cookie") ?? "" },
      });
      if (licRes.ok) {
        const pdf = new Uint8Array(await licRes.arrayBuffer());
        zipEntries.push({
          name: `LICENSE - ${sanitizeFilename(track?.title ?? slug)}.pdf`,
          size: pdf.length,
          crc: crc32(pdf),
          body: pdf,
        });
      }
    } catch {
      // no PDF — bundle still delivers
    }
    audioBody = streamZip(zipEntries);
    contentType = "application/zip";
  } else if (r2Key && ctx.env.R2) {
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
    .bind(user.id, track?.id ?? slug, track?.composer_id ?? null, hasLicense ? "license" : plan, format)
    .run();

  const rawTitle = body?.title ?? track?.title ?? slug;
  const title = sanitizeFilename(rawTitle);
  const ext = isZip ? "zip" : format;
  // Strip the track title out of the version label so it isn't duplicated, then
  // prefix the site (tunetank-style): "tvmusicstore.com_Title (short version).mp3".
  const suffix = isZip ? "" : cleanVersionSuffix(body?.label ?? versionId, rawTitle);
  const stemsTag = format === "stems" ? " STEMS" : "";
  const base = (suffix ? `${title} (${sanitizeFilename(suffix)})` : title) + stemsTag;
  const code = slug.match(/^(\d+)/)?.[1] ?? "";
  const filename = code ? `tvmusicstore.com_${code}_${base}.${ext}` : `tvmusicstore.com_${base}.${ext}`;

  return new Response(audioBody, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
};
