import { getLicensePrices, getVocabularies, json, type Ctx } from "./_utils";

// Public storefront content: collections, playlists and the homepage trending
// list — everything the owner edits in Admin -> Content.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const db = ctx.env.DB;

  const collections = await db
    .prepare(`SELECT id, title, short_title, description, image FROM collections ORDER BY sort`)
    .all<{ id: string; title: string; short_title: string | null; description: string | null; image: string | null }>();
  // `theme` groups the /playlists page into sections; older DBs may not have
  // the column yet (added lazily by the admin API) — degrade gracefully.
  const playlists = await (async () => {
    try {
      return await db
        .prepare(`SELECT id, title, description, image, theme FROM playlists ORDER BY sort`)
        .all<{ id: string; title: string; description: string | null; image: string | null; theme: string | null }>();
    } catch {
      const legacy = await db
        .prepare(`SELECT id, title, description, image FROM playlists ORDER BY sort`)
        .all<{ id: string; title: string; description: string | null; image: string | null }>();
      return { results: legacy.results.map((p) => ({ ...p, theme: null })) };
    }
  })();
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

  // Editor Picks — the owner's hand-picked playlists (homepage rail + the
  // pinned section on /playlists). An ordered id list in site_config.
  let editorPicks: string[] = [];
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'editor_picks_playlist_ids'`)
      .first<{ value: string }>();
    if (row) editorPicks = JSON.parse(row.value) as string[];
  } catch {
    // none picked yet
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

  // Guide publication dates (slug -> YYYY-MM-DD), edited in Admin -> Articles.
  // The storefront applies them over the built-in schedule, so an article can be
  // moved earlier or later without a deploy.
  let guideSchedule: Record<string, string> = {};
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'guide_schedule'`)
      .first<{ value: string }>();
    if (row) guideSchedule = JSON.parse(row.value) as Record<string, string>;
  } catch {
    // no override yet — the schedule baked into the bundle is used
  }

  // Composers (public artist pages): nick + "about" text the owner writes in
  // Admin -> Users. `bio` exists in the base schema, so no lazy ALTER needed.
  let composers: { id: string; slug: string; displayName: string; bio: string }[] = [];
  try {
    const rows = await db
      .prepare(`SELECT id, slug, display_name, bio FROM composers ORDER BY display_name`)
      .all<{ id: string; slug: string; display_name: string; bio: string | null }>();
    composers = rows.results.map((c) => ({
      id: c.id,
      slug: c.slug,
      displayName: c.display_name,
      bio: c.bio ?? "",
    }));
  } catch {
    // composers table missing — artist pages fall back to "not found"
  }

  const colMap: Record<string, string[]> = {};
  for (const r of colTracks.results) (colMap[r.collection_id] ??= []).push(r.track_id);
  const plMap: Record<string, string[]> = {};
  for (const r of plTracks.results) (plMap[r.playlist_id] ??= []).push(r.track_id);

  const vocabularies = await getVocabularies(db);
  const licensePrices = await getLicensePrices(db);

  return json({
    trending,
    editorPicks,
    categories,
    composers,
    guideSchedule,
    vocabularies,
    licensePrices,
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
      theme: p.theme ?? "",
      trackIds: plMap[p.id] ?? [],
    })),
  });
};
