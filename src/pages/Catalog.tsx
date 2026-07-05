import { useEffect, useMemo, useRef, useState } from "react";
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
import { useCollections } from "@/hooks/useContent";
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

const PAGE_SIZE = 15;

/** 1 … around-current … last, with ellipses when there are many pages. */
const pageNumbers = (current: number, total: number): (number | "...")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) pages.push(p);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
};

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
  const [sort, setSort] = useState("Featured");
  const { activePlayer, isPlaying, progress, playedProgress, playVersion } = usePlayer();
  const { tracks, isLoading } = useTracks();
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const filteredTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const result = tracks.filter((track) => {
      const matchesCollection = !activeCollection || track.collectionIds.includes(activeCollection.id);
      const matchesCategory = !categoryParam || track.category === categoryParam;
      const matchesUseCase =
        filters.useCase === "All" || splitFilterValues(track.useCase).some((item) => matchesOption(item, filters.useCase));
      const matchesGenre = filters.genre === "All" || matchesOption(track.genre, filters.genre);
      const matchesMood = filters.mood === "All" || matchesOption(track.mood, filters.mood);
      const matchesQuery =
        !normalizedQuery ||
        [track.title, track.artist, track.genre, track.mood, track.useCase, track.description, ...track.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCollection && matchesCategory && matchesUseCase && matchesGenre && matchesMood && matchesQuery;
    });

    if (sort === "New") return [...result].reverse();
    if (sort === "Popular") return [...result].sort((a, b) => b.bpm - a.bpm);
    return result;
  }, [tracks, activeCollection, categoryParam, filters, query, sort]);

  // Pagination: filters/search/sort always run over the FULL catalog above,
  // then we slice the current page — so a checkbox never "loses" tracks.
  const totalPages = Math.max(1, Math.ceil(filteredTracks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedTracks = filteredTracks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Any change of filters/search/sort returns the user to page 1.
  useEffect(() => {
    setPage(1);
  }, [filters, query, sort, activeCollectionId, categoryParam]);

  const goToPage = (next: number) => {
    setPage(Math.max(1, Math.min(totalPages, next)));
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
                  key={`${activeCollection?.id ?? "all-tracks"}-${safePage}`}
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

                    return (
                      <TrackRow
                        key={track.id}
                        activePlayer={activePlayer}
                        entranceDelay={0}
                        expanded={expanded}
                        globalIsPlaying={isPlaying}
                        globalProgress={progress}
                        index={index}
                        mainIsPlaying={mainIsPlaying}
                        onPlayVersion={playVersion}
                        onToggleExpanded={() => setExpandedTrackId(expanded ? null : track.id)}
                        playedProgress={playedProgress}
                        selectedVersion={mainVersion}
                        track={track}
                      />
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
            </div>

            {!isLoading && totalPages > 1 && (
              <nav className="mt-5 flex items-center justify-center gap-1.5" aria-label="Catalog pages">
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => goToPage(safePage - 1)}
                  aria-label="Previous page"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers(safePage, totalPages).map((p, i) =>
                  p === "..." ? (
                    <span key={`gap-${i}`} className="px-1.5 font-body text-sm text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goToPage(p)}
                      aria-current={p === safePage ? "page" : undefined}
                      className={`h-9 min-w-9 rounded-lg px-2.5 font-body text-sm font-semibold transition-colors ${
                        p === safePage
                          ? "bg-[#F4C430] text-background"
                          : "border border-border text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={safePage === totalPages}
                  onClick={() => goToPage(safePage + 1)}
                  aria-label="Next page"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}
          </section>
        </section>
      </main>
    </div>
  );
};

const sortOptions = ["Featured", "New", "Popular"];

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
      Explore our entire library of premium tracks for any project and mood.
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
        options={useCaseOptions}
        value={filters.useCase}
        onChange={(value) => setFilter("useCase", value)}
        defaultOpen
      />
      <FilterGroup
        label="Genre"
        options={genreOptions}
        value={filters.genre}
        onChange={(value) => setFilter("genre", value)}
      />
      <FilterGroup
        label="Mood"
        options={moodOptions}
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
