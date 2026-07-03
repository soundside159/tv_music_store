import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Heart,
  Home,
  Music2,
  Pause,
  Play,
  Search,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
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
  const [selectedVersions, setSelectedVersions] = useState<Record<string, TrackVersion>>({});
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

  const getSelectedVersion = (track: CatalogTrack) =>
    track.audioVersions.find((version) => version.id === selectedVersions[track.id]) ?? track.audioVersions[0];

  const playVersion = (track: CatalogTrack, version: TrackAudioVersion, seekTo: number | null = null) => {
    const audio = audioRef.current;
    const sameVersion = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

    setSelectedVersions((current) => ({ ...current, [track.id]: version.id }));
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
          setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
        }}
      />

      <main className="px-3 pt-20 sm:px-5 lg:px-6">
        <CatalogBreadcrumb activeCollection={activeCollection} />
        <LibraryHero activeCollection={activeCollection} />

        <section className="mt-4 grid gap-5 lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[15.5rem_minmax(0,1fr)]">
          <FilterSidebar filters={filters} setFilter={setFilter} />

          <section className="min-w-0">
            <CollectionStrip
              activeCollection={activeCollection}
              onSelectCollection={selectCollection}
            />

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

              <div>
                {filteredTracks.map((track, index) => {
                  const selectedVersion = getSelectedVersion(track);
                  const expanded = expandedTrackId === track.id;
                  const rowIsPlaying = activePlayer?.trackId === track.id && isPlaying;

                  return (
                    <TrackRow
                      key={track.id}
                      activePlayer={activePlayer}
                      expanded={expanded}
                      index={index}
                      isPlaying={rowIsPlaying}
                      onPlayVersion={playVersion}
                      onToggleExpanded={() => setExpandedTrackId(expanded ? null : track.id)}
                      progress={activeProgressFor(track, selectedVersion)}
                      selectedVersion={selectedVersion}
                      track={track}
                    />
                  );
                })}
              </div>

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
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur-xl">
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
              onSeek={(nextProgress) => playVersion(currentTrack, currentVersion, nextProgress)}
              progress={progress}
              src={currentVersion.src}
              className="h-8"
            />

            <TrackActions title={currentTrack.title} />
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

const LibraryHero = ({ activeCollection }: { activeCollection: MusicCollection | null }) => {
  if (activeCollection) {
    return (
      <section className="relative mt-4 overflow-hidden rounded-lg border border-border/40">
        <img
          src={activeCollection.image}
          alt=""
          className="h-56 w-full object-cover opacity-75 md:h-64"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.82),rgba(0,0,0,0.34),rgba(0,0,0,0.72))]" />
        <div className="absolute inset-y-0 left-0 flex max-w-xl flex-col justify-center px-8 py-8 md:px-12">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
            {activeCollection.eyebrow}
          </p>
          <h1 className="mt-4 font-body text-4xl font-semibold tracking-normal text-foreground md:text-5xl">
            {activeCollection.shortTitle}
          </h1>
          <p className="mt-4 max-w-sm font-body text-base leading-7 text-foreground/85">
            {activeCollection.description}
          </p>
          <div className="mt-7 inline-flex items-center gap-3 font-body text-sm text-foreground/80">
            <Music2 className="h-4 w-4" />
            {activeCollection.trackCount} tracks
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-border/30 bg-card/25 px-6 py-8 text-center md:py-10">
      <p className="font-body text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
        Discover premium music
      </p>
      <h1 className="mt-4 font-body text-4xl font-semibold tracking-normal text-foreground md:text-5xl">
        Music Library
      </h1>
      <p className="mx-auto mt-4 max-w-xl font-body text-base leading-7 text-muted-foreground">
        Explore our entire library of premium tracks for any project and mood.
      </p>
    </section>
  );
};

const CollectionStrip = ({
  activeCollection,
  onSelectCollection,
}: {
  activeCollection: MusicCollection | null;
  onSelectCollection: (collectionId: string | null) => void;
}) => (
  <section>
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="font-body text-2xl font-medium tracking-normal text-foreground">Collections</h2>
      <button
        type="button"
        onClick={() => onSelectCollection(null)}
        className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        View all collections
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card/70">
          <ChevronRight className="h-4 w-4" />
        </span>
      </button>
    </div>
    <div className="grid auto-cols-[minmax(12rem,15rem)] grid-flow-col gap-3 overflow-x-auto pb-1">
      {musicCollections.map((collection) => {
        const active = activeCollection?.id === collection.id;

        return (
          <button
            key={collection.id}
            type="button"
            onClick={() => onSelectCollection(collection.id)}
            className={`group relative h-32 overflow-hidden rounded-lg border text-left transition-colors ${
              active ? "border-cyan-300" : "border-border/30 hover:border-foreground/30"
            }`}
          >
            <img
              src={collection.image}
              alt=""
              className="h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h3 className="font-body text-sm font-semibold text-foreground">{collection.shortTitle}</h3>
              <p className="mt-1 font-body text-xs text-foreground/70">{collection.trackCount} tracks</p>
            </div>
          </button>
        );
      })}
    </div>
  </section>
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
  index,
  isPlaying,
  onPlayVersion,
  onToggleExpanded,
  progress,
  selectedVersion,
  track,
}: {
  activePlayer: ActivePlayer | null;
  expanded: boolean;
  index: number;
  isPlaying: boolean;
  onPlayVersion: (track: CatalogTrack, version: TrackAudioVersion, seekTo?: number | null) => void;
  onToggleExpanded: () => void;
  progress: number;
  selectedVersion: TrackAudioVersion;
  track: CatalogTrack;
}) => (
  <motion.article
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.035 }}
    className="border-b border-border/30 last:border-b-0"
  >
    <div className="grid gap-3 px-4 py-3 xl:grid-cols-[3rem_minmax(12rem,18rem)_3.5rem_minmax(18rem,1fr)_4.25rem_5rem_5.5rem] xl:items-center">
      <button
        type="button"
        onClick={() => onPlayVersion(track, selectedVersion)}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
          isPlaying ? "border-cyan-300 text-cyan-300" : "border-border/70 text-foreground hover:border-foreground"
        }`}
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <Link
        to={`/track/${track.slug}`}
        className="min-w-0 truncate font-body text-base font-medium text-foreground transition-colors hover:text-cyan-300"
      >
        {track.title}
      </Link>

      <button
        type="button"
        onClick={onToggleExpanded}
        className="w-fit rounded-md border border-border/40 bg-muted/25 px-2 py-1 font-body text-xs text-foreground transition-colors hover:border-cyan-300"
      >
        +{track.audioVersions.length - 1}
      </button>

      <WaveformPreview
        active={isPlaying}
        bars={116}
        onSeek={(nextProgress) => onPlayVersion(track, selectedVersion, nextProgress)}
        progress={progress}
        src={selectedVersion.src}
        className="h-9"
      />

      <span className={`font-body text-sm ${isPlaying ? "text-cyan-300" : "text-muted-foreground"}`}>
        {selectedVersion.duration}
      </span>
      <span className={`font-body text-sm ${isPlaying ? "text-cyan-300" : "text-muted-foreground"}`}>
        {track.bpm} BPM
      </span>
      <TrackActions title={track.title} />
    </div>

    {expanded && (
      <div className="pb-2 xl:ml-[4rem] xl:mr-[10rem]">
        {track.audioVersions.map((version, versionIndex) => {
          const active = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

          return (
            <div
              key={version.id}
              className="grid gap-3 px-4 py-1.5 xl:grid-cols-[14rem_minmax(18rem,1fr)_4.25rem] xl:items-center"
            >
              <button
                type="button"
                onClick={() => onPlayVersion(track, version)}
                className="flex min-w-0 items-center gap-3 text-left font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60">
                  {active && isPlaying ? <Pause className="h-3.5 w-3.5 text-cyan-300" /> : <Play className="h-3.5 w-3.5" />}
                </span>
                <span className={active ? "text-foreground" : undefined}>
                  {String(index + 1).padStart(2, "0")}.{versionIndex + 1} {version.label}
                </span>
              </button>
              <WaveformPreview
                active={active && isPlaying}
                bars={92}
                onSeek={(nextProgress) => onPlayVersion(track, version, nextProgress)}
                progress={active ? progress : 0}
                src={version.src}
                className="h-7 max-w-[34rem]"
              />
              <span className="font-body text-sm text-muted-foreground">{version.duration}</span>
            </div>
          );
        })}
      </div>
    )}
  </motion.article>
);

const TrackActions = ({ title }: { title: string }) => (
  <div className="flex items-center gap-5 text-muted-foreground">
    <button type="button" className="transition-colors hover:text-foreground" aria-label={`Save ${title}`}>
      <Heart className="h-5 w-5 stroke-[1.6]" />
    </button>
    <button type="button" className="transition-colors hover:text-foreground" aria-label={`Add ${title} to cart`}>
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
