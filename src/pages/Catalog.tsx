import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import cinemaHero from "@/assets/cinema-hero-wide.png";
import { Input } from "@/components/ui/input";
import { useTracks } from "@/hooks/useTracks";
import type { MusicCollection } from "@/data/musicCollections";
import { useCollections, useTrendingIds, useVocabularies } from "@/hooks/useContent";
import { buildRecommendedRank, sortTracks } from "@/lib/catalogSort";
import { relatedTracks, searchScore } from "@/lib/discovery";
import { TrackRow } from "@/components/TrackRowPlayer";
import { usePlayer } from "@/components/PlayerProvider";
import { genreOptions, moodOptions, useCaseOptions } from "@/lib/tagOptions";

type FilterValue = {
  genre: string;
  mood: string;
  useCase: string;
};

const splitFilterValues = (value: string) => value.split("/").map((item) => item.trim()).filter(Boolean);

const matchesOption = (value: string, option: string) => value.toLowerCase().includes(option.toLowerCase());

// Infinite scroll instead of numbered pages: the API hands over the whole
// (light) track list, but rows are MOUNTED in batches — and each mounted row
// fetches + decodes its preview MP3 to draw the waveform, which is the
// expensive part. 20 rows on arrival, 20 more whenever the sentinel below the
// list scrolls into view.
const PAGE_SIZE = 20;
const LOAD_MORE_STEP = 20;
/** How many "related" tracks may follow a narrow result set (see discovery.ts). */
const RELATED_LIMIT = 30;

const Catalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCollectionId = searchParams.get("collection");
  const musicCollections = useCollections();
  const activeCollection = musicCollections.find((collection) => collection.id === activeCollectionId) ?? null;
  const categoryParam = searchParams.get("category");
  const [query, setQuery] = useState(() => searchParams.get("search") ?? "");
  const [filters, setFilters] = useState<FilterValue>(() => {
    // Tag clicks arrive as ?usecase= / ?genre= / ?mood=; map them onto the
    // sidebar option if one matches, otherwise use the raw value (filtering
    // still works via matchesOption's includes()).
    const fromParam = (param: string | null, options: string[]) => {
      if (!param) return "All";
      return (
        options.find((o) => matchesOption(o, param) || matchesOption(param, o)) ?? param
      );
    };
    return {
      genre: fromParam(searchParams.get("genre"), genreOptions),
      mood: fromParam(searchParams.get("mood"), moodOptions),
      useCase: fromParam(searchParams.get("usecase"), useCaseOptions),
    };
  });
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [sort, setSort] = useState("Recommended");
  const { activePlayer, isPlaying, progress, playedProgress, playVersion } = usePlayer();
  const { tracks, isLoading } = useTracks();
  const trendingIds = useTrendingIds();
  // How many rows are currently mounted (grows as the user scrolls).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Daily-seeded diverse mix over the FULL catalog (featured pinned first,
  // genre round-robin for the rest) — stable within a day, see catalogSort.ts.
  const recommendedRank = useMemo(
    () => buildRecommendedRank(tracks, trendingIds),
    [tracks, trendingIds],
  );

  // EXACT matches: everything the user actually asked for (collection, category,
  // facet checkboxes, search words). Search is now RANKED, not just filtered —
  // see src/lib/discovery.ts.
  const exactTracks = useMemo(() => {
    const trimmedQuery = query.trim();

    const result = tracks.filter((track) => {
      const matchesCollection = !activeCollection || track.collectionIds.includes(activeCollection.id);
      // Admin-curated membership when present; legacy single category otherwise.
      const matchesCategory =
        !categoryParam ||
        (track.categoryIds && track.categoryIds.length > 0
          ? track.categoryIds.includes(categoryParam)
          : track.category === categoryParam);
      const matchesUseCase =
        filters.useCase === "All" || splitFilterValues(track.useCase).some((item) => matchesOption(item, filters.useCase));
      const matchesGenre = filters.genre === "All" || matchesOption(track.genre, filters.genre);
      const matchesMood = filters.mood === "All" || matchesOption(track.mood, filters.mood);
      const matchesQuery = !trimmedQuery || searchScore(track, trimmedQuery) > 0;

      return matchesCollection && matchesCategory && matchesUseCase && matchesGenre && matchesMood && matchesQuery;
    });

    // While searching, "Recommended" means "most relevant" — a track whose TAG is
    // the query outranks one that merely mentions the word in its description.
    // Picking New / Popular explicitly still wins.
    if (trimmedQuery && sort === "Recommended") {
      return [...result].sort(
        (a, b) =>
          searchScore(b, trimmedQuery) - searchScore(a, trimmedQuery) ||
          (recommendedRank.get(a.id) ?? 0) - (recommendedRank.get(b.id) ?? 0),
      );
    }
    return sortTracks(result, sort, recommendedRank);
  }, [tracks, activeCollection, categoryParam, filters, query, sort, recommendedRank]);

  // RELATED tail: when the request was narrow and returned few tracks, keep the
  // funnel going with tracks that share what those few have in common (see
  // relatedTracks()). Only for facet/search requests — a collection or category
  // page is a closed list by definition.
  const isNarrowRequest =
    !!query.trim() ||
    filters.useCase !== "All" ||
    filters.genre !== "All" ||
    filters.mood !== "All";
  const related = useMemo(() => {
    if (!isNarrowRequest || activeCollection || categoryParam) return [];
    if (exactTracks.length === 0 || exactTracks.length >= PAGE_SIZE) return [];
    return relatedTracks(exactTracks, tracks, RELATED_LIMIT);
  }, [isNarrowRequest, activeCollection, categoryParam, exactTracks, tracks]);

  // One continuous list: exact matches, then the related tail.
  const filteredTracks = useMemo(() => [...exactTracks, ...related], [exactTracks, related]);
  const exactCount = exactTracks.length;

  // Filters/search/sort always run over the FULL catalog above; only the number
  // of MOUNTED rows is limited.
  const pagedTracks = filteredTracks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTracks.length;

  // Any change of filters/search/sort/collection starts the list from the top.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters, query, sort, activeCollectionId, categoryParam]);

  // Load the next batch when the sentinel under the list comes into view
  // (200px early, so rows are ready before the user reaches them).
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((current) =>
            Math.min(current + LOAD_MORE_STEP, filteredTracks.length),
          );
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, filteredTracks.length]);

  const selectCollection = (collectionId: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (collectionId) nextParams.set("collection", collectionId);
    else nextParams.delete("collection");
    setSearchParams(nextParams);
    setExpandedTrackId(null);
  };

  const setFilter = (key: keyof FilterValue, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key] === value ? "All" : value,
    }));
  };

  const clearFilters = () => setFilters({ genre: "All", mood: "All", useCase: "All" });

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <Navigation />

      <main className="mx-auto w-full max-w-[92rem] px-4 pt-20 sm:px-6 min-[1800px]:max-w-7xl">
        <div className="animate-rise-in" style={{ animationDelay: "0.05s" }}>
          <CatalogBreadcrumb activeCollection={activeCollection} />
        </div>
        <div className="animate-rise-in" style={{ animationDelay: "0.14s" }}>
          <LibraryHero />
        </div>

        {/* ≥1800px: the content column takes the full home-width tunnel (centered on
            the screen) and the filter sidebar hangs to the LEFT of it, outside the
            tunnel — so the header never jumps between pages and track rows get the
            full tunnel width. Below 1800px there is no room for that, so the classic
            sidebar+content grid stays. */}
        <section className="relative mt-4 grid gap-5 lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[15.5rem_minmax(0,1fr)] min-[1800px]:grid-cols-1">
          <div
            className="animate-slide-in-left min-[1800px]:absolute min-[1800px]:bottom-0 min-[1800px]:right-full min-[1800px]:top-0 min-[1800px]:mr-6 min-[1800px]:w-[15.5rem]"
            style={{ animationDelay: "0.4s" }}
          >
            <FilterSidebar filters={filters} setFilter={setFilter} onClear={clearFilters} />
          </div>

          <section className="min-w-0">
            <div
              ref={listTopRef}
              className="animate-fade-in scroll-mt-24 rounded-lg border border-border/30 bg-card/25"
              style={{ animationDelay: "0.5s" }}
            >
              <div className="grid gap-3 border-b border-border/30 bg-background/20 px-4 py-3 md:grid-cols-[minmax(16rem,28rem)_1fr_auto] md:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      activeCollection
                        ? `Search tracks in ${activeCollection.shortTitle}...`
                        : "Search tracks, genres, moods"
                    }
                    className="h-10 rounded-full border-white/20 bg-background/50 pl-11 transition-colors focus-visible:border-[#F4C430]/70 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div />
                <div className="flex items-center gap-2 justify-self-start font-body text-sm text-muted-foreground md:justify-self-end">
                  <span>Sort by:</span>
                  <SortDropdown value={sort} onChange={setSort} />
                </div>
              </div>

              {isLoading && (
                <div aria-hidden="true">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 border-b border-border/30 px-4 py-3.5 last:border-b-0"
                    >
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-foreground/[0.06]" />
                      <div
                        className="h-9 flex-1 animate-pulse rounded-lg bg-foreground/[0.04]"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCollection?.id ?? "all-tracks"}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  {pagedTracks.map((track, index) => {
                    const mainVersion = track.audioVersions[0];
                    const expanded = expandedTrackId === track.id;
                    const mainIsPlaying =
                      activePlayer?.trackId === track.id && activePlayer.versionId === mainVersion.id && isPlaying;
                    // The row where the exact matches end and the related tail
                    // begins — a hairline caption so the filter stays honest
                    // ("these no longer carry the tag you ticked").
                    const startsRelated = index === exactCount && related.length > 0;

                    return (
                      <Fragment key={track.id}>
                      {startsRelated && (
                        <div className="flex items-center gap-3 border-b border-border/30 px-4 py-2.5">
                          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                            Related
                          </span>
                          <span className="h-px flex-1 bg-border/40" />
                        </div>
                      )}
                      <TrackRow
                        activePlayer={activePlayer}
                        entranceDelay={0}
                        expanded={expanded}
                        globalIsPlaying={isPlaying}
                        globalProgress={progress}
                        index={index}
                        mainIsPlaying={mainIsPlaying}
                        // Prev/next in the mini-player walk the FULL filtered
                        // list (not just this page) — that's what the user sees
                        // as "the catalog I'm listening to".
                        onPlayVersion={(t, v, seekTo) =>
                          playVersion(t, v, seekTo ?? null, filteredTracks)
                        }
                        onToggleExpanded={() => setExpandedTrackId(expanded ? null : track.id)}
                        playedProgress={playedProgress}
                        selectedVersion={mainVersion}
                        track={track}
                      />
                      </Fragment>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
              )}

              {!isLoading && filteredTracks.length === 0 && (
                <div className="px-4 py-12 text-center font-body text-sm text-muted-foreground">
                  No tracks found. Try another filter or search phrase.
                </div>
              )}

              {/* Infinite scroll: crossing this loads the next 20 rows. The two
                  pulsing placeholders are the only hint that more is coming. */}
              {!isLoading && hasMore && (
                <div ref={sentinelRef} aria-hidden="true">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 border-b border-border/30 px-4 py-3.5 last:border-b-0"
                    >
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-foreground/[0.06]" />
                      <div
                        className="h-9 flex-1 animate-pulse rounded-lg bg-foreground/[0.04]"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
};

const sortOptions = ["Recommended", "New", "Popular"];

const SortDropdown = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 font-semibold text-foreground transition-colors hover:text-[#F4C430]"
      >
        {value}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-2 w-32 overflow-hidden rounded-md border border-white/10 bg-card shadow-lg">
            {sortOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left font-body text-sm transition-colors hover:bg-white/5 ${
                  option === value ? "text-[#F4C430]" : "text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const CatalogBreadcrumb = ({ activeCollection }: { activeCollection: MusicCollection | null }) => (
  <nav className="flex flex-wrap items-center gap-2 font-body text-sm text-muted-foreground">
    <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-[#F4C430]">
      <Home className="h-3.5 w-3.5" />
      Home
    </Link>
    <span>/</span>
    <Link to="/catalog" className="transition-colors hover:text-[#F4C430]">
      Music Library
    </Link>
    <span>/</span>
    <span className="font-semibold text-foreground">{activeCollection?.title ?? "All Tracks"}</span>
  </nav>
);

const LibraryHero = () => (
  <section className="mt-4 lg:pl-[16.75rem] xl:pl-[17.75rem] min-[1800px]:pl-0">
    <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
      Discover
    </p>
    <h1 className="mt-2 font-display text-4xl font-bold leading-none tracking-tight text-white sm:text-5xl">
      <span className="text-[#F4C430]">Premium</span> Music Library
    </h1>
    <p className="mt-3 max-w-lg font-body text-sm leading-6 text-white/55">
      Explore our full catalog of original tracks for any project and mood.
    </p>
  </section>
);

const CollectionStrip = ({
  activeCollection,
  onSelectCollection,
}: {
  activeCollection: MusicCollection | null;
  onSelectCollection: (collectionId: string | null) => void;
}) => {
  const musicCollections = useCollections();
  const stripRef = useRef<HTMLDivElement | null>(null);

  const scrollCollections = (direction: -1 | 1) => {
    stripRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-white">Collections</h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onSelectCollection(null)}
            className="inline-flex items-center gap-1.5 font-body text-sm text-white/60 transition-colors hover:text-white"
          >
            View all collections
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollCollections(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
              aria-label="Previous collections"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollCollections(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
              aria-label="Next collections"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <div
          ref={stripRef}
          className="grid auto-cols-[11.25rem] grid-flow-col gap-5 overflow-x-auto pb-3 pl-6 pr-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {musicCollections.map((collection) => {
            const active = activeCollection?.id === collection.id;

            return (
              <div key={collection.id} className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => onSelectCollection(collection.id)}
                  style={{ transform: "skewX(-9deg)" }}
                  className={`group relative h-64 w-full overflow-hidden rounded-lg border bg-white/[0.04] text-left transition-[border-color,box-shadow] duration-300 ${
                    active
                      ? "border-white/20 shadow-[inset_0_0_16px_-8px_rgba(255,255,255,0)]"
                      : "border-white/15 shadow-[inset_0_0_16px_-8px_rgba(255,255,255,0.3)] hover:border-white/35"
                  }`}
                >
                  {collection.image && (
                    <img
                      src={collection.image}
                      alt=""
                      decoding="async"
                      onLoad={(event) => {
                        event.currentTarget.style.opacity = "1";
                      }}
                      style={{ transform: "skewX(9deg) scale(1.32) translateZ(0)", backfaceVisibility: "hidden", opacity: 0, transition: "opacity 0.5s ease" }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
                  <div
                    style={{ willChange: "opacity" }}
                    className={`pointer-events-none absolute inset-0 transition-opacity duration-300 delay-75 ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <div
                      className="absolute inset-0 rounded-lg border border-[#F4C430]/55"
                      style={{
                        maskImage: "linear-gradient(to bottom, #000 0%, #000 18%, transparent 58%)",
                        WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 18%, transparent 58%)",
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-lg border border-[#F4C430]/75"
                      style={{
                        maskImage: "radial-gradient(58% 55% at 50% 100%, #000 0%, #000 30%, transparent 68%)",
                        WebkitMaskImage: "radial-gradient(58% 55% at 50% 100%, #000 0%, #000 30%, transparent 68%)",
                      }}
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 h-2/3"
                      style={{ background: "radial-gradient(66% 62% at 50% 108%, rgba(244,196,48,0.42), rgba(244,196,48,0) 62%)" }}
                    />
                  </div>
                  <div style={{ transform: "skewX(9deg)" }} className="absolute inset-x-0 bottom-0 p-4">
                    <h3 className="font-display text-lg font-semibold leading-tight text-white">{collection.shortTitle}</h3>
                    <p className="mt-1 font-body text-xs text-white/60">{collection.trackCount} tracks</p>
                    <div className="mt-2.5">
                      <span className="block h-px w-[70px] bg-gradient-to-r from-[#F4C430]/80 to-[#F4C430]/0" />
                    </div>
                  </div>
                </button>
                <CollectionLamp active={active} />
              </div>
            );
          })}
        </div>

        <div className="mt-1 h-px w-full bg-white/5" />
      </div>
    </section>
  );
};

const CollectionLamp = ({ active }: { active: boolean }) => (
  <div className="mt-3 flex -translate-x-5 justify-center" aria-hidden="true">
    <span
      className={`h-2 w-2 rounded-full transition-all duration-300 ${
        active
          ? "bg-[#F4C430] shadow-[0_0_10px_3px_rgba(244,196,48,0.8)]"
          : "bg-white/30"
      }`}
    />
  </div>
);

const FilterSidebar = ({
  filters,
  setFilter,
  onClear,
}: {
  filters: FilterValue;
  setFilter: (key: keyof FilterValue, value: string) => void;
  onClear: () => void;
}) => {
  const vocab = useVocabularies();
  const hasActive = filters.useCase !== "All" || filters.genre !== "All" || filters.mood !== "All";

  return (
    <aside className="h-fit rounded-lg border border-border/30 bg-card/30 p-4 lg:sticky lg:top-24">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/30 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border/50">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <h2 className="font-body text-sm font-semibold uppercase tracking-[0.08em] text-foreground">Filters</h2>
        </div>
        {hasActive && (
          <button
            type="button"
            onClick={onClear}
            className="font-body text-xs text-muted-foreground transition-colors hover:text-[#F4C430]"
          >
            Clear all
          </button>
        )}
      </div>
      <FilterGroup
        label="Use Case"
        options={vocab.useCase}
        value={filters.useCase}
        onChange={(value) => setFilter("useCase", value)}
        defaultOpen
      />
      <FilterGroup
        label="Genre"
        options={vocab.genre}
        value={filters.genre}
        onChange={(value) => setFilter("genre", value)}
      />
      <FilterGroup
        label="Mood"
        options={vocab.mood}
        value={filters.mood}
        onChange={(value) => setFilter("mood", value)}
      />
    </aside>
  );
};

const FilterGroup = ({
  label,
  onChange,
  options,
  value,
  defaultOpen = false,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border/30 py-4 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between font-body text-xs font-semibold uppercase tracking-[0.12em] text-foreground"
      >
        {label}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {options.map((option) => {
            const active = value === option;

            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className="flex w-full items-center gap-2.5 text-left font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span
                  className={`h-3.5 w-3.5 rounded-[3px] border ${
                    active ? "border-[#F4C430] bg-[#F4C430]" : "border-border bg-transparent"
                  }`}
                />
                <span>{option}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Catalog;
