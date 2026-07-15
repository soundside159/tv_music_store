import { useCallback, useEffect, useState } from "react";
import type { CatalogTrack, TrackCategory, TrackVersion } from "@/data/catalogTracks";

type ApiVersion = { version_id: string; label: string; duration: string | null; preview_src: string };
type ApiTrack = {
  id: string;
  slug: string;
  title: string;
  category: string;
  genre: string | null;
  mood: string | null;
  use_case: string | null;
  bpm: number | null;
  duration: string | null;
  description: string | null;
  tags: string[];
  versions: ApiVersion[];
  collection_ids?: string[];
  category_ids?: string[];
  cover?: string | null;
  cover_thumb?: string | null;
  code?: number | null;
  has_stems?: number;
  import_no?: string | null;
  created_at?: string | null;
  downloads?: number;
  status?: string;
  moderation_status?: string;
  /** Composer pseudonym (composers.display_name) — null = house catalog. */
  artist?: string | null;
  /** composers.slug — target of the artist link under the track title. */
  artist_slug?: string | null;
};

const mapTrack = (t: ApiTrack): CatalogTrack => ({
  id: t.id,
  slug: t.slug,
  title: t.title,
  artist: t.artist || "TVMUSICSTORE",
  artistSlug: t.artist_slug || undefined,
  category: t.category as TrackCategory,
  genre: t.genre ?? "",
  mood: t.mood ?? "",
  useCase: t.use_case ?? "",
  styleOf: "",
  priceFrom: 0,
  bpm: t.bpm ?? 0,
  duration: t.duration ?? "",
  description: t.description ?? "",
  tags: t.tags ?? [],
  collectionIds: t.collection_ids ?? [],
  categoryIds: t.category_ids,
  cover: t.cover || undefined,
  coverThumb: t.cover_thumb || undefined,
  code: t.code ?? undefined,
  hasStems: !!t.has_stems,
  importNo: t.import_no ?? undefined,
  createdAt: t.created_at ?? undefined,
  downloads: t.downloads ?? 0,
  status: t.status ?? undefined,
  moderation: t.moderation_status ?? undefined,
  audioVersions: (t.versions ?? []).map((v) => ({
    id: v.version_id as TrackVersion,
    label: v.label,
    duration: v.duration ?? "",
    src: v.preview_src,
  })),
});

/**
 * Live catalog data from /api/tracks (Cloudflare D1). NO demo fallback (owner
 * request): an empty DB renders an honestly empty catalog, never mock tracks.
 * `drafts: true` (admin pages) also loads draft tracks — the server only honors
 * it for admin sessions.
 */
// Module-level cache (stale-while-revalidate, like useContent): SPA navigation
// renders the catalog INSTANTLY from the last answer while a background
// refetch (when stale) swaps fresh data in. Without it every page re-fetched
// the whole track list and every list replayed its loading dance.
const trackCache: Record<string, { list: CatalogTrack[]; at: number }> = {};
const trackInflight: Record<string, Promise<CatalogTrack[] | null> | undefined> = {};
const TRACKS_STALE_MS = 30_000;

export const useTracks = (opts?: { drafts?: boolean }) => {
  const wantDrafts = !!opts?.drafts;
  const key = wantDrafts ? "drafts" : "public";
  const cached = trackCache[key];
  const [tracks, setTracks] = useState<CatalogTrack[]>(cached ? cached.list : []);
  const [source, setSource] = useState<"mock" | "api">(cached ? "api" : "mock");
  // True until the FIRST answer for this cache key lands — pages show
  // skeletons meanwhile. A cached render is never "loading".
  const [isLoading, setIsLoading] = useState(!cached);

  const load = useCallback(
    (force = false) => {
      const hit = trackCache[key];
      if (!force && hit && Date.now() - hit.at < TRACKS_STALE_MS) {
        setTracks(hit.list);
        setSource("api");
        setIsLoading(false);
        return Promise.resolve();
      }
      if (!hit) setIsLoading(true); // stale data keeps rendering during a refresh
      const p = (trackInflight[key] ??= fetch(
        wantDrafts ? "/api/tracks?drafts=1" : "/api/tracks",
        { credentials: "include" },
      )
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data: { tracks?: ApiTrack[] }) => {
          const list = (data.tracks ?? []).map(mapTrack).filter((t) => t.audioVersions.length > 0);
          // Even an EMPTY answer counts as live data — admin tools stay enabled
          // and the storefront simply shows nothing instead of demo content.
          trackCache[key] = { list, at: Date.now() };
          return list;
        })
        .catch(() => null) // API unavailable — catalog stays empty (no mocks)
        .finally(() => {
          trackInflight[key] = undefined;
        }));
      return p.then((list) => {
        if (list) {
          setTracks(list);
          setSource("api");
        }
        setIsLoading(false);
      });
    },
    [wantDrafts, key],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // reload() (admin edits) always bypasses the cache.
  return { tracks, source, isLoading, reload: () => load(true) };
};
