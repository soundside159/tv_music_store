import { useEffect, useState } from "react";
import { musicCollections, type MusicCollection } from "@/data/musicCollections";
import type { CatalogTrack } from "@/data/catalogTracks";
import { useTracks } from "@/hooks/useTracks";

// Live storefront content from /api/content (what the owner edits in
// Admin -> Content), with graceful fallback to the bundled mock data.

interface ApiContentItem {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  image?: string;
  trackIds?: string[];
}

interface ApiContent {
  trending?: string[];
  collections?: ApiContentItem[];
  playlists?: ApiContentItem[];
}

let cache: ApiContent | null = null;
let inflight: Promise<ApiContent | null> | null = null;

const fetchContent = (): Promise<ApiContent | null> => {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetch("/api/content")
    .then((res) => (res.ok ? (res.json() as Promise<ApiContent>) : null))
    .then((data) => {
      cache = data;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

/** Collections for the catalog strip / collections pages (live, mock fallback). */
export const useCollections = (): MusicCollection[] => {
  const [list, setList] = useState<MusicCollection[]>(musicCollections);
  useEffect(() => {
    let cancelled = false;
    void fetchContent().then((data) => {
      if (cancelled || !data?.collections?.length) return;
      setList(
        data.collections.map((c) => ({
          id: c.id,
          title: c.title,
          shortTitle: c.shortTitle || c.title,
          eyebrow: "Collection",
          description: c.description ?? "",
          trackCount: c.trackIds?.length ?? 0,
          image: c.image || "/images/collections/orchestral.jpg",
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return list;
};

/** Homepage "Trending tracks": admin-picked order, fallback = first N tracks. */
export const useTrendingTracks = (limit = 8): CatalogTrack[] => {
  const { tracks } = useTracks();
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchContent().then((data) => {
      if (!cancelled && data?.trending?.length) setIds(data.trending);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (ids) {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const picked = ids.map((id) => byId.get(id)).filter((t): t is CatalogTrack => !!t);
    if (picked.length > 0) return picked.slice(0, limit);
  }
  return tracks.slice(0, limit);
};
