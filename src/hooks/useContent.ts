import { useEffect, useState } from "react";
import { musicCollections, type MusicCollection } from "@/data/musicCollections";
import { mockPlaylists } from "@/mocks";
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
  categories?: { id: string; title: string }[];
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

export interface LiveCategory {
  id: string;
  title: string;
}

const defaultCategories: LiveCategory[] = [
  { id: "modern-score", title: "Modern Score" },
  { id: "thriller", title: "Thriller" },
  { id: "game-ost", title: "Game OST" },
  { id: "production", title: "Production" },
];

/** Homepage category chips (admin-curated; falls back to the 4 built-ins). */
export const useCategories = (): LiveCategory[] => {
  const [list, setList] = useState<LiveCategory[]>(defaultCategories);
  useEffect(() => {
    let cancelled = false;
    void fetchContent().then((data) => {
      if (cancelled || !data?.categories?.length) return;
      setList(data.categories);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return list;
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

export interface LivePlaylist {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  trackIds: string[];
}

/** Playlists for /playlists pages (live, mock fallback). */
export const usePlaylists = (): LivePlaylist[] => {
  const [list, setList] = useState<LivePlaylist[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchContent().then((data) => {
      if (cancelled || !data?.playlists?.length) return;
      setList(
        data.playlists.map((p) => ({
          id: p.id,
          slug: p.id,
          title: p.title,
          description: p.description ?? "",
          image: p.image || "/images/collections/orchestral.jpg",
          trackIds: p.trackIds ?? [],
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (list) return list;
  return mockPlaylists.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description ?? "",
    image: p.image,
    trackIds: p.trackIds,
  }));
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
