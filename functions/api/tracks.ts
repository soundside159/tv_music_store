import { json, type Ctx } from "./_utils";

interface TrackRow {
  id: string;
  slug: string;
  title: string;
  composer_id: string | null;
  category: string;
  genre: string | null;
  mood: string | null;
  use_case: string | null;
  bpm: number | null;
  duration: string | null;
  description: string | null;
  tags: string | null;
  cover: string | null;
  cover_thumb: string | null;
  has_stems: number;
}

interface VersionRow {
  track_id: string;
  version_id: string;
  label: string;
  duration: string | null;
  preview_src: string;
}

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  // `cover` / `cover_thumb` are added lazily by the admin editor; older DBs may
  // not have them yet, so degrade gracefully in two steps.
  const WHERE = `WHERE status = 'published' AND moderation_status = 'approved' ORDER BY created_at DESC`;
  let tracks: { results: TrackRow[] };
  try {
    tracks = await ctx.env.DB.prepare(
      `SELECT id, slug, title, composer_id, category, genre, mood, use_case, bpm, duration, description, tags, cover, cover_thumb, has_stems
         FROM tracks ${WHERE}`,
    ).all<TrackRow>();
  } catch {
    try {
      const withCover = await ctx.env.DB.prepare(
        `SELECT id, slug, title, composer_id, category, genre, mood, use_case, bpm, duration, description, tags, cover, has_stems
           FROM tracks ${WHERE}`,
      ).all<Omit<TrackRow, "cover_thumb">>();
      tracks = { results: withCover.results.map((t) => ({ ...t, cover_thumb: null })) };
    } catch {
      const legacy = await ctx.env.DB.prepare(
        `SELECT id, slug, title, composer_id, category, genre, mood, use_case, bpm, duration, description, tags, has_stems
           FROM tracks ${WHERE}`,
      ).all<Omit<TrackRow, "cover" | "cover_thumb">>();
      tracks = { results: legacy.results.map((t) => ({ ...t, cover: null, cover_thumb: null })) };
    }
  }

  const versions = await ctx.env.DB.prepare(
    `SELECT track_id, version_id, label, duration, preview_src
       FROM track_versions ORDER BY sort ASC`,
  ).all<VersionRow>();

  const byTrack = new Map<string, VersionRow[]>();
  for (const v of versions.results) {
    const list = byTrack.get(v.track_id) ?? [];
    list.push(v);
    byTrack.set(v.track_id, list);
  }

  const collectionRows = await ctx.env.DB.prepare(
    `SELECT collection_id, track_id FROM collection_tracks`,
  ).all<{ collection_id: string; track_id: string }>();
  const collectionsByTrack = new Map<string, string[]>();
  for (const c of collectionRows.results) {
    const list = collectionsByTrack.get(c.track_id) ?? [];
    list.push(c.collection_id);
    collectionsByTrack.set(c.track_id, list);
  }

  // Category membership (admin-curated). Before the admin editor creates the
  // table, fall back to the legacy tracks.category column per track.
  const categoriesByTrack = new Map<string, string[]>();
  let categoryTableExists = true;
  try {
    const catRows = await ctx.env.DB.prepare(
      `SELECT category_id, track_id FROM category_tracks`,
    ).all<{ category_id: string; track_id: string }>();
    for (const c of catRows.results) {
      const list = categoriesByTrack.get(c.track_id) ?? [];
      list.push(c.category_id);
      categoriesByTrack.set(c.track_id, list);
    }
  } catch {
    categoryTableExists = false;
  }

  return json({
    tracks: tracks.results.map((t) => ({
      ...t,
      tags: t.tags ? (JSON.parse(t.tags) as string[]) : [],
      versions: byTrack.get(t.id) ?? [],
      collection_ids: collectionsByTrack.get(t.id) ?? [],
      category_ids: categoryTableExists ? categoriesByTrack.get(t.id) ?? [] : [t.category],
    })),
  });
};
