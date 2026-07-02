import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ListMusic, Pause, Play, Plus, Search } from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalogTracks, categoryLabels } from "@/data/catalogTracks";
import type { CatalogTrack, TrackAudioVersion, TrackCategory, TrackVersion } from "@/data/catalogTracks";

type ActivePlayer = {
  trackId: string;
  versionId: TrackVersion;
};

const platformTags = ["Sora", "Veo", "Nano Banana", "Kling", "Trailers", "Games"];

const categoryOptions: Array<{ value: "all" | TrackCategory; label: string }> = [
  { value: "all", label: "All" },
  ...Array.from(new Set(catalogTracks.map((track) => track.category))).map((category) => ({
    value: category,
    label: categoryLabels[category],
  })),
];

const moodOptions = ["All", ...Array.from(new Set(catalogTracks.map((track) => track.mood)))];

const Catalog = () => {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("category") as TrackCategory | null;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | TrackCategory>(
    initialCategory && categoryLabels[initialCategory] ? initialCategory : "all",
  );
  const [mood, setMood] = useState("All");
  const [activePlayer, setActivePlayer] = useState<ActivePlayer | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(catalogTracks[0]?.id ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedVersions, setSelectedVersions] = useState<Record<string, TrackVersion>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlayRef = useRef(false);

  const filteredTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return catalogTracks.filter((track) => {
      const matchesCategory = category === "all" || track.category === category;
      const matchesMood = mood === "All" || track.mood === mood;
      const matchesQuery =
        !normalizedQuery ||
        [track.title, track.artist, track.genre, track.mood, track.useCase, track.description, ...track.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesMood && matchesQuery;
    });
  }, [category, mood, query]);

  const currentTrack = catalogTracks.find((track) => track.id === activePlayer?.trackId) ?? filteredTracks[0];
  const currentVersion = currentTrack?.audioVersions.find((version) => version.id === activePlayer?.versionId);
  const currentSrc = currentVersion?.src;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSrc) return;

    audio.load();

    if (!pendingPlayRef.current) return;
    pendingPlayRef.current = false;

    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [currentSrc]);

  const getSelectedVersion = (track: CatalogTrack) =>
    track.audioVersions.find((version) => version.id === selectedVersions[track.id]) ?? track.audioVersions[0];

  const playVersion = (track: CatalogTrack, version: TrackAudioVersion) => {
    const audio = audioRef.current;
    const sameVersion = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

    setSelectedVersions((current) => ({ ...current, [track.id]: version.id }));
    setExpandedTrackId(track.id);

    if (sameVersion && audio) {
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

    setProgress(0);
    setActivePlayer({ trackId: track.id, versionId: version.id });

    if (!audio) {
      pendingPlayRef.current = true;
      return;
    }

    pendingPlayRef.current = false;
    audio.src = version.src;
    audio.load();
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  };

  const activeProgressFor = (track: CatalogTrack, version: TrackAudioVersion) =>
    activePlayer?.trackId === track.id && activePlayer.versionId === version.id ? progress : 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <Navigation />
      <audio
        ref={audioRef}
        src={currentSrc}
        preload="metadata"
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
        }}
      />

      <main className="pt-20 md:pt-24">
        <section className="border-b border-border/40">
          <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="mb-3 font-body text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  Music library
                </p>
                <h1 className="font-body text-4xl font-semibold tracking-normal text-foreground md:text-6xl">
                  Cinematic tracks for modern video
                </h1>
                <p className="mt-4 max-w-2xl font-body text-sm leading-6 text-muted-foreground">
                  Minimal catalog view for testing real previews, alternate mixes, licensing, and future checkout.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 rounded-full border border-border/60 bg-card/50 p-2">
                {platformTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-3 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="grid gap-3 border-b border-border/40 pb-5 lg:grid-cols-[minmax(16rem,1fr)_12rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tracks, moods, use cases"
                className="h-11 rounded-none border-border/70 bg-transparent pl-9"
              />
            </div>

            <SelectField value={mood} onChange={setMood}>
              {moodOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>

            <div className="flex flex-wrap gap-2 lg:col-span-2">
              {categoryOptions.map((item) => (
                <FilterPill
                  key={item.value}
                  active={category === item.value}
                  onClick={() => setCategory(item.value)}
                >
                  {item.label}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 font-body text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ListMusic className="h-4 w-4" />
              {filteredTracks.length} tracks /{" "}
              {filteredTracks.reduce((total, track) => total + track.audioVersions.length, 0)} versions
            </span>
            <span>Sort by Featured</span>
          </div>

          <div className="mt-3 border-y border-border/40">
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
              No tracks found. Try another mood or search phrase.
            </div>
          )}
        </section>
      </main>

      {currentTrack && currentVersion && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl">
          <div className="mx-auto grid min-h-16 w-full max-w-7xl gap-3 px-4 py-3 sm:px-6 md:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)_auto] md:items-center lg:px-8">
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

            <WaveformPreview active={isPlaying} progress={progress} seed={currentTrack.bpm} className="h-8" />

            <Button size="sm" className="h-9 rounded-full px-4">
              License ${currentTrack.priceFrom}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

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
  onPlayVersion: (track: CatalogTrack, version: TrackAudioVersion) => void;
  onToggleExpanded: () => void;
  progress: number;
  selectedVersion: TrackAudioVersion;
  track: CatalogTrack;
}) => (
  <motion.article
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.035 }}
    className="border-b border-border/40 py-3 last:border-b-0"
  >
    <div className="grid gap-3 lg:grid-cols-[2.25rem_minmax(12rem,20rem)_4.5rem_minmax(12rem,1fr)_4.25rem_4.5rem_auto] lg:items-center">
      <button
        type="button"
        onClick={() => onPlayVersion(track, selectedVersion)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-foreground"
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
          {track.genre} / {track.mood}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleExpanded}
        className="w-fit rounded-full border border-border/60 px-2.5 py-1 font-body text-xs text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground"
      >
        +{track.audioVersions.length - 1}
      </button>

      <WaveformPreview active={isPlaying} progress={progress} seed={track.bpm} bars={96} className="h-10" />

      <span className="font-body text-xs text-muted-foreground">{selectedVersion.duration}</span>
      <span className="font-body text-xs text-muted-foreground">{track.bpm} BPM</span>

      <Button size="sm" variant="ghost" className="h-9 justify-start rounded-full px-3 text-muted-foreground hover:text-foreground">
        <Plus className="h-4 w-4" />
        License
      </Button>
    </div>

    {expanded && (
      <div className="mt-3 space-y-1 pl-0 lg:ml-[2.25rem] lg:pl-3">
        {track.audioVersions.map((version, versionIndex) => {
          const active = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

          return (
            <button
              key={version.id}
              type="button"
              onClick={() => onPlayVersion(track, version)}
              className="grid w-full gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/30 lg:grid-cols-[1.25rem_minmax(10rem,15rem)_minmax(12rem,1fr)_4rem] lg:items-center"
            >
              <span className="text-muted-foreground">
                {active && isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </span>
              <span className={`font-body text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {version.label}
              </span>
              <WaveformPreview
                active={active && isPlaying}
                bars={80}
                progress={active ? progress : 0}
                seed={track.bpm + versionIndex}
                className="h-7"
              />
              <span className="font-body text-xs text-muted-foreground">{version.duration}</span>
            </button>
          );
        })}
      </div>
    )}
  </motion.article>
);

const SelectField = ({
  children,
  onChange,
  value,
}: {
  children: ReactNode;
  onChange: (value: string) => void;
  value: string;
}) => (
  <label className="block">
    <span className="sr-only">Mood</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-none border border-border/70 bg-transparent px-3 font-body text-sm text-foreground outline-none focus:border-foreground"
    >
      {children}
    </select>
  </label>
);

const FilterPill = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-8 rounded-full border px-3 font-body text-xs transition-colors ${
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border/60 bg-transparent text-muted-foreground hover:border-foreground/60 hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

export default Catalog;
