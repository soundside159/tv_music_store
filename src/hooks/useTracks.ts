import { useEffect, useState } from "react";
import { catalogTracks } from "@/data/catalogTracks";
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
};

const mapTrack = (t: ApiTrack): CatalogTrack => ({
  id: t.id,
  slug: t.slug,
  title: t.title,
  artist: "TVMUSICSTORE",
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
  audioVersions: (t.versions ?? []).map((v) => ({
    id: v.version_id as TrackVersion,
    label: v.label,
    duration: v.duration ?? "",
    src: v.preview_src,
  })),
});

/**
 * Live catalog data from /api/tracks (Cloudflare D1), with a safe fallback to the
 * bundled mock data when the API is unavailable or the DB has no tracks yet.
 */
export const useTracks = () => {
  const [tracks, setTracks] = useState<CatalogTrack[]>(catalogTracks);
  const [source, setSource] = useState<"mock" | "api">("mock");
  // True until the API answers (or fails) — lets pages show skeletons instead
  // of flashing mock rows that then get replaced by live rows.
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tracks", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { tracks?: ApiTrack[] }) => {
        if (cancelled) return;
        const list = (data.tracks ?? []).map(mapTrack).filter((t) => t.audioVersions.length > 0);
        if (list.length > 0) {
          setTracks(list);
          setSource("api");
        }
      })
      .catch(() => {
        // API unavailable / DB empty -> keep mock fallback
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tracks, source, isLoading };
};
