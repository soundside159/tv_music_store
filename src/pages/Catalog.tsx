import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Filter,
  Pause,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalogTracks, categoryLabels, CatalogTrack, TrackCategory, TrackVersion } from "@/data/catalogTracks";

const versionLabels: Record<TrackVersion, string> = {
  full: "Full",
  "60s": "60s",
  "30s": "30s",
  "15s": "15s",
  loop: "Loop",
  stems: "Stems",
};

const categories: Array<{ value: "all" | TrackCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "modern-score", label: "Modern Score" },
  { value: "thriller", label: "Thriller" },
  { value: "game-ost", label: "Game OST" },
  { value: "production", label: "Production" },
];

const moods = ["All", "Hopeful", "Dark", "Heroic", "Urgent", "Confident", "Investigative"];

const bpmRanges = [
  { label: "Any BPM", min: 0, max: Infinity },
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
  const [stemsOnly, setStemsOnly] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(catalogTracks[0]?.id ?? null);
  const [selectedVersions, setSelectedVersions] = useState<Record<string, TrackVersion>>({});

  const filteredTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return catalogTracks.filter((track) => {
      const matchesCategory = category === "all" || track.category === category;
      const matchesMood = mood === "All" || track.mood === mood;
      const matchesBpm = track.bpm >= bpmRange.min && track.bpm <= bpmRange.max;
      const matchesStems = !stemsOnly || track.hasStems;
      const matchesQuery =
        !normalizedQuery ||
        [track.title, track.genre, track.mood, track.useCase, track.styleOf, track.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesMood && matchesBpm && matchesStems && matchesQuery;
    });
  }, [bpmRange, category, mood, query, stemsOnly]);

  const currentTrack = catalogTracks.find((track) => track.id === playingTrackId) ?? filteredTracks[0];

  const togglePlay = (trackId: string) => {
    setPlayingTrackId((current) => (current === trackId ? null : trackId));
  };

  const getSelectedVersion = (track: CatalogTrack) => selectedVersions[track.id] ?? track.versions[0];

  const setVersion = (track: CatalogTrack, version: TrackVersion) => {
    setSelectedVersions((current) => ({ ...current, [track.id]: version }));
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navigation />

      <main className="pt-24 md:pt-28">
        <section className="border-b border-border/50 bg-card/25">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
            <Link
              to="/"
              className="inline-flex w-fit items-center gap-2 font-body text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to cinema landing
            </Link>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
              <div>
                <p className="mb-2 font-body text-xs uppercase tracking-[0.28em] text-primary">
                  Boutique cinematic licensing
                </p>
                <h1 className="font-display text-3xl tracking-wide text-foreground md:text-5xl">
                  Music Catalog
                </h1>
                <p className="mt-4 max-w-3xl font-body text-sm leading-6 text-muted-foreground md:text-base">
                  Browse cinematic tracks by category, mood, use-case, tempo, and available versions. This is the
                  first MVP catalog shell before D1, R2, Stripe, and the admin panel are connected.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 border border-border/50 bg-background/60 p-4">
                <Metric label="Tracks" value={catalogTracks.length.toString()} />
                <Metric label="Free" value={catalogTracks.filter((track) => track.isFree).length.toString()} />
                <Metric label="Stems" value={catalogTracks.filter((track) => track.hasStems).length.toString()} />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:px-8">
          <aside className="h-fit border border-border/50 bg-card/60 p-4">
            <div className="mb-5 flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base tracking-wide text-foreground">Filters</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="catalog-search" className="mb-2 block font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="catalog-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="thriller, trailer, piano..."
                    className="h-11 rounded-none border-border/70 bg-background/70 pl-9"
                  />
                </div>
              </div>

              <FilterGroup label="Category">
                <div className="grid grid-cols-1 gap-2">
                  {categories.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setCategory(item.value)}
                      className={`h-10 border px-3 text-left font-body text-sm transition-colors ${
                        category === item.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 bg-background/50 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup label="Mood">
                <select
                  value={mood}
                  onChange={(event) => setMood(event.target.value)}
                  className="h-11 w-full border border-border/70 bg-background/70 px-3 font-body text-sm text-foreground outline-none focus:border-primary"
                >
                  {moods.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </FilterGroup>

              <FilterGroup label="Tempo">
                <div className="grid grid-cols-2 gap-2">
                  {bpmRanges.map((range) => (
                    <button
                      key={range.label}
                      type="button"
                      onClick={() => setBpmRange(range)}
                      className={`h-10 border px-3 font-body text-sm transition-colors ${
                        bpmRange.label === range.label
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 bg-background/50 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </FilterGroup>

              <label className="flex min-h-11 cursor-pointer items-center justify-between border border-border/60 bg-background/50 px-3">
                <span className="font-body text-sm text-foreground">Stems available</span>
                <input
                  type="checkbox"
                  checked={stemsOnly}
                  onChange={(event) => setStemsOnly(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 border border-border/50 bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <span className="font-body text-sm text-foreground">
                  {filteredTracks.length} tracks found
                </span>
              </div>
              <p className="font-body text-xs text-muted-foreground">
                Search logging, zero-result reports, and D1-backed filters come in the backend phase.
              </p>
            </div>

            <div className="space-y-3">
              {filteredTracks.map((track, index) => {
                const isPlaying = playingTrackId === track.id;
                const selectedVersion = getSelectedVersion(track);

                return (
                  <motion.article
                    key={track.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className={`border bg-card/70 p-4 transition-colors ${
                      isPlaying ? "border-primary/80" : "border-border/50 hover:border-primary/50"
                    }`}
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-center">
                      <div className="flex min-w-0 gap-4">
                        <button
                          type="button"
                          onClick={() => togglePlay(track.id)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/85"
                          aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                        >
                          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/track/${track.slug}`}
                              className="font-display text-lg tracking-wide text-foreground transition-colors hover:text-primary"
                            >
                              {track.title}
                            </Link>
                            {track.isFree && <Tag>Free tier</Tag>}
                            {track.hasStems && <Tag>Stems</Tag>}
                          </div>
                          <p className="mt-1 font-body text-sm text-muted-foreground">{track.description}</p>

                          <div className="mt-3 flex flex-wrap gap-2 font-body text-xs text-muted-foreground">
                            <span>{categoryLabels[track.category]}</span>
                            <span>/</span>
                            <span>{track.genre}</span>
                            <span>/</span>
                            <span>{track.mood}</span>
                            <span>/</span>
                            <span>{track.bpm} BPM</span>
                            <span>/</span>
                            <span>{track.duration}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex h-9 items-end gap-1 overflow-hidden" aria-hidden="true">
                          {Array.from({ length: 36 }).map((_, barIndex) => (
                            <span
                              key={barIndex}
                              className={`w-full min-w-1 bg-primary/60 ${isPlaying ? "opacity-100" : "opacity-35"}`}
                              style={{ height: `${24 + ((barIndex * 17 + track.bpm) % 58)}%` }}
                            />
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {track.versions.map((version) => (
                            <button
                              key={version}
                              type="button"
                              onClick={() => setVersion(track, version)}
                              className={`h-8 border px-2.5 font-body text-xs transition-colors ${
                                selectedVersion === version
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border/60 bg-background/50 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                              }`}
                            >
                              {versionLabels[version]}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <span className="font-body text-sm text-muted-foreground">
                            from <span className="text-foreground">${track.priceFrom}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/track/${track.slug}`}
                              className="inline-flex h-9 items-center gap-1.5 border border-primary/50 px-3 font-body text-xs text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                            >
                              Details
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Button size="sm" className="h-9 rounded-none gap-2">
                              <Plus className="h-4 w-4" />
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>

            {filteredTracks.length === 0 && (
              <div className="border border-border/50 bg-card/60 p-8 text-center">
                <Sparkles className="mx-auto mb-3 h-6 w-6 text-primary" />
                <h3 className="font-display text-xl text-foreground">No tracks found</h3>
                <p className="mx-auto mt-2 max-w-md font-body text-sm text-muted-foreground">
                  In the live version this search will be logged for the admin dashboard, so missing demand becomes new
                  track direction.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {currentTrack && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/95 backdrop-blur-md">
          <div className="mx-auto flex min-h-20 w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center lg:px-8">
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
                <p className="truncate font-body text-sm text-foreground">{currentTrack.title}</p>
                <p className="truncate font-body text-xs text-muted-foreground">
                  {currentTrack.useCase} / {getSelectedVersion(currentTrack).toUpperCase()}
                </p>
              </div>
            </div>

            <div className="flex h-8 min-w-0 flex-1 items-end gap-1 overflow-hidden">
              {Array.from({ length: 80 }).map((_, index) => (
                <span
                  key={index}
                  className="w-full min-w-1 bg-primary/50"
                  style={{ height: `${20 + ((index * 13 + currentTrack.bpm) % 62)}%` }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 md:justify-end">
              <span className="font-body text-xs text-muted-foreground">0:00 / {currentTrack.duration}</span>
              <Button size="sm" variant="outline" className="h-9 rounded-none border-primary/60 text-primary">
                License from ${currentTrack.priceFrom}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="text-center">
    <div className="font-display text-xl text-primary">{value}</div>
    <div className="mt-1 font-body text-[0.65rem] uppercase tracking-widest text-muted-foreground">{label}</div>
  </div>
);

const FilterGroup = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <div className="mb-2 font-body text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
    {children}
  </div>
);

const Tag = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-6 items-center border border-primary/40 bg-primary/10 px-2 font-body text-[0.68rem] uppercase tracking-widest text-primary">
    <Star className="mr-1 h-3 w-3" />
    {children}
  </span>
);

export default Catalog;
