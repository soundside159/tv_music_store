import { useEffect, useState } from "react";
import { musicCollections, type MusicCollection } from "@/data/musicCollections";
import { mockPlaylists } from "@/mocks";
import type { CatalogTrack } from "@/data/catalogTracks";
import { useTracks } from "@/hooks/useTracks";
import { defaultVocabularies, type Vocabularies } from "@/lib/tagOptions";

// Live storefront content from /api/content (what the owner edits in
// Admin -> Content), with graceful fallback to the bundled mock data.

interface ApiContentItem {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  image?: string;
  theme?: string;
  trackIds?: string[];
}

interface ApiContent {
  trending?: string[];
  categories?: { id: string; title: string }[];
  collections?: ApiContentItem[];
  playlists?: ApiContentItem[];
  vocabularies?: Partial<Vocabularies>;
}

let cache: ApiContent | null = null;
let inflight: Promise<ApiContent | null> | null = null;
// True once the FIRST /api/content attempt finished (ok or not). Pages use it
// to show skeletons instead of flashing mock data / "not found".
let settled = false;
// Stale-while-revalidate: the cache renders instantly on SPA navigation, but
// if it's older than this, a background refetch swaps fresh data in — so admin
// edits (new vocab values, trending, playlists…) appear on the next page
// visit without a hard reload.
let fetchedAt = 0;
const STALE_MS = 30_000;
let revalidating = false;

const fetchContent = (): Promise<ApiContent | null> => {
  if (cache) {
    if (Date.now() - fetchedAt > STALE_MS && !revalidating) {
      revalidating = true;
      void refreshContent().finally(() => {
        revalidating = false;
      });
    }
    return Promise.resolve(cache);
  }
  inflight ??= fetch("/api/content")
    .then((res) => (res.ok ? (res.json() as Promise<ApiContent>) : null))
    .then((data) => {
      cache = data;
      fetchedAt = Date.now();
      return data;
    })
    .catch(() => null)
    .finally(() => {
      settled = true;
      inflight = null;
    });
  return inflight;
};

/** False until the first /api/content response lands — render skeletons then. */
export const useContentReady = (): boolean => {
  const [ready, setReady] = useState(settled);
  useEffect(() => {
    if (settled) return;
    let cancelled = false;
    void fetchContent().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
};

// Admin inline editing (rename/delete/reorder on the public pages) changes the
// content — refetch it and notify every mounted hook AFTER the new data lands
// (stale-while-revalidate: the old content keeps rendering meanwhile, so
// nothing flashes back to mock data). Await the promise before navigating to a
// just-created item so its page finds it.
const contentListeners = new Set<() => void>();

export const refreshContent = (): Promise<void> =>
  fetch("/api/content")
    .then((res) => (res.ok ? (res.json() as Promise<ApiContent>) : null))
    .then((data) => {
      if (data) {
        cache = data;
        fetchedAt = Date.now();
      }
    })
    .catch(() => {
      // network hiccup — keep showing the stale content
    })
    .then(() => {
      settled = true;
      contentListeners.forEach((l) => l());
    });

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
    const apply = () => {
      void fetchContent().then((data) => {
        if (cancelled || !data?.categories?.length) return;
        setList(data.categories);
      });
    };
    apply();
    contentListeners.add(apply);
    return () => {
      cancelled = true;
      contentListeners.delete(apply);
    };
  }, []);
  return list;
};

/**
 * Live Use Case / Genre / Mood vocabularies (admin-editable via Admin ->
 * Vocabulary). Falls back to the bundled defaults until the API responds or if
 * a list is empty.
 */
export const useVocabularies = (): Vocabularies => {
  const [v, setV] = useState<Vocabularies>(defaultVocabularies);
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      void fetchContent().then((data) => {
        if (cancelled || !data?.vocabularies) return;
        const dv = data.vocabularies;
        setV({
          useCase: dv.useCase?.length ? dv.useCase : defaultVocabularies.useCase,
          genre: dv.genre?.length ? dv.genre : defaultVocabularies.genre,
          mood: dv.mood?.length ? dv.mood : defaultVocabularies.mood,
        });
      });
    };
    apply();
    contentListeners.add(apply);
    return () => {
      cancelled = true;
      contentListeners.delete(apply);
    };
  }, []);
  return v;
};

const mapCollections = (data: ApiContent): MusicCollection[] | null =>
  data.collections?.length
    ? data.collections.map((c) => ({
        id: c.id,
        title: c.title,
        shortTitle: c.shortTitle || c.title,
        eyebrow: "Collection",
        description: c.description ?? "",
        trackCount: c.trackIds?.length ?? 0,
        image: c.image || "/images/collections/orchestral.jpg",
      }))
    : null;

/** Collections for the catalog strip / collections pages (live, mock fallback). */
export const useCollections = (): MusicCollection[] => {
  // Start from the module cache when it's already there (SPA navigation) so
  // live data renders on the very first frame instead of flashing mocks.
  const [list, setList] = useState<MusicCollection[]>(
    () => (cache && mapCollections(cache)) || musicCollections,
  );
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      void fetchContent().then((data) => {
        if (cancelled || !data) return;
        const mapped = mapCollections(data);
        if (mapped) setList(mapped);
      });
    };
    apply();
    contentListeners.add(apply);
    return () => {
      cancelled = true;
      contentListeners.delete(apply);
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
  /** Section on the /playlists page ("Featured", "Podcast"…); "" = ungrouped. */
  theme: string;
  trackIds: string[];
}

const mapPlaylists = (data: ApiContent): LivePlaylist[] | null =>
  data.playlists?.length
    ? data.playlists.map((p) => ({
        id: p.id,
        slug: p.id,
        title: p.title,
        description: p.description ?? "",
        image: p.image || "/images/collections/orchestral.jpg",
        theme: p.theme ?? "",
        trackIds: p.trackIds ?? [],
      }))
    : null;

/** Playlists for /playlists pages (live, mock fallback). */
export const usePlaylists = (): LivePlaylist[] => {
  // Start from the module cache when present — no mock flash on navigation.
  const [list, setList] = useState<LivePlaylist[] | null>(() =>
    cache ? mapPlaylists(cache) : null,
  );
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      void fetchContent().then((data) => {
        if (cancelled || !data) return;
        const mapped = mapPlaylists(data);
        if (mapped) setList(mapped);
      });
    };
    apply();
    contentListeners.add(apply);
    return () => {
      cancelled = true;
      contentListeners.delete(apply);
    };
  }, []);
  if (list) return list;
  return mockPlaylists.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description ?? "",
    image: p.image,
    theme: "",
    trackIds: p.trackIds,
  }));
};

/** Raw admin-picked trending/featured track ids (empty until content loads). */
export const useTrendingIds = (): string[] => {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      void fetchContent().then((data) => {
        if (!cancelled && data?.trending?.length) setIds(data.trending);
      });
    };
    apply();
    contentListeners.add(apply);
    return () => {
      cancelled = true;
      contentListeners.delete(apply);
    };
  }, []);
  return ids;
};

/** Homepage "Trending tracks": admin-picked order, fallback = first N tracks. */
export const useTrendingTracks = (limit = 8): CatalogTrack[] => {
  const { tracks } = useTracks();
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      void fetchContent().then((data) => {
        if (!cancelled && data?.trending?.length) setIds(data.trending);
      });
    };
    apply();
    contentListeners.add(apply);
    return () => {
      cancelled = true;
      contentListeners.delete(apply);
    };
  }, []);

  if (ids) {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const picked = ids.map((id) => byId.get(id)).filter((t): t is CatalogTrack => !!t);
    if (picked.length > 0) return picked.slice(0, limit);
  }
  return tracks.slice(0, limit);
};
