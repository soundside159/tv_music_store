import type { CatalogTrack } from "@/data/catalogTracks";

// Discovery engine: relevance search + the "related tracks" tail.
//
// WHY: the catalog used to treat search as a yes/no substring test (a track
// whose EXTRA TAG is "ukulele" ranked exactly like one that merely mentions the
// word in its description), and a facet filter as a hard AND (click "Social" ->
// 5 tracks, dead end). Both are handled here instead:
//
//   searchScore()   — ranks a hit: tag/use case/genre/mood > title > artist >
//                     description. Every word of the query must match SOMEWHERE
//                     (AND), so results stay precise; the score only orders them.
//   relatedTracks() — the funnel. Takes the tracks that DID match, learns which
//                     other facets/tags they share ("Social" tracks are often
//                     also Uplifting / Corporate / Indie), and ranks the rest of
//                     the catalog by how much of that profile they carry. The
//                     more shared tags, the higher — a web that fans out from the
//                     exact matches instead of ending at them.
//
// The relations are DERIVED from the catalogue itself (co-occurrence), so no tag
// graph has to be maintained by hand; it improves on its own as tracks are added.

const norm = (value: string) => value.toLowerCase().trim();

// ---------------------------------------------------------------------------
// Discover pages (/discover/moods/happy …) — the SEO half of the same tags.
// ---------------------------------------------------------------------------

/** The three tag families and the CatalogTrack column each one lives in. */
export const DISCOVER_GROUPS = {
  themes: "useCase",
  genres: "genre",
  moods: "mood",
} as const;

export type DiscoverGroup = keyof typeof DISCOVER_GROUPS;
export type TagFacet = (typeof DISCOVER_GROUPS)[DiscoverGroup];

const GROUP_OF_FACET: Record<TagFacet, DiscoverGroup> = {
  useCase: "themes",
  genre: "genres",
  mood: "moods",
};

export const isDiscoverGroup = (value: string | undefined): value is DiscoverGroup =>
  !!value && value in DISCOVER_GROUPS;

/** "Crime & Thriller" -> "crime-and-thriller" (the public URL segment). */
export const tagSlug = (value: string): string =>
  norm(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Where a tag pill under a track points: /discover/<group>/<tag>. */
export const discoverPath = (facet: TagFacet, value: string): string =>
  `/discover/${GROUP_OF_FACET[facet]}/${tagSlug(value)}`;

/** All values of a facet that actually occur in the catalogue. */
export const facetValuesInCatalog = (tracks: CatalogTrack[], facet: TagFacet): string[] => {
  const seen = new Map<string, string>();
  for (const track of tracks) {
    for (const value of splitValues(track[facet] ?? "")) {
      if (!seen.has(norm(value))) seen.set(norm(value), value);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};

/** Every track carrying `value` in `facet` (slug-compared, so URL-safe). */
export const tracksWithTag = (
  tracks: CatalogTrack[],
  facet: TagFacet,
  slug: string,
): CatalogTrack[] =>
  tracks.filter((track) =>
    splitValues(track[facet] ?? "").some((value) => tagSlug(value) === slug),
  );

/** Facet columns hold several values separated by "/" ("Drama / Action"). */
const splitValues = (value: string) =>
  (value || "").split("/").map((item) => item.trim()).filter(Boolean);

/** Every searchable "label" of a track, by facet. */
const facetsOf = (track: CatalogTrack) => ({
  useCase: splitValues(track.useCase),
  genre: splitValues(track.genre),
  mood: splitValues(track.mood),
  tags: (track.tags ?? []).filter(Boolean),
});

// A label wins over the title, the title over the artist, the artist over prose.
const LABEL_EXACT = 12;
const LABEL_PREFIX = 8;
const LABEL_PART = 5;
const TITLE_WORD = 7;
const TITLE_PART = 4;
const ARTIST = 3;
const DESCRIPTION = 1;

const scoreLabel = (label: string, token: string): number => {
  const value = norm(label);
  if (!value) return 0;
  if (value === token) return LABEL_EXACT;
  // Word-start match ("uku" -> "ukulele", "corp" -> "corporate ballad").
  if (value.split(/[\s/&,-]+/).some((word) => word.startsWith(token))) return LABEL_PREFIX;
  if (value.includes(token)) return LABEL_PART;
  return 0;
};

/**
 * Relevance of one track for a search query. 0 = not a hit (the track is then
 * filtered out — every word must appear somewhere, exactly like a search engine
 * treats multiple words as AND).
 */
export const searchScore = (track: CatalogTrack, query: string): number => {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  const { useCase, genre, mood, tags } = facetsOf(track);
  const labels = [...tags, ...useCase, ...genre, ...mood];
  const title = norm(track.title);
  const artist = norm(track.artist ?? "");
  const description = norm(track.description ?? "");

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const label of labels) best = Math.max(best, scoreLabel(label, token));
    if (title === token) best = Math.max(best, LABEL_EXACT);
    else if (title.split(/\s+/).some((word) => word.startsWith(token))) best = Math.max(best, TITLE_WORD);
    else if (title.includes(token)) best = Math.max(best, TITLE_PART);
    if (best === 0 && artist.includes(token)) best = ARTIST;
    if (best === 0 && description.includes(token)) best = DESCRIPTION;
    // One unmatched word kills the hit — precision over noise.
    if (best === 0) return 0;
    total += best;
  }
  return total;
};

// How much a shared facet says about "these two tracks belong together".
const FACET_WEIGHT: Record<keyof ReturnType<typeof facetsOf>, number> = {
  useCase: 3,
  genre: 3,
  mood: 2,
  tags: 1,
};

/**
 * The tail below the exact results: tracks that are NOT in `exact` but carry the
 * facets/tags that the exact set has in common. Score = sum over each shared
 * label of (facet weight x how common that label is inside the exact set), so a
 * tag shared by all 5 matches pulls much harder than one seen once. Sorted by
 * score, so relevance fades gradually the further down the user scrolls.
 */
export const relatedTracks = (
  exact: CatalogTrack[],
  pool: CatalogTrack[],
  limit = 24,
): CatalogTrack[] => {
  if (exact.length === 0) return [];

  // Profile of the exact set: how often each label occurs in it.
  const profile = new Map<string, number>();
  for (const track of exact) {
    const facets = facetsOf(track);
    for (const facet of Object.keys(facets) as (keyof typeof facets)[]) {
      for (const label of facets[facet]) {
        const key = `${facet}:${norm(label)}`;
        profile.set(key, (profile.get(key) ?? 0) + 1);
      }
    }
  }

  const exactIds = new Set(exact.map((t) => t.id));
  const scored: { track: CatalogTrack; score: number }[] = [];
  for (const track of pool) {
    if (exactIds.has(track.id)) continue;
    const facets = facetsOf(track);
    let score = 0;
    for (const facet of Object.keys(facets) as (keyof typeof facets)[]) {
      for (const label of facets[facet]) {
        const shared = profile.get(`${facet}:${norm(label)}`);
        if (shared) score += FACET_WEIGHT[facet] * (shared / exact.length);
      }
    }
    if (score > 0) scored.push({ track, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.track);
};
