import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Download,
  Filter,
  Heart,
  Home,
  ListMusic,
  Pause,
  Play,
  Search,
  ShoppingBag,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import { Input } from "@/components/ui/input";
import { catalogTracks, categoryLabels } from "@/data/catalogTracks";
import type { CatalogTrack, TrackAudioVersion, TrackCategory, TrackVersion } from "@/data/catalogTracks";

type ActivePlayer = {
  trackId: string;
  versionId: TrackVersion;
};

type FilterValue = {
  genre: string;
  mood: string;
  useCase: string;
};

const splitFilterValues = (value: string) => value.split("/").map((item) => item.trim()).filter(Boolean);

const uniqueValues = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const useCaseOptions = uniqueValues(catalogTracks.flatMap((track) => splitFilterValues(track.useCase)));
const genreOptions = uniqueValues(catalogTracks.map((track) => track.genre));
const moodOptions = uniqueValues(catalogTracks.map((track) => track.mood));

const Catalog = () => {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("category") as TrackCategory | null;
  const initialGenre =
    initialCategory && categoryLabels[initialCategory]
      ? catalogTracks.find((track) => track.category === initialCategory)?.genre ?? "All"
      : "All";

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValue>({
    genre: initialGenre,
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
      const matchesUseCase = filters.useCase === "All" || splitFilterValues(track.useCase).includes(filters.useCase);
      const matchesGenre = filters.genre === "All" || track.genre === filters.genre;
      const matchesMood = filters.mood === "All" || track.mood === filters.mood;
      const matchesQuery =
        !normalizedQuery ||
        [track.title, track.artist, track.genre, track.mood, track.useCase, track.description, ...track.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesUseCase && matchesGenre && matchesMood && matchesQuery;
    });
  }, [filters, query]);

  const currentTrack = catalogTracks.find((track) => track.id === activePlayer?.trackId) ?? filteredTracks[0];
  const currentVersion = currentTrack?.audioVersions.find((version) => version.id === activePlayer?.versionId);
  const currentSrc = currentVersion?.src;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSrc) return;

    audio.load();
  }, [currentSrc]);

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
    <div className="min-h-screen bg-background pb-24">
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

      <main className="px-4 pt-24 sm:px-6 lg:px-8">
        <CatalogBreadcrumb />

        <section className="mt-8 grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="h-fit rounded-xl border border-border/70 bg-card/30 p-5">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70">
                <Filter className="h-4 w-4" />
              </span>
              <h1 className="font-body text-lg font-semibold tracking-wide text-foreground">Filters</h1>
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

          <section className="min-w-0">
            <div className="grid gap-3 md:grid-cols-[minmax(16rem,40rem)_1fr_auto] md:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tracks, genres, moods"
                  className="h-12 rounded-lg border-border/70 bg-card/30 pl-11"
                />
              </div>
              <div />
              <div className="font-body text-sm text-muted-foreground">
                Sort by <span className="font-semibold text-foreground">Featured</span>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between gap-4 border-b border-border/40 pb-3 font-body text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ListMusic className="h-4 w-4" />
                {filteredTracks.length} tracks /{" "}
                {filteredTracks.reduce((total, track) => total + track.audioVersions.length, 0)} versions
              </span>
            </div>

            <div className="border-b border-border/40">
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
              <div className="py-12 text-center font-body text-sm text-muted-foreground">
                No tracks found. Try another filter or search phrase.
              </div>
            )}
          </section>
        </section>
      </main>

      {currentTrack && currentVersion && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl">
          <div className="grid min-h-16 w-full gap-3 px-4 py-3 sm:px-6 md:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)_auto] md:items-center lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => playVersion(currentTrack, currentVersion)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-foreground"
                aria-label={isPlaying ? "Pause current track" : "Play current track"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <div className="min-w-0">
                <Link
                  to={`/track/${currentTrack.slug}`}
                  className="block truncate font-body text-sm font-medium text-foreground transition-colors hover:text-primary"
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

            <TrackActions downloadSrc={currentVersion.src} title={currentTrack.title} />
          </div>
        </div>
      )}
    </div>
  );
};

const CatalogBreadcrumb = () => (
  <div className="flex items-center gap-4">
    <Link
      to="/"
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card/40 font-body text-sm font-semibold text-foreground"
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
      <span className="font-semibold text-foreground">All Tracks</span>
    </nav>
  </div>
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
    className="border-b border-border/40 py-4 last:border-b-0"
  >
    <div className="grid gap-4 xl:grid-cols-[2.5rem_minmax(12rem,17rem)_minmax(12rem,1fr)_3.25rem_minmax(18rem,32rem)_3.5rem_4.5rem_7.25rem] xl:items-center">
      <button
        type="button"
        onClick={() => onPlayVersion(track, selectedVersion)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-foreground"
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <div className="min-w-0">
        <Link
          to={`/track/${track.slug}`}
          className="block truncate font-body text-sm font-semibold text-foreground transition-colors hover:text-primary"
        >
          {track.title}
        </Link>
        <div className="mt-1 truncate font-body text-xs text-muted-foreground">
          {track.artist} / {categoryLabels[track.category]}
        </div>
      </div>

      <div className="truncate font-body text-sm text-muted-foreground">
        {track.genre} / {track.mood} / {splitFilterValues(track.useCase)[0]}
      </div>

      <button
        type="button"
        onClick={onToggleExpanded}
        className="w-fit rounded-full border border-border/60 px-2.5 py-1 font-body text-xs text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground"
      >
        +{track.audioVersions.length - 1}
      </button>

      <WaveformPreview
        active={isPlaying}
        bars={92}
        onSeek={(nextProgress) => onPlayVersion(track, selectedVersion, nextProgress)}
        progress={progress}
        src={selectedVersion.src}
        className="h-10 max-w-[32rem]"
      />

      <span className="font-body text-xs text-muted-foreground">{selectedVersion.duration}</span>
      <span className="font-body text-xs text-muted-foreground">{track.bpm} BPM</span>
      <TrackActions downloadSrc={selectedVersion.src} title={track.title} />
    </div>

    {expanded && (
      <div className="mt-2 space-y-1 xl:ml-[3.5rem]">
        {track.audioVersions.map((version, versionIndex) => {
          const active = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

          return (
            <div
              key={version.id}
              className="grid gap-4 rounded-md px-3 py-2 transition-colors hover:bg-muted/25 xl:grid-cols-[minmax(12rem,17rem)_3.25rem_minmax(18rem,32rem)_3.5rem] xl:items-center"
            >
              <button
                type="button"
                onClick={() => onPlayVersion(track, version)}
                className="flex min-w-0 items-center gap-3 text-left font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {active && isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span className={active ? "text-foreground" : undefined}>{version.label}</span>
              </button>
              <span />
              <WaveformPreview
                active={active && isPlaying}
                bars={92}
                onSeek={(nextProgress) => onPlayVersion(track, version, nextProgress)}
                progress={active ? progress : 0}
                src={version.src}
                className="h-7 max-w-[32rem]"
              />
              <span className="font-body text-xs text-muted-foreground">{version.duration}</span>
            </div>
          );
        })}
      </div>
    )}
  </motion.article>
);

const TrackActions = ({ downloadSrc, title }: { downloadSrc: string; title: string }) => (
  <div className="flex items-center gap-3 text-muted-foreground">
    <button type="button" className="transition-colors hover:text-foreground" aria-label={`Save ${title}`}>
      <Heart className="h-4 w-4" />
    </button>
    <button type="button" className="transition-colors hover:text-foreground" aria-label={`Add ${title} to cart`}>
      <ShoppingBag className="h-4 w-4" />
    </button>
    <a
      href={downloadSrc}
      download
      className="transition-colors hover:text-foreground"
      aria-label={`Download preview for ${title}`}
    >
      <Download className="h-4 w-4" />
    </a>
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
  <div className="border-t border-border/50 py-5 first:border-t-0 first:pt-0 last:pb-0">
    <div className="mb-3 font-body text-xs font-semibold uppercase tracking-[0.18em] text-foreground">{label}</div>
    <div className="space-y-2">
      {options.map((option) => {
        const active = value === option;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="flex w-full items-center gap-3 text-left font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span
              className={`h-3.5 w-3.5 rounded-[3px] border ${
                active ? "border-foreground bg-foreground" : "border-border bg-transparent"
              }`}
            />
            <span>{option}</span>
          </button>
        );
      })}
      {value !== "All" && (
        <button
          type="button"
          onClick={() => onChange(value)}
          className="pt-1 font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  </div>
);

export default Catalog;
