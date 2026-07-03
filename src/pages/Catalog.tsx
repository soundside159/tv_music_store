import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Home,
  Pause,
  Play,
  Search,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import cinemaHero from "@/assets/cinema-hero-wide.png";
import { Input } from "@/components/ui/input";
import { catalogTracks } from "@/data/catalogTracks";
import type { CatalogTrack, TrackAudioVersion, TrackVersion } from "@/data/catalogTracks";
import { musicCollections } from "@/data/musicCollections";
import type { MusicCollection } from "@/data/musicCollections";

type ActivePlayer = {
  trackId: string;
  versionId: TrackVersion;
};

type FilterValue = {
  genre: string;
  mood: string;
  useCase: string;
};

const useCaseOptions = ["Trailer", "Film", "TV", "YouTube", "Game", "Advertising", "Podcast"];
const genreOptions = ["Orchestral", "Hybrid", "Electronic", "Cinematic", "Rock", "Ambient"];
const moodOptions = ["Epic", "Dark", "Inspiring", "Suspense", "Emotional"];

const splitFilterValues = (value: string) => value.split("/").map((item) => item.trim()).filter(Boolean);

const matchesOption = (value: string, option: string) => value.toLowerCase().includes(option.toLowerCase());

const durationToSeconds = (duration: string) => {
  const parts = duration.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
};

const getDurationRatio = (track: CatalogTrack, version: TrackAudioVersion) => {
  const trackSeconds = durationToSeconds(track.duration);
  const versionSeconds = durationToSeconds(version.duration);
  if (!trackSeconds || !versionSeconds) return 1;
  return Math.min(1, Math.max(0.08, versionSeconds / trackSeconds));
};

const formatClock = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const Catalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCollectionId = searchParams.get("collection");
  const activeCollection = musicCollections.find((collection) => collection.id === activeCollectionId) ?? null;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValue>({
    genre: "All",
    mood: "All",
    useCase: "All",
  });
  const [activePlayer, setActivePlayer] = useState<ActivePlayer | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(catalogTracks[0]?.id ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playedProgress, setPlayedProgress] = useState<Record<string, number>>({});
  const playedKey = (trackId: string, versionId: string) => `${trackId}:${versionId}`;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);

  const filteredTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return catalogTracks.filter((track) => {
      const matchesCollection = !activeCollection || track.collectionIds.includes(activeCollection.id);
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

      return matchesCollection && matchesUseCase && matchesGenre && matchesMood && matchesQuery;
    });
  }, [activeCollection, filters, query]);

  const currentTrack = catalogTracks.find((track) => track.id === activePlayer?.trackId) ?? filteredTracks[0];
  const currentVersion = currentTrack?.audioVersions.find((version) => version.id === activePlayer?.versionId);
  const currentSrc = currentVersion?.src;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSrc) return;

    audio.load();
  }, [currentSrc]);

  const selectCollection = (collectionId: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (collectionId) nextParams.set("collection", collectionId);
    else nextParams.delete("collection");
    setSearchParams(nextParams);
    setExpandedTrackId(null);
  };

  const applyPendingStart = (audio: HTMLAudioElement) => {
    if (pendingSeekRef.current !== null && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = audio.duration * pendingSeekRef.current;
      pendingSeekRef.current = null;
    }

    if (!pendingPlayRef.current) return;
    pendingPlayRef.current = false;

    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  };

  const playVersion = (track: CatalogTrack, version: TrackAudioVersion, seekTo: number | null = null) => {
    const audio = audioRef.current;
    const sameVersion = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

    setExpandedTrackId(track.id);

    if (sameVersion && audio) {
      if (seekTo !== null) {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = audio.duration * seekTo;
          setProgress(seekTo);
        }
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
        return;
      }

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        return;
      }

      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      return;
    }

    pendingSeekRef.current = seekTo;
    pendingPlayRef.current = true;
    setProgress(seekTo ?? 0);
    setActivePlayer({ trackId: track.id, versionId: version.id });

    if (!audio) return;

    audio.src = version.src;
    audio.load();
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  };

  const activeProgressFor = (track: CatalogTrack, version: TrackAudioVersion) =>
    activePlayer?.trackId === track.id && activePlayer.versionId === version.id ? progress : 0;

  const setFilter = (key: keyof FilterValue, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key] === value ? "All" : value,
    }));
  };

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <Navigation />
      <audio
        ref={audioRef}
        src={currentSrc}
        preload="metadata"
        onLoadedMetadata={(event) => applyPendingStart(event.currentTarget)}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          const nextProgress = audio.duration ? audio.currentTime / audio.duration : 0;
          setProgress(nextProgress);
          if (activePlayer) {
            const key = playedKey(activePlayer.trackId, activePlayer.versionId);
            setPlayedProgress((prev) => ({ ...prev, [key]: nextProgress }));
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
          if (activePlayer) {
            const key = playedKey(activePlayer.trackId, activePlayer.versionId);
            setPlayedProgress((prev) => ({ ...prev, [key]: 1 }));
          }
        }}
      />

      <main className="px-3 pt-20 sm:px-5 lg:px-6">
        <CatalogBreadcrumb activeCollection={activeCollection} />
        <LibraryHero />

        <section className="mt-4 grid gap-5 lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[15.5rem_minmax(0,1fr)]">
          <FilterSidebar filters={filters} setFilter={setFilter} />

          <section className="min-w-0">
            <CollectionStrip activeCollection={activeCollection} onSelectCollection={selectCollection} />

            <div className="mt-4 overflow-hidden rounded-lg border border-border/30 bg-card/25">
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
                    className="h-10 rounded-full border-border/40 bg-background/50 pl-11"
                  />
                </div>
                <div />
                <div className="flex items-center gap-2 justify-self-start font-body text-sm text-muted-foreground md:justify-self-end">
                  <span>Sort by:</span>
                  <button type="button" className="inline-flex items-center gap-1 font-semibold text-foreground">
                    Featured
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCollection?.id ?? "all-tracks"}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  {filteredTracks.map((track, index) => {
                    const mainVersion = track.audioVersions[0];
                    const expanded = expandedTrackId === track.id;
                    const mainIsPlaying =
                      activePlayer?.trackId === track.id && activePlayer.versionId === mainVersion.id && isPlaying;

                    return (
                      <TrackRow
                        key={track.id}
                        activePlayer={activePlayer}
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

              {filteredTracks.length === 0 && (
                <div className="px-4 py-12 text-center font-body text-sm text-muted-foreground">
                  No tracks found. Try another filter or search phrase.
                </div>
              )}
            </div>
          </section>
        </section>
      </main>

      {currentTrack && currentVersion && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-card/95 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="grid min-h-16 w-full gap-3 px-4 py-3 sm:px-6 md:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)_auto] md:items-center lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => playVersion(currentTrack, currentVersion)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-cyan-300"
                aria-label={isPlaying ? "Pause current track" : "Play current track"}
              >
                {isPlaying ? <Pause className="h-4 w-4 text-cyan-300" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <div className="min-w-0">
                <Link
                  to={`/track/${currentTrack.slug}`}
                  className="block truncate font-body text-sm font-medium text-foreground transition-colors hover:text-cyan-300"
                >
                  {currentTrack.title}
                </Link>
                <p className="truncate font-body text-xs text-muted-foreground">
                  {currentVersion.label} / {currentTrack.bpm} BPM
                </p>
              </div>
            </div>

            <WaveformPreview
              active={isPlaying}
              bars={420}
              onSeek={(nextProgress) => playVersion(currentTrack, currentVersion, nextProgress)}
              progress={progress}
              src={currentVersion.src}
              className="h-8"
            />

            <div className="flex items-center gap-4 md:gap-5">
              <div className="hidden items-center gap-3 font-body text-xs text-muted-foreground sm:flex">
                <span className="tabular-nums text-foreground/80">
                  {formatClock(progress * durationToSeconds(currentVersion.duration))}/{currentVersion.duration}
                </span>
                <span className="tabular-nums">{currentTrack.bpm} BPM</span>
              </div>
              <TrackActions title={currentTrack.title} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CatalogBreadcrumb = ({ activeCollection }: { activeCollection: MusicCollection | null }) => (
  <div className="flex items-center gap-3">
    <Link
      to="/"
      className="flex h-7 w-8 items-center justify-center rounded-md border border-border/50 bg-card/50 font-body text-xs font-semibold text-foreground"
    >
      TV
    </Link>
    <nav className="flex flex-wrap items-center gap-2 font-body text-sm text-muted-foreground">
      <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
        Home
      </Link>
      <span>/</span>
      <span>Music Library</span>
      <span>/</span>
      <span className="font-semibold text-foreground">{activeCollection?.title ?? "All Tracks"}</span>
    </nav>
  </div>
);

const LibraryHero = () => (
  <section className="relative mt-4 h-40 overflow-hidden rounded-xl border border-white/10 bg-[#0a0706] md:h-44">
    <div
      className="pointer-events-none absolute inset-0 bg-no-repeat"
      style={{
        backgroundImage: `url(${cinemaHero})`,
        backgroundSize: "2200px auto",
        backgroundPosition: "100% 48%",
      }}
    />
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.95)_0%,rgba(0,0,0,0.78)_22%,rgba(0,0,0,0.4)_48%,rgba(0,0,0,0)_74%)]" />
    <div className="absolute inset-y-0 left-0 flex max-w-xl flex-col justify-center px-8 py-6 md:px-12">
      <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-amber-300/90">
        Discover premium music
      </p>
      <h1 className="mt-2 font-display text-5xl font-semibold leading-none tracking-tight text-white md:text-6xl">
        Music Library
      </h1>
      <p className="mt-3 max-w-lg font-body text-sm leading-6 text-white/55">
        Explore our entire library of premium tracks for any project and mood.
      </p>
    </div>
  </section>
);

const CollectionStrip = ({
  activeCollection,
  onSelectCollection,
}: {
  activeCollection: MusicCollection | null;
  onSelectCollection: (collectionId: string | null) => void;
}) => {
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
                  className={`group relative h-64 w-full overflow-hidden rounded-lg border text-left transition-[border-color,box-shadow] duration-300 ${
                    active
                      ? "border-white/20"
                      : "border-white/15 shadow-[inset_0_0_16px_-8px_rgba(255,255,255,0.3)] hover:border-white/35"
                  }`}
                >
                  <img
                    src={collection.image}
                    alt=""
                    style={{ transform: "skewX(9deg) scale(1.32)" }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
                  {active && (
                    <>
                      <div
                        className="pointer-events-none absolute inset-0 rounded-lg border border-[#FCD162]/55"
                        style={{
                          maskImage: "linear-gradient(to bottom, #000 0%, #000 18%, transparent 58%)",
                          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 18%, transparent 58%)",
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                        style={{ background: "radial-gradient(66% 62% at 50% 108%, rgba(252,209,98,0.4), rgba(252,209,98,0) 62%)" }}
                      />
                    </>
                  )}
                  <div style={{ transform: "skewX(9deg)" }} className="absolute inset-x-0 bottom-0 p-4">
                    <h3 className="font-display text-lg font-semibold leading-tight text-white">{collection.shortTitle}</h3>
                    <p className="mt-1 font-body text-xs text-white/60">{collection.trackCount} tracks</p>
                    <div className="mt-2.5 flex items-end justify-between">
                      <span className="block h-px w-[70px] bg-gradient-to-r from-amber-300/80 to-amber-300/0" />
                      <ArrowRight className="h-4 w-4 text-white/75 transition-colors group-hover:text-white" />
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
          ? "bg-[#FCD162] shadow-[0_0_10px_3px_rgba(252,209,98,0.8)]"
          : "bg-white/30"
      }`}
    />
  </div>
);

const FilterSidebar = ({
  filters,
  setFilter,
}: {
  filters: FilterValue;
  setFilter: (key: keyof FilterValue, value: string) => void;
}) => (
  <aside className="h-fit rounded-lg border border-border/30 bg-card/30 p-4 lg:sticky lg:top-24">
    <div className="mb-4 flex items-center gap-3 border-b border-border/30 pb-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border/50">
        <SlidersHorizontal className="h-4 w-4" />
      </span>
      <h2 className="font-body text-sm font-semibold uppercase tracking-[0.08em] text-foreground">Filters</h2>
    </div>
    <FilterGroup
      label="Use Case"
      options={useCaseOptions}
      value={filters.useCase}
      onChange={(value) => setFilter("useCase", value)}
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

const TrackRow = ({
  activePlayer,
  expanded,
  globalIsPlaying,
  globalProgress,
  index,
  mainIsPlaying,
  onPlayVersion,
  onToggleExpanded,
  playedProgress,
  selectedVersion,
  track,
}: {
  activePlayer: ActivePlayer | null;
  expanded: boolean;
  globalIsPlaying: boolean;
  globalProgress: number;
  index: number;
  mainIsPlaying: boolean;
  onPlayVersion: (track: CatalogTrack, version: TrackAudioVersion, seekTo?: number | null) => void;
  onToggleExpanded: () => void;
  playedProgress: Record<string, number>;
  selectedVersion: TrackAudioVersion;
  track: CatalogTrack;
}) => {
  const versionProgress = (versionId: string) => {
    const isActive = activePlayer?.trackId === track.id && activePlayer.versionId === versionId;
    const played = playedProgress[`${track.id}:${versionId}`] ?? 0;
    if (isActive) return globalProgress;
    return played;
  };

  return (
  <motion.article
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.035 }}
    className="border-b border-border/30 last:border-b-0"
  >
    <div className="music-track-grid grid gap-3 rounded-lg px-4 py-3 transition-colors duration-150 hover:bg-foreground/[0.04] xl:items-center">
      <button
        type="button"
        onClick={() => onPlayVersion(track, selectedVersion)}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
          mainIsPlaying ? "border-cyan-300 text-cyan-300" : "border-border/70 text-foreground hover:border-foreground"
        }`}
        aria-label={mainIsPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {mainIsPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <Link
        to={`/track/${track.slug}`}
        className="min-w-0 whitespace-nowrap font-body text-base font-medium text-foreground transition-colors hover:text-cyan-300"
      >
        {track.title}
      </Link>

      <div className="hidden xl:block" aria-hidden="true" />

      <button
        type="button"
        onClick={onToggleExpanded}
        className="justify-self-start whitespace-nowrap rounded-md border border-border/40 bg-muted/25 px-2 py-1 font-body text-xs text-foreground transition-colors duration-200 hover:border-cyan-300"
      >
        versions +{track.audioVersions.length - 1}
      </button>

      <WaveformPreview
        active={mainIsPlaying}
        bars={420}
        durationRatio={1}
        onSeek={(nextProgress) => onPlayVersion(track, selectedVersion, nextProgress)}
        progress={versionProgress(selectedVersion.id)}
        src={selectedVersion.src}
        className="h-9 min-w-0"
      />

      <span className={`justify-self-end font-body text-sm ${mainIsPlaying ? "text-cyan-300" : "text-muted-foreground"}`}>
        {selectedVersion.duration}
      </span>
      <span className={`justify-self-end font-body text-sm ${mainIsPlaying ? "text-cyan-300" : "text-muted-foreground"}`}>
        {track.bpm} BPM
      </span>
      <ActionIconButton label={`Save ${track.title}`}>
        <Heart className="h-5 w-5 stroke-[1.6]" />
      </ActionIconButton>
      <ActionIconButton label={`Add ${track.title} to cart`}>
        <ShoppingCart className="h-5 w-5 stroke-[1.6]" />
      </ActionIconButton>
    </div>

    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="pb-3">
            {track.audioVersions.slice(1).map((version) => {
              const active = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

              return (
                <div
                  key={version.id}
                  className="music-track-grid grid gap-3 px-4 py-1.5 xl:items-center"
                >
                  <div className="hidden xl:block" />
                  <button
                    type="button"
                    onClick={() => onPlayVersion(track, version)}
                    className="flex min-w-0 items-center gap-3 text-left font-body text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                        active && globalIsPlaying ? "border-cyan-300 text-cyan-300" : "border-border/60"
                      }`}
                    >
                      {active && globalIsPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                    </span>
                    <span className={`truncate ${active ? "text-foreground" : undefined}`}>{version.label}</span>
                  </button>
                  <div className="hidden xl:block" />
                  <div className="hidden xl:block" />
                  <WaveformPreview
                    active={active && globalIsPlaying}
                    bars={360}
                    durationRatio={getDurationRatio(track, version)}
                    onSeek={(nextProgress) => onPlayVersion(track, version, nextProgress)}
                    progress={versionProgress(version.id)}
                    src={version.src}
                    className="h-7 min-w-0 xl:mr-[var(--track-version-wave-inset)]"
                  />
                  <span className={`justify-self-end font-body text-sm ${active ? "text-cyan-300" : "text-muted-foreground"}`}>
                    {version.duration}
                  </span>
                  <div className="hidden xl:block" />
                  <div className="hidden xl:block" />
                  <ActionIconButton label={`Add ${version.label} to cart`}>
                    <ShoppingCart className="h-5 w-5 stroke-[1.6]" />
                  </ActionIconButton>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.article>
  );
};

const ActionIconButton = ({ children, label }: { children: ReactNode; label: string }) => (
  <button
    type="button"
    className="justify-self-end text-muted-foreground transition-colors duration-200 hover:text-foreground"
    aria-label={label}
  >
    {children}
  </button>
);

const TrackActions = ({ title }: { title: string }) => (
  <div className="flex items-center gap-5 text-muted-foreground">
    <button type="button" className="transition-colors duration-200 hover:text-foreground" aria-label={`Save ${title}`}>
      <Heart className="h-5 w-5 stroke-[1.6]" />
    </button>
    <button type="button" className="transition-colors duration-200 hover:text-foreground" aria-label={`Add ${title} to cart`}>
      <ShoppingCart className="h-5 w-5 stroke-[1.6]" />
    </button>
  </div>
);

const FilterGroup = ({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) => (
  <div className="border-t border-border/30 py-4 first:border-t-0 first:pt-0">
    <div className="mb-3 font-body text-xs font-semibold uppercase tracking-[0.12em] text-foreground">{label}</div>
    <div className="space-y-2">
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
                active ? "border-cyan-300 bg-cyan-300" : "border-border bg-transparent"
              }`}
            />
            <span>{option}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="inline-flex items-center gap-1 pt-1 font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Show more
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);

export default Catalog;
