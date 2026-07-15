import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Home,
  Music2,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import cinemaHero from "@/assets/cinema-hero-wide.png";
import { Input } from "@/components/ui/input";
import { useTracks } from "@/hooks/useTracks";
import type { MusicCollection } from "@/data/musicCollections";
import type { CatalogTrack } from "@/data/catalogTracks";
import { useCollections, usePlaylists, useTrendingIds, useVocabularies } from "@/hooks/useContent";
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

/** What /api/ai-search sends back: catalog tags + playlist/collection ids that
 *  fit the described project, plus free keywords for title/tag matching. */
interface AiRoute {
  useCase: string[];
  genre: string[];
  mood: string[];
  playlistIds: string[];
  collectionIds: string[];
  keywords: string[];
}

/** Compact result card for the Playlists / Collections tabs of an AI search. */
const AiResultCard = ({ to, image, title, sub }: { to: string; image: string; title: string; sub: string }) => (
  <Link
    to={to}
    className="group flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 p-3 transition-colors hover:border-[#F4C430]/60"
  >
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-secondary">
      {image ? (
        <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Music2 className="h-4 w-4 text-muted-foreground/70" />
      )}
    </span>
    <span className="min-w-0">
      <span className="block truncate font-body text-sm font-medium text-foreground transition-colors group-hover:text-[#F4C430]">
        {title}
      </span>
      <span className="block truncate font-body text-xs text-muted-foreground">{sub}</span>
    </span>
  </Link>
);

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
  const [sort, setSort] = useState("Featured");

  // ---- AI Search ("describe your project") — see functions/api/ai-search.ts.
  // Its model is fixed server-side; the admin's image-model switcher in Tracks
  // Edit has no effect here.
  const [searchMode, setSearchMode] = useState<"text" | "ai">("text");
  const [aiQuery, setAiQuery] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRes, setAiRes] = useState<AiRoute | null>(null);
  const [aiTab, setAiTab] = useState<"tracks" | "playlists" | "collections">("tracks");
  const allPlaylists = usePlaylists();

  const runAiSearch = async () => {
    const q = aiQuery.trim();
    if (q.length < 3 || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const d = (await res.json()) as AiRoute & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Search failed");
      setAiRes(d);
      setAiTab("tracks");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setAiBusy(false);
    }
  };
  const clearAi = () => {
    setAiRes(null);
    setAiError(null);
    setAiTab("tracks");
  };
  const switchSearchMode = (m: "text" | "ai") => {
    setSearchMode(m);
    if (m === "text") clearAi();
    else setQuery("");
  };
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

    // AI relevance: +2 per matched tag (the router already picked the best
    // catalog values), +1 per keyword hit in the title/tags. 0 = filtered out.
    const aiScore = (track: CatalogTrack): number => {
      if (!aiRes) return 1;
      let score = 0;
      const facetHits = (raw: string, vals: string[]) =>
        splitFilterValues(raw).filter((v) => vals.some((x) => x.toLowerCase() === v.toLowerCase())).length;
      score += facetHits(track.useCase, aiRes.useCase) * 2;
      score += facetHits(track.genre, aiRes.genre) * 2;
      score += facetHits(track.mood, aiRes.mood) * 2;
      if (aiRes.keywords.length > 0) {
        const hay = `${track.title} ${track.tags.join(" ")}`.toLowerCase();
        for (const k of aiRes.keywords) if (hay.includes(k.toLowerCase())) score += 1;
      }
      return score;
    };

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
      const matchesAi = !aiRes || aiScore(track) > 0;

      return matchesCollection && matchesCategory && matchesUseCase && matchesGenre && matchesMood && matchesQuery && matchesAi;
    });

    // AI search on + default sort: most relevant first (score, then the mix).
    if (aiRes && sort === "Featured") {
      return [...result].sort(
        (a, b) => aiScore(b) - aiScore(a) || (recommendedRank.get(a.id) ?? 0) - (recommendedRank.get(b.id) ?? 0),
      );
    }

    // While searching, "Featured" (the default) means "most relevant" — a track
    // whose TAG is the query outranks one that merely mentions the word in its
    // description. Picking New / Popular explicitly still wins.
    if (trimmedQuery && sort === "Featured") {
      return [...result].sort(
        (a, b) =>
          searchScore(b, trimmedQuery) - searchScore(a, trimmedQuery) ||
          (recommendedRank.get(a.id) ?? 0) - (recommendedRank.get(b.id) ?? 0),
      );
    }
    return sortTracks(result, sort, recommendedRank);
  }, [tracks, activeCollection, categoryParam, filters, query, sort, recommendedRank, aiRes]);

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

  const aiPlaylists = aiRes ? allPlaylists.filter((pl) => aiRes.playlistIds.includes(pl.id)) : [];
  const aiCollections = aiRes ? musicCollections.filter((c) => aiRes.collectionIds.includes(c.id)) : [];
  /** Playlists / Collections tabs replace the track list below the toolbar. */
  const showTrackList = !aiRes || aiTab === "tracks";

  // Any change of filters/search/sort/collection starts the list from the top.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters, query, sort, activeCollectionId, categoryParam, aiRes]);

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
        {/* The sidebar column is sized so the three filter tab pills (Use Case /
            Genre / Mood) sit on ONE row — 14.5/15.5rem wrapped Mood onto a
            second line. */}
        <section className="relative mt-4 grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_minmax(0,1fr)] min-[1800px]:grid-cols-1">
          <div
            className="animate-slide-in-left min-[1800px]:absolute min-[1800px]:bottom-0 min-[1800px]:right-full min-[1800px]:top-0 min-[1800px]:mr-6 min-[1800px]:w-[17.5rem]"
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
              <div
                className={`grid gap-3 border-b border-border/30 bg-background/20 px-4 py-3 transition-[grid-template-columns] duration-500 md:items-center ${
                  searchMode === "ai"
                    ? "md:grid-cols-[minmax(16rem,36rem)_1fr_auto]"
                    : "md:grid-cols-[minmax(16rem,28rem)_1fr_auto]"
                }`}
              >
                <div className="min-w-0">
                  {/* ONE search box for both modes — the Search / AI Search
                      switch lives INSIDE it (owner request). Flipping to AI
                      unfolds the pill: wider, plus a second row with the hint
                      and the Find button — a single smooth transition, like
                      the header search growing on focus. */}
                  <div
                    className={`overflow-hidden border bg-background/50 transition-all duration-500 ease-out ${
                      searchMode === "ai"
                        ? "rounded-2xl border-[#F4C430]/40"
                        : "rounded-full border-white/20"
                    }`}
                  >
                    <div className="flex h-10 items-center gap-2 pl-4 pr-1.5">
                      {searchMode === "ai" ? (
                        <Sparkles className="h-4 w-4 shrink-0 text-[#F4C430]/80" />
                      ) : (
                        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <input
                        value={searchMode === "ai" ? aiQuery : query}
                        onChange={(e) =>
                          searchMode === "ai" ? setAiQuery(e.target.value) : setQuery(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && searchMode === "ai") {
                            e.preventDefault();
                            void runAiSearch();
                          }
                        }}
                        placeholder={
                          searchMode === "ai"
                            ? "Describe your project — mood, story, where it plays…"
                            : activeCollection
                              ? `Search tracks in ${activeCollection.shortTitle}...`
                              : "Search tracks, genres, moods"
                        }
                        className="h-10 min-w-0 flex-1 bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                      <div className="flex shrink-0 gap-0.5 rounded-full border border-border/60 bg-card/70 p-0.5">
                        {(
                          [
                            ["text", "Search"],
                            ["ai", "AI Search"],
                          ] as const
                        ).map(([m, label]) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => switchSearchMode(m)}
                            aria-pressed={searchMode === m}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-body text-[11px] font-semibold transition-all duration-200 ${
                              searchMode === m
                                ? "bg-[#F4C430] text-background"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {m === "ai" && <Sparkles className="h-3 w-3" />}
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Second row — unfolds in AI mode only. */}
                    <div
                      className={`transition-all duration-500 ease-out ${
                        searchMode === "ai" ? "max-h-12 opacity-100" : "max-h-0 opacity-0"
                      }`}
                      aria-hidden={searchMode !== "ai"}
                    >
                      <div className="flex items-center gap-3 border-t border-border/40 py-2 pl-4 pr-1.5">
                        <p className="min-w-0 flex-1 truncate font-body text-[11px] text-muted-foreground">
                          Tip: mention the mood, the story and where the video will play.
                        </p>
                        <button
                          type="button"
                          onClick={() => void runAiSearch()}
                          disabled={aiBusy || aiQuery.trim().length < 3}
                          tabIndex={searchMode === "ai" ? 0 : -1}
                          className="shrink-0 rounded-full bg-[#F4C430] px-4 py-1 font-body text-xs font-semibold text-background transition-opacity disabled:opacity-50"
                        >
                          {aiBusy ? "Thinking…" : "Find"}
                        </button>
                      </div>
                    </div>
                  </div>
                  {aiError && <p className="mt-1.5 font-body text-xs text-red-400">{aiError}</p>}
                </div>
                <div />
                <div className="flex items-center gap-2 justify-self-start font-body text-sm text-muted-foreground md:justify-self-end">
                  <span>Sort by:</span>
                  <SortDropdown value={sort} onChange={setSort} />
                </div>
              </div>

              {/* AI result: tabs (tracks / playlists / collections), the tags
                  the router matched, and a Clear switch back to plain browsing. */}
              {aiRes && (
                <div className="flex flex-wrap items-center gap-2 border-b border-border/30 bg-background/10 px-4 py-2.5">
                  <div className="flex gap-1 rounded-full border border-border/70 bg-card/60 p-1">
                    {(
                      [
                        ["tracks", `All Tracks · ${filteredTracks.length}`],
                        ["playlists", `Playlists · ${aiPlaylists.length}`],
                        ["collections", `Collections · ${aiCollections.length}`],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAiTab(id)}
                        className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
                          aiTab === id ? "bg-[#F4C430] text-background" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="min-w-0 flex-1 truncate font-body text-[11px] text-muted-foreground">
                    {[...aiRes.mood, ...aiRes.genre, ...aiRes.useCase].slice(0, 6).join(" · ")}
                  </span>
                  <button
                    type="button"
                    onClick={clearAi}
                    className="shrink-0 font-body text-xs text-muted-foreground transition-colors hover:text-[#F4C430]"
                  >
                    ✕ Clear
                  </button>
                </div>
              )}

              {aiRes && !showTrackList && (
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {aiTab === "playlists"
                    ? aiPlaylists.map((pl) => (
                        <AiResultCard
                          key={pl.id}
                          to={`/playlist/${pl.slug}`}
                          image={pl.image}
                          title={pl.title}
                          sub={`${pl.trackIds.length} track${pl.trackIds.length === 1 ? "" : "s"}${pl.theme ? ` · ${pl.theme}` : ""}`}
                        />
                      ))
                    : aiCollections.map((c) => (
                        <AiResultCard
                          key={c.id}
                          to={`/collection/${c.id}`}
                          image={c.image}
                          title={c.title}
                          sub={`${c.trackCount} tracks`}
                        />
                      ))}
                  {(aiTab === "playlists" ? aiPlaylists : aiCollections).length === 0 && (
                    <p className="col-span-full px-1 py-8 text-center font-body text-sm text-muted-foreground">
                      Nothing matched here — check the All Tracks tab.
                    </p>
                  )}
                </div>
              )}

              {showTrackList && isLoading && (
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

              {showTrackList && !isLoading && (
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

              {showTrackList && !isLoading && filteredTracks.length === 0 && (
                <div className="px-4 py-12 text-center font-body text-sm text-muted-foreground">
                  No tracks found. Try another filter or search phrase.
                </div>
              )}

              {/* Infinite scroll: crossing this loads the next 20 rows. The two
                  pulsing placeholders are the only hint that more is coming. */}
              {showTrackList && !isLoading && hasMore && (
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
                  className={`skew-aa group relative h-64 w-full overflow-hidden rounded-lg border bg-white/[0.04] text-left transition-[border-color,box-shadow] duration-300 ${
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

// The filter facets as TABS — same pattern as "Browse by" on the homepage
// (owner request: the three stacked accordion groups were a pain to scroll).
// One tab open at a time, its options as clickable chips below; a tab with an
// active pick carries a little count badge, so nothing selected is ever hidden.
const FILTER_TABS: { id: keyof FilterValue; label: string; icon: typeof Music2 }[] = [
  { id: "useCase", label: "Use Case", icon: Clapperboard },
  { id: "genre", label: "Genre", icon: Music2 },
  { id: "mood", label: "Mood", icon: Sparkles },
];

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
  const [tab, setTab] = useState<keyof FilterValue>("useCase");
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

      {/* Segmented control — the homepage "Browse by" pills, sized for the
          narrow sidebar column. Each pill stretches (flex-1) so the three fill
          the groove edge to edge — no dead space right of Mood. */}
      <div className="flex gap-1 rounded-full border border-border/70 bg-card/60 p-1">
        {FILTER_TABS.map((t) => {
          const active = t.id === tab;
          const picked = filters[t.id] !== "All";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={active}
              className={`relative inline-flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1 font-body text-[11px] font-semibold transition-all duration-200 ${
                active
                  ? "bg-[#F4C430] text-background shadow-[0_0_20px_-2px_rgba(244,196,48,0.55)]"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              }`}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
              {/* Count floats over the corner so it never widens the pill (an
                  inline badge pushed Mood onto a second row). The colours flip
                  with the tab: gold badge on a dark inactive pill, dark badge
                  with gold digit on the lit gold pill — readable on both. */}
              {picked && (
                <span
                  className={`absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold tabular-nums ${
                    active
                      ? "border border-[#F4C430]/60 bg-background text-[#F4C430]"
                      : "bg-[#F4C430] text-background"
                  }`}
                >
                  1
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The chips re-mount on every tab switch (key), so they fade in each
          time — same trick as the homepage shelf. Clicking an active chip
          clears it (setFilter toggles back to "All"). */}
      <div key={tab} className="mt-4 flex animate-fade-in flex-wrap gap-1.5">
        {vocab[tab].map((option) => {
          const active = filters[tab] === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(tab, option)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-xs transition-colors duration-200 ${
                active
                  ? "border-[#F4C430]/70 bg-[#F4C430]/[0.07] text-[#F4C430]"
                  : "border-border bg-card/50 text-muted-foreground hover:border-[#F4C430]/70 hover:bg-[#F4C430]/[0.07] hover:text-[#F4C430]"
              }`}
            >
              {/* The dot lights up ONLY on the picked chip — hover just tints
                  the chip itself (owner request: no jumping, no hover dot). */}
              <span
                className={`h-1.5 w-1.5 rounded-full transition-colors duration-200 ${
                  active ? "bg-[#F4C430]" : "bg-muted-foreground/40"
                }`}
                aria-hidden
              />
              {option}
            </button>
          );
        })}
        {vocab[tab].length === 0 && (
          <p className="font-body text-xs text-muted-foreground">Nothing here yet.</p>
        )}
      </div>
    </aside>
  );
};

export default Catalog;
