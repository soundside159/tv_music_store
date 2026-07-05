import { getVocabularies, json, type Ctx } from "./_utils";

// Public storefront content: collections, playlists and the homepage trending
// list — everything the owner edits in Admin -> Content.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const db = ctx.env.DB;

  const collections = await db
    .prepare(`SELECT id, title, short_title, description, image FROM collections ORDER BY sort`)
    .all<{ id: string; title: string; short_title: string | null; description: string | null; image: string | null }>();
  const playlists = await db
    .prepare(`SELECT id, title, description, image FROM playlists ORDER BY sort`)
    .all<{ id: string; title: string; description: string | null; image: string | null }>();
  const colTracks = await db
    .prepare(`SELECT collection_id, track_id FROM collection_tracks ORDER BY sort`)
    .all<{ collection_id: string; track_id: string }>();
  const plTracks = await db
    .prepare(`SELECT playlist_id, track_id FROM playlist_tracks ORDER BY sort`)
    .all<{ playlist_id: string; track_id: string }>();

  let trending: string[] = [];
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'trending_track_ids'`)
      .first<{ value: string }>();
    if (row) trending = JSON.parse(row.value) as string[];
  } catch {
    // site_config not created yet — no trending override
  }

  // Categories (homepage chips / catalog?category=...). Tables are created by
  // the admin editor; before that we return [] and the frontend keeps its
  // built-in defaults.
  let categories: { id: string; title: string }[] = [];
  try {
    const rows = await db
      .prepare(`SELECT id, title FROM categories ORDER BY sort`)
      .all<{ id: string; title: string }>();
    categories = rows.results;
  } catch {
    // categories table not created yet
  }

  const colMap: Record<string, string[]> = {};
  for (const r of colTracks.results) (colMap[r.collection_id] ??= []).push(r.track_id);
  const plMap: Record<string, string[]> = {};
  for (const r of plTracks.results) (plMap[r.playlist_id] ??= []).push(r.track_id);

  const vocabularies = await getVocabularies(db);

  return json({
    trending,
    categories,
    vocabularies,
    collections: collections.results.map((c) => ({
      id: c.id,
      title: c.title,
      shortTitle: c.short_title ?? c.title,
      description: c.description ?? "",
      image: c.image ?? "",
      trackIds: colMap[c.id] ?? [],
    })),
    playlists: playlists.results.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      image: p.image ?? "",
      trackIds: plMap[p.id] ?? [],
    })),
  });
};
