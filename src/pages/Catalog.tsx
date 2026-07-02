import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Pause, Play, Plus, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalogTracks, categoryLabels } from "@/data/catalogTracks";
import type { CatalogTrack, TrackCategory } from "@/data/catalogTracks";

const categories: Array<{ value: "all" | TrackCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "modern-score", label: "Modern Score" },
  { value: "thriller", label: "Thriller" },
  { value: "game-ost", label: "Game OST" },
  { value: "production", label: "Production" },
];

const moods = ["All", "Hopeful", "Dark", "Heroic", "Urgent", "Confident", "Investigative"];

const bpmRanges = [
  { label: "Any tempo", min: 0, max: Infinity },
  { label: "Slow", min: 0, max: 89 },
  { label: "Medium", min: 90, max: 119 },
  { label: "Fast", min: 120, max: Infinity },
];

const Catalog = () => {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("category") as TrackCategory | null;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | TrackCategory>(
    initialCategory && categoryLabels[initialCategory] ? initialCategory : "all",
  );
  const [mood, setMood] = useState("All");
  const [bpmRange, setBpmRange] = useState(bpmRanges[0]);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(catalogTracks[0]?.id ?? null);

  const filteredTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return catalogTracks.filter((track) => {
      const matchesCategory = category === "all" || track.category === category;
      const matchesMood = mood === "All" || track.mood === mood;
      const matchesBpm = track.bpm >= bpmRange.min && track.bpm <= bpmRange.max;
      const matchesQuery =
        !normalizedQuery ||
        [track.title, track.genre, track.mood, track.useCase, track.styleOf, track.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesMood && matchesBpm && matchesQuery;
    });
  }, [bpmRange, category, mood, query]);

  const currentTrack = catalogTracks.find((track) => track.id === playingTrackId) ?? filteredTracks[0];

  const togglePlay = (trackId: string) => {
    setPlayingTrackId((current) => (current === trackId ? null : trackId));
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navigation />

      <main className="pt-24 md:pt-28">
        <section className="border-b border-border/45">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <Link
              to="/"
              className="inline-flex w-fit items-center gap-2 font-body text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>

            <div className="mt-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-2 font-body text-xs uppercase tracking-[0.28em] text-primary">
                  Cinematic music licensing
                </p>
                <h1 className="font-display text-3xl tracking-wide text-foreground md:text-5xl">Music Catalog</h1>
                <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-muted-foreground">
                  Browse a focused set of cues by mood, tempo, and use case.
                </p>
              </div>
              <div className="font-body text-sm text-muted-foreground">
                <span className="text-foreground">{filteredTracks.length}</span> tracks
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="border-b border-border/45 pb-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem]">
              <div>
                <label htmlFor="catalog-search" className="sr-only">
                  Search tracks
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="catalog-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tracks"
                    className="h-11 rounded-none border-border/70 bg-card/35 pl-9"
                  />
                </div>
              </div>

              <SelectField label="Mood" value={mood} onChange={setMood}>
                {moods.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Tempo"
                value={bpmRange.label}
                onChange={(label) => setBpmRange(bpmRanges.find((range) => range.label === label) ?? bpmRanges[0])}
              >
                {bpmRanges.map((range) => (
                  <option key={range.label} value={range.label}>
                    {range.label}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map((item) => (
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

          <div className="mt-4 flex items-center gap-2 font-body text-xs uppercase tracking-widest text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Track library
          </div>

          <div className="mt-4 border-y border-border/45">
            {filteredTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                isPlaying={playingTrackId === track.id}
                onTogglePlay={() => togglePlay(track.id)}
              />
            ))}
          </div>

          {filteredTracks.length === 0 && (
            <div className="py-12 text-center">
              <Sparkles className="mx-auto mb-3 h-6 w-6 text-primary" />
              <h3 className="font-display text-xl text-foreground">No tracks found</h3>
              <p className="mx-auto mt-2 max-w-md font-body text-sm text-muted-foreground">
                Try another mood, tempo, or search phrase.
              </p>
            </div>
          )}
        </section>
      </main>

      {currentTrack && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/95 backdrop-blur-md">
          <div className="mx-auto grid min-h-20 w-full max-w-7xl gap-3 px-4 py-3 sm:px-6 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)_auto] md:items-center lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => togglePlay(currentTrack.id)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-label={playingTrackId === currentTrack.id ? "Pause current track" : "Play current track"}
              >
                {playingTrackId === currentTrack.id ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <div className="min-w-0">
                <Link
                  to={`/track/${currentTrack.slug}`}
                  className="truncate font-body text-sm text-foreground transition-colors hover:text-primary"
                >
                  {currentTrack.title}
                </Link>
                <p className="truncate font-body text-xs text-muted-foreground">
                  {currentTrack.duration} / {currentTrack.bpm} BPM
                </p>
              </div>
            </div>

            <WaveformPreview active={playingTrackId === currentTrack.id} seed={currentTrack.bpm} className="h-9" />

            <Button size="sm" variant="outline" className="h-9 rounded-none border-primary/60 text-primary">
              License from ${currentTrack.priceFrom}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const TrackRow = ({
  index,
  isPlaying,
  onTogglePlay,
  track,
}: {
  index: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  track: CatalogTrack;
}) => (
  <motion.article
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.035 }}
    className="border-b border-border/45 py-5 last:border-b-0"
  >
    <div className="grid gap-4 md:grid-cols-[2.75rem_minmax(0,1fr)_auto] md:items-center">
      <button
        type="button"
        onClick={onTogglePlay}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/85"
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
      </button>

      <div className="min-w-0">
        <Link
          to={`/track/${track.slug}`}
          className="font-display text-lg tracking-wide text-foreground transition-colors hover:text-primary"
        >
          {track.title}
        </Link>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 font-body text-xs text-muted-foreground">
          <span>{track.genre}</span>
          <span>/</span>
          <span>{track.mood}</span>
          <span>/</span>
          <span>{track.useCase}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 font-body text-sm text-muted-foreground md:justify-end">
        <span>{track.duration}</span>
        <span>{track.bpm} BPM</span>
        <Button size="sm" className="h-9 rounded-none gap-2">
          <Plus className="h-4 w-4" />
          License
        </Button>
      </div>
    </div>

    <WaveformPreview active={isPlaying} seed={track.bpm} bars={120} className="mt-4 h-16" />
  </motion.article>
);

const SelectField = ({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) => (
  <label className="relative block">
    <span className="sr-only">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-none border border-border/70 bg-card/35 px-3 font-body text-sm text-foreground outline-none focus:border-primary"
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
    className={`h-9 border px-3 font-body text-sm transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border/60 bg-transparent text-muted-foreground hover:border-primary/60 hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

export default Catalog;
