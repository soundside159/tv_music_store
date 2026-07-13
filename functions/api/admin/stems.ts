import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";
import { parseManifest } from "../_zipStream";

// GET /api/admin/stems?track=<trackId> — admin only.
// Lists the track's individual stem MASTER files (tracks.stems_manifest), so
// Admin -> Tracks Edit can show them under the versions expander and delete
// them one by one. Stems are stored as separate R2 objects now; the STEMS .zip
// is streamed at download time. Legacy tracks may still carry a pre-packed zip
// (tracks.r2_key_stems) — those report `legacyZip: true` and no file list.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }

  const trackId = new URL(ctx.request.url).searchParams.get("track");
  if (!trackId) return json({ error: "track required" }, 400);

  const row = await (async () => {
    try {
      return await ctx.env.DB.prepare(
        `SELECT has_stems, r2_key_stems, stems_manifest, wav_manifest FROM tracks WHERE id = ?1`,
      )
        .bind(trackId)
        .first<{
          has_stems: number;
          r2_key_stems: string | null;
          stems_manifest: string | null;
          wav_manifest: string | null;
        }>();
    } catch {
      return null; // legacy DB without the columns
    }
  })();
  if (!row) return json({ error: "Track not found" }, 404);

  const manifest = parseManifest(row.stems_manifest) ?? [];
  // The WAV masters ride along so the editor can say "this file is already on
  // the track" before it spends minutes encoding and uploading a duplicate.
  const masters = parseManifest(row.wav_manifest) ?? [];
  return json({
    hasStems: !!row.has_stems,
    legacyZip: manifest.length === 0 && !!row.r2_key_stems,
    stems: manifest.map((e) => ({ key: e.key, name: e.name, size: e.size })),
    masters: masters.map((e) => ({ key: e.key, name: e.name, size: e.size })),
  });
};
