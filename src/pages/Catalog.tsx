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
  Volume2,
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

const useCaseOptions = ["Movie Trailer", "Film & TV", "Documentary", "Advertising", "Crime & Thriller", "Business", "Video Game", "Sports", "Technology", "Travel", "Nature", "Luxury"];
const genreOptions = ["Neo-Classical", "Action", "Drama", "Dark Score", "Sci-Fi", "Fantasy", "Horror"];
const moodOptions = ["Emotional", "Powerful", "Inspiring", "Suspenseful", "Aggressive", "Tense", "Heroic", "Hopeful", "Uplifting", "Beautiful"];

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

// Perceptual volume: slider 0.8 = unity (100%), below fades correctly, above boosts a bit.
const sliderToGain = (value: number) => {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.min(2, (clamped / 0.8) ** 2);
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
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playedProgress, setPlayedProgress] = useState<Record<string, number>>({});
  const [sort, setSort] = useState("Featured");
  const [volume, setVolume] = useState(0.8);
  const playedKey = (trackId: string, versionId: string) => `${trackId}:${versionId}`;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const filteredTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const result = catalogTracks.filter((track) => {
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

    if (sort === "New") return [...result].reverse();
    if (sort === "Popular") return [...result].sort((a, b) => b.bpm - a.bpm);
    return result;
  }, [activeCollection, filters, query, sort]);

  const currentTrack = catalogTracks.find((track) => track.id === activePlayer?.trackId) ?? filteredTracks[0];
  const currentVersion = currentTrack?.audioVersions.find((version) => version.id === activePlayer?.versionId);
  const currentSrc = currentVersion?.src;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSrc) return;

    audio.load();
  }, [currentSrc]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = sliderToGain(volume);
    } else if (audioRef.current) {
      audioRef.current.volume = Math.min(1, sliderToGain(volume));
    }
  }, [volume]);

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

  const ensureAudioGraph = () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (!audioCtxRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      if (!mediaSourceRef.current) {
        mediaSourceRef.current = ctx.createMediaElementSource(audio);
        gainNodeRef.current = ctx.createGain();
        gainNodeRef.current.gain.value = sliderToGain(volume);
        mediaSourceRef.current.connect(gainNodeRef.current).connect(ctx.destination);
      }
    } catch {
      // Web Audio unavailable; falls back to element volume
    }
  };

  const playVersion = (track: CatalogTrack, version: TrackAudioVersion, seekTo: number | null = null) => {
    const audio = audioRef.current;
    ensureAudioGraph();
    const sameVersion = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

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

  const clearFilters = () => setFilters({ genre: "All", mood: "All", useCase: "All" });

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
          if (audio.seeking || pendingSeekRef.current !== null) return;
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
        <div className="animate-rise-in" style={{ animationDelay: "0.05s" }}>
          <CatalogBreadcrumb activeCollection={activeCollection} />
        </div>
        <div className="animate-rise-in" style={{ animationDelay: "0.14s" }}>
          <LibraryHero />
        </div>

        <section className="mt-4 grid gap-5 lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[15.5rem_minmax(0,1fr)]">
          <div className="animate-slide-in-left" style={{ animationDelay: "0.24s" }}>
            <FilterSidebar filters={filters} setFilter={setFilter} onClear={clearFilters} />
          </div>

          <section className="min-w-0 animate-rise-in" style={{ animationDelay: "0.3s" }}>
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
                    className="h-10 rounded-full border-white/20 bg-background/50 pl-11 transition-colors focus-visible:border-[#FCD162]/70 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div />
                <div className="flex items-center gap-2 justify-self-start font-body text-sm text-muted-foreground md:justify-self-end">
                  <span>Sort by:</span>
                  <SortDropdown value={sort} onChange={setSort} />
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
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isPlaying ? "border-transparent" : "border-border/70 hover:border-[#FCD162]"
                }`}
                aria-label={isPlaying ? "Pause current track" : "Play current track"}
              >
                {isPlaying && <PlayProgressRing progress={progress} />}
                {isPlaying ? <Pause className="h-4 w-4 text-[#FCD162]" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <div className="min-w-0">
                <Link
                  to={`/track/${currentTrack.slug}`}
                  className={`block truncate font-body text-sm font-medium transition-colors ${
                    isPlaying ? "text-[#FCD162]" : "text-foreground hover:text-[#FCD162]"
                  }`}
                >
                  {currentTrack.title}
                </Link>
                <p className="truncate font-body text-xs text-muted-foreground">
                  {currentVersion.label}
                </p>
              </div>
            </div>

            <WaveformPreview
              active={isPlaying}
              bars={420}
              onSeek={(nextProgress) => playVersion(currentTrack, currentVersion, nextProgress)}
              progress={progress}
              src={currentVersion.src}
              className="h-8 md:mr-12"
            />

            <div className="flex items-center gap-4 md:gap-5">
              <div className="hidden items-center gap-3 font-body text-xs text-muted-foreground sm:flex">
                <span className="tabular-nums text-foreground/80">
                  {formatClock(progress * durationToSeconds(currentVersion.duration))}/{currentVersion.duration}
                </span>
                <span className="tabular-nums">{currentTrack.bpm} BPM</span>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="h-1 w-20 cursor-pointer accent-[#FCD162]"
                  aria-label="Volume"
                />
              </div>
              <TrackActions title={currentTrack.title} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PlayProgressRing = ({ progress }: { progress: number }) => {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={6} />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="#FCD162"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
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
        className="inline-flex items-center gap-1 font-semibold text-foreground transition-colors hover:text-[#FCD162]"
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
                  option === value ? "text-[#FCD162]" : "text-foreground"
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
    <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-[#FCD162]">
      <Home className="h-3.5 w-3.5" />
      Home
    </Link>
    <span>/</span>
    <Link to="/catalog" className="transition-colors hover:text-[#FCD162]">
      Music Library
    </Link>
    <span>/</span>
    <span className="font-semibold text-foreground">{activeCollection?.title ?? "All Tracks"}</span>
  </nav>
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
    <div className="absolute inset-y-0 left-0 flex max-w-2xl flex-col justify-center px-8 py-6 md:px-12">
      <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-amber-300/90">
        Discover
      </p>
      <h1 className="mt-2 whitespace-nowrap font-display text-4xl font-semibold leading-none tracking-tight text-white sm:text-5xl">
        <span className="text-[#FCD162]">Premium</span> Music Library
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
                  className={`group relative h-64 w-full overflow-hidden rounded-lg border bg-white/[0.04] text-left transition-[border-color,box-shadow] duration-300 ${
                    active
                      ? "border-white/20"
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
                    className={`pointer-events-none absolute inset-0 transition-opacity duration-300 delay-75 ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <div
                      className="absolute inset-0 rounded-lg border border-[#FCD162]/55"
                      style={{
                        maskImage: "linear-gradient(to bottom, #000 0%, #000 18%, transparent 58%)",
                        WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 18%, transparent 58%)",
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-lg border border-[#FCD162]/75"
                      style={{
                        maskImage: "radial-gradient(58% 55% at 50% 100%, #000 0%, #000 30%, transparent 68%)",
                        WebkitMaskImage: "radial-gradient(58% 55% at 50% 100%, #000 0%, #000 30%, transparent 68%)",
                      }}
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 h-2/3"
                      style={{ background: "radial-gradient(66% 62% at 50% 108%, rgba(252,209,98,0.42), rgba(252,209,98,0) 62%)" }}
                    />
                  </div>
                  <div style={{ transform: "skewX(9deg)" }} className="absolute inset-x-0 bottom-0 p-4">
                    <h3 className="font-display text-lg font-semibold leading-tight text-white">{collection.shortTitle}</h3>
                    <p className="mt-1 font-body text-xs text-white/60">{collection.trackCount} tracks</p>
                    <div className="mt-2.5">
                      <span className="block h-px w-[70px] bg-gradient-to-r from-amber-300/80 to-amber-300/0" />
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
            className="font-body text-xs text-muted-foreground transition-colors hover:text-[#FCD162]"
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
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    className="border-b border-border/30 last:border-b-0"
  >
    <div className="music-track-grid grid gap-3 rounded-lg px-4 py-3 transition-colors duration-150 hover:bg-foreground/[0.04] xl:items-center">
      <button
        type="button"
        onClick={() => onPlayVersion(track, selectedVersion)}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
          mainIsPlaying ? "border-transparent text-[#FCD162]" : "border-border/70 text-foreground hover:border-[#FCD162] hover:text-[#FCD162]"
        }`}
        aria-label={mainIsPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {mainIsPlaying && <PlayProgressRing progress={versionProgress(selectedVersion.id)} />}
        {mainIsPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <Link
        to={`/track/${track.slug}`}
        className={`min-w-0 whitespace-nowrap font-body text-base font-medium transition-colors ${
          mainIsPlaying ? "text-[#FCD162]" : "text-foreground hover:text-[#FCD162]"
        }`}
      >
        {track.title}
      </Link>

      <div className="hidden xl:block" aria-hidden="true" />

      <button
        type="button"
        onClick={onToggleExpanded}
        className={`justify-self-start whitespace-nowrap px-1 py-1 font-body text-xs transition-colors duration-200 ${
          expanded
            ? "text-foreground underline decoration-[#FCD162] decoration-2 underline-offset-4"
            : "text-foreground hover:text-[#FCD162]"
        }`}
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

      <span className={`justify-self-end font-body text-sm ${mainIsPlaying ? "text-[#FCD162]" : "text-muted-foreground"}`}>
        {selectedVersion.duration}
      </span>
      <span className={`justify-self-end font-body text-sm ${mainIsPlaying ? "text-[#FCD162]" : "text-muted-foreground"}`}>
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
                      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                        active && globalIsPlaying ? "border-transparent text-[#FCD162]" : "border-border/60"
                      }`}
                    >
                      {active && globalIsPlaying && <PlayProgressRing progress={versionProgress(version.id)} />}
                      {active && globalIsPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                    </span>
                    <span className={`truncate ${active && globalIsPlaying ? "text-[#FCD162]" : active ? "text-foreground" : undefined}`}>{version.label}</span>
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
                  <span className={`justify-self-end font-body text-sm ${active ? "text-[#FCD162]" : "text-muted-foreground"}`}>
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
                    active ? "border-[#FCD162] bg-[#FCD162]" : "border-border bg-transparent"
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
