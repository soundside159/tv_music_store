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
export const useTracks = (opts?: { drafts?: boolean }) => {
  const wantDrafts = !!opts?.drafts;
  const [tracks, setTracks] = useState<CatalogTrack[]>([]);
  const [source, setSource] = useState<"mock" | "api">("mock");
  // True until the API answers (or fails) — lets pages show skeletons instead
  // of flashing empty/placeholder rows that then get replaced by live rows.
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    setIsLoading(true);
    return fetch(wantDrafts ? "/api/tracks?drafts=1" : "/api/tracks", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { tracks?: ApiTrack[] }) => {
        const list = (data.tracks ?? []).map(mapTrack).filter((t) => t.audioVersions.length > 0);
        // Even an EMPTY answer counts as live data — admin tools stay enabled
        // and the storefront simply shows nothing instead of demo content.
        setTracks(list);
        setSource("api");
      })
      .catch(() => {
        // API unavailable — catalog stays empty (no mock data on the site)
      })
      .finally(() => setIsLoading(false));
  }, [wantDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  return { tracks, source, isLoading, reload: load };
};
