import { getSessionUser, json, type Ctx } from "./_utils";
import { getOrCreatePlanLicense } from "./_licenses";
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

// Titles lose leading catalog numbers and underscores for display/filenames:
// "1685_As Light As A Feather" -> "As Light As A Feather".
// Leading digits are ONLY a catalog number when a separator follows AND they
// are not a duration marker — "15sec" / "30 sec" version labels keep their 15.
const CATALOG_NUM_RE = /^\s*\d+[\s._-]+(?!(?:sec(?:s|onds?)?|min(?:s|utes?)?)\b)/i;
const tidyTitle = (s: string) => {
  const t = (s ?? "").replace(/_+/g, " ").replace(CATALOG_NUM_RE, "").trim();
  return t || (s ?? "").trim();
};

// The part of a version label that isn't the track title (so it isn't duplicated
// in the filename). "Opening Up Space (short version)" + "Opening Up Space" ->
// "short version"; the main version returns "".
const cleanVersionSuffix = (label: string, title: string): string => {
  // Underscores read as spaces, leading catalog numbers ("1685_") drop, and the
  // title may sit anywhere ("Composer Name_Title_30sec") — keep what FOLLOWS it.
  let s = (label ?? "").replace(/_+/g, " ").replace(CATALOG_NUM_RE, "").trim();
  const t = (title ?? "").replace(/_+/g, " ").replace(CATALOG_NUM_RE, "").trim();
  if (t) {
    const idx = s.toLowerCase().indexOf(t.toLowerCase());
    if (idx >= 0) s = s.slice(idx + t.length);
  }
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
        /** MP3 only: pack the file together with the license PDF into a zip. */
        includeLicense?: boolean;
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

  // Current plan (the period end is snapshotted onto the licence code below).
  const sub = await ctx.env.DB.prepare(
    `SELECT plan, status, current_period_end FROM subscriptions
      WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ plan: string; status: string; current_period_end: string | null }>();
  const plan = sub?.status === "active" || sub?.status === "canceled" ? sub.plan : "free";
  const planPeriodEnd = sub?.current_period_end ?? null;

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
  // A REFUNDED licence does not count — the money went back, so the rights did
  // too. Older DBs have no `status` column, hence the fallback query.
  const licenseOrder = await (async () => {
    try {
      return await ctx.env.DB.prepare(
        `SELECT id FROM sync_orders
          WHERE user_id = ?1 AND track_id IN (?2, ?3)
            AND COALESCE(status, 'active') <> 'refunded'
          LIMIT 1`,
      )
        .bind(user.id, track?.id ?? slug, slug)
        .first<{ id: string }>();
    } catch {
      try {
        return await ctx.env.DB.prepare(
          `SELECT id FROM sync_orders WHERE user_id = ?1 AND track_id IN (?2, ?3) LIMIT 1`,
        )
          .bind(user.id, track?.id ?? slug, slug)
          .first<{ id: string }>();
      } catch {
        return null;
      }
    }
  })();
  const hasLicense = !!licenseOrder;

  // Composer name for filenames inside zips — the cue-sheet name (next to the
  // PRO fields) when set, else the public pseudonym. Best-effort.
  const composerName = await (async () => {
    if (!track?.composer_id) return "";
    try {
      const c = await ctx.env.DB.prepare(
        `SELECT cue_name, display_name FROM composers WHERE id = ?1`,
      )
        .bind(track.composer_id)
        .first<{ cue_name: string | null; display_name: string | null }>();
      return (c?.cue_name || c?.display_name || "").trim();
    } catch {
      try {
        const c = await ctx.env.DB.prepare(`SELECT display_name FROM composers WHERE id = ?1`)
          .bind(track.composer_id)
          .first<{ display_name: string | null }>();
        return (c?.display_name || "").trim();
      } catch {
        return "";
      }
    }
  })();

  const trackCode = slug.match(/^(\d+)/)?.[1] ?? "";

  // "tvmusicstore.com_1685_Composer Name_Title (30sec).wav" — used for every
  // audio file we put INSIDE a zip, whatever the master was originally called.
  const usedZipNames = new Set<string>();
  const niceZipEntryName = (originalName: string, fallbackExt = ".wav"): string => {
    const extMatch = originalName.match(/\.[a-z0-9]+$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : fallbackExt;
    const base = originalName.slice(0, originalName.length - (extMatch ? extMatch[0].length : 0));
    const suffix = cleanVersionSuffix(base, track?.title ?? "");
    const stem =
      ["tvmusicstore.com", trackCode, sanitizeFilename(composerName), sanitizeFilename(tidyTitle(track?.title ?? slug))]
        .filter(Boolean)
        .join("_") + (suffix ? ` (${sanitizeFilename(suffix)})` : "");
    let name = stem + ext;
    for (let n = 2; usedZipNames.has(name); n++) name = `${stem} (${n})${ext}`;
    usedZipNames.add(name);
    return name;
  };

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
      // DISTINCT tracks, not raw downloads: the free limit is "3 tracks a
      // month", so re-downloading one you already took must never cost another
      // slot. The track being fetched right now is excluded from the count —
      // it is only blocked if it is a NEW track and 3 different ones are used.
      `SELECT COUNT(DISTINCT track_id) AS n FROM download_log
        WHERE user_id = ?1 AND format = 'mp3'
          AND plan_at_download != 'license'
          AND track_id != ?2
          AND created_at >= datetime('now', 'start of month')`,
    )
      .bind(user.id, track?.id ?? slug)
      .first<{ n: number }>();
    if ((used?.n ?? 0) >= FREE_MONTHLY_LIMIT) {
      return json(
        {
          error: `Free plan limit reached (${FREE_MONTHLY_LIMIT} tracks a month). Re-downloading a track you already took is always free.`,
          code: "limit",
        },
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
      zipEntries.push({ name: niceZipEntryName(m.name), size: m.size, crc: m.crc, body: obj.body });
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
          name: `LICENSE - ${sanitizeFilename(tidyTitle(track?.title ?? slug))}.pdf`,
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
    // "Include PDF License" on an MP3: deliver ONE zip with the MP3 + the
    // certificate instead of two separate downloads (owner request).
    if (
      format === "mp3" &&
      body?.includeLicense === true &&
      track &&
      (plan !== "free" || hasLicense)
    ) {
      try {
        const mp3 = new Uint8Array(await fileRes.arrayBuffer());
        const mp3Suffix = cleanVersionSuffix(body?.label ?? "", track.title);
        const entries: ZipEntrySpec[] = [
          {
            name: niceZipEntryName(
              `${track.title}${mp3Suffix ? ` (${mp3Suffix})` : ""}.mp3`,
              ".mp3",
            ),
            size: mp3.length,
            crc: crc32(mp3),
            body: mp3,
          },
        ];
        const licPath = licenseOrder
          ? `/api/license-pdf?order=${encodeURIComponent(licenseOrder.id)}`
          : `/api/license-pdf?slug=${encodeURIComponent(slug)}`;
        const licRes = await fetch(new URL(licPath, origin).toString(), {
          headers: { cookie: ctx.request.headers.get("cookie") ?? "" },
        });
        if (licRes.ok) {
          const pdf = new Uint8Array(await licRes.arrayBuffer());
          entries.push({
            name: `LICENSE - ${sanitizeFilename(tidyTitle(track.title))}.pdf`,
            size: pdf.length,
            crc: crc32(pdf),
            body: pdf,
          });
        }
        audioBody = streamZip(entries);
        contentType = "application/zip";
        isZip = true;
      } catch {
        return json({ error: "Could not build the zip", code: "nofile" }, 500);
      }
    } else {
      audioBody = fileRes.body;
    }
  }

  // Log AFTER the file is resolved so failed attempts don't burn the limit.
  // `quality` matters for money: MP3 128 is the free-tier format and earns the
  // composer nothing, so the revenue engine has to be able to tell it from 320.
  const logDownload = () =>
    ctx.env.DB.prepare(
      `INSERT INTO download_log (user_id, track_id, composer_id, plan_at_download, format, quality)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
      .bind(
        user.id,
        track?.id ?? slug,
        track?.composer_id ?? null,
        hasLicense ? "license" : plan,
        format,
        format === "mp3" ? quality : null,
      )
      .run();
  try {
    await logDownload();
  } catch {
    // Older DB without the column — add it once, then log.
    try {
      await ctx.env.DB.prepare(`ALTER TABLE download_log ADD COLUMN quality INTEGER`).run();
    } catch {
      // someone else added it in the meantime
    }
    await logDownload();
  }

  // Every track a PAID subscriber downloads gets its own licence code, minted
  // here so it can be listed (and re-downloaded as a PDF) straight away. The
  // code binds track + plan + period, so the admin can look it up and see both
  // which track it covers and which subscription period issued it.
  if (plan !== "free" && track?.id) {
    try {
      await getOrCreatePlanLicense(
        ctx.env,
        user.id,
        track.id,
        hasLicense ? "license" : plan,
        planPeriodEnd,
      );
    } catch {
      // never block a download over a certificate
    }
  }

  const rawTitle = body?.title ?? track?.title ?? slug;
  const title = sanitizeFilename(tidyTitle(rawTitle));
  const ext = isZip ? "zip" : format;
  // Strip the track title out of the version label so it isn't duplicated, then
  // prefix the site (tunetank-style): "tvmusicstore.com_Title (short version).mp3".
  const suffix = isZip ? "" : cleanVersionSuffix(body?.label ?? versionId, rawTitle);
  const stemsTag = format === "stems" ? " STEMS" : "";
  const base = (suffix ? `${title} (${sanitizeFilename(suffix)})` : title) + stemsTag;
  const filename = trackCode
    ? `tvmusicstore.com_${trackCode}_${base}.${ext}`
    : `tvmusicstore.com_${base}.${ext}`;

  return new Response(audioBody, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
};
