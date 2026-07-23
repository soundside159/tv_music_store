import type { CatalogTrack } from "@/data/catalogTracks";

// Catalog "Recommended" ordering — the smart diverse mix from
// docs/CATALOG_SORTING.md:
//   1. Admin-featured (trending) tracks pinned first, shuffled among themselves.
//   2. The rest grouped by primary genre and dealt out round-robin so a big
//      single-genre batch spreads across the list instead of clumping.
//   3. Everything is seeded by the DATE, so the order is stable within a day
//      (pagination never jumps) and refreshes once a day.
// Runs client-side over the full track list Catalog already loads.

/** Deterministic PRNG (mulberry32) — same seed, same sequence. */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Small string hash (FNV-1a) for turning a date string into a seed. */
const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Today's seed (local date) — changes once a day. */
export const dailySeed = (): number => {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return hashString(`tvms-catalog-${key}`);
};

/** Fisher-Yates with a provided PRNG (returns a new array). */
const seededShuffle = <T,>(list: T[], rand: () => number): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Primary grouping key for the round-robin: first genre, then mood, else "other". */
const groupKey = (t: CatalogTrack): string => {
  const first = (v: string) => v.split("/")[0]?.trim().toLowerCase() ?? "";
  return first(t.genre) || first(t.mood) || "other";
};

/**
 * Rank map (track id -> position) for the Recommended order. Featured ids come
 * first (seed-shuffled among themselves); the rest are grouped by primary genre
 * and dealt one-per-group in rotation (groups and their contents seed-shuffled).
 */
export const buildRecommendedRank = (
  tracks: CatalogTrack[],
  featuredIds: string[],
  seed = dailySeed(),
): Map<string, number> => {
  const rand = mulberry32(seed);
  const featuredSet = new Set(featuredIds);
  const featured = tracks.filter((t) => featuredSet.has(t.id));
  const rest = tracks.filter((t) => !featuredSet.has(t.id));

  const groups = new Map<string, CatalogTrack[]>();
  for (const t of rest) {
    const key = groupKey(t);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const groupOrder = seededShuffle([...groups.keys()], rand);
  const shuffledGroups = new Map(
    groupOrder.map((key) => [key, seededShuffle(groups.get(key) ?? [], rand)]),
  );

  // Deal one track per group in rotation until every group is exhausted.
  const mixed: CatalogTrack[] = [];
  let row = 0;
  while (mixed.length < rest.length) {
    for (const key of groupOrder) {
      const list = shuffledGroups.get(key) ?? [];
      if (row < list.length) mixed.push(list[row]);
    }
    row += 1;
  }

  const ranked = [...seededShuffle(featured, rand), ...mixed];
  return new Map(ranked.map((t, i) => [t.id, i]));
};

/**
 * "New" ordering that respects each COMPOSER's own recency index (import_no —
 * bigger = newer). Composers write different amounts and use different number
 * ranges, so a global sort would bury one author under another. Instead we sort
 * each composer's tracks newest-first, then deal them out round-robin by rank:
 * every composer's newest track first, then every composer's 2nd-newest, etc.
 * (a "chess-board" interleave). The composer order within a row is seed-shuffled
 * so the very top stays fair and refreshes daily; pagination is stable within a
 * day. Tracks with no numeric index sink to the bottom (newest upload first).
 */
export const interleaveByComposerRecency = (
  list: CatalogTrack[],
  seed = dailySeed(),
): CatalogTrack[] => {
  const idx = (t: CatalogTrack): number | null => {
    const n = parseInt((t.importNo ?? "").trim(), 10);
    return Number.isFinite(n) ? n : null;
  };
  const groups = new Map<string, CatalogTrack[]>();
  const noIndex: CatalogTrack[] = [];
  for (const t of list) {
    if (idx(t) === null) {
      noIndex.push(t);
      continue;
    }
    const key = (t.artist ?? "").trim().toLowerCase() || "—";
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  for (const arr of groups.values()) arr.sort((a, b) => (idx(b) as number) - (idx(a) as number));

  const rand = mulberry32(seed);
  const order = seededShuffle([...groups.keys()], rand);
  const maxLen = order.reduce((m, k) => Math.max(m, groups.get(k)?.length ?? 0), 0);

  const out: CatalogTrack[] = [];
  for (let row = 0; row < maxLen; row += 1) {
    for (const key of order) {
      const arr = groups.get(key);
      if (arr && row < arr.length) out.push(arr[row]);
    }
  }
  noIndex.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return [...out, ...noIndex];
};

/** Sort helpers used by the Catalog page. `rank` = buildRecommendedRank output. */
export const sortTracks = (
  list: CatalogTrack[],
  mode: string,
  rank: Map<string, number>,
): CatalogTrack[] => {
  const byRank = (a: CatalogTrack, b: CatalogTrack) =>
    (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER);

  if (mode === "New") {
    // Newest per composer, interleaved (see interleaveByComposerRecency). Uses
    // the import_no index, not the upload date — bulk-uploaded old + new tracks
    // share an upload date, so the date told the wrong story.
    return interleaveByComposerRecency(list);
  }
  if (mode === "Popular") {
    // Real download counts; ties fall back to the diverse mix so a young
    // catalog doesn't look alphabetical. Anti-gaming smarter ranking = later.
    return [...list].sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0) || byRank(a, b));
  }
  // Recommended (default)
  return [...list].sort(byRank);
};
