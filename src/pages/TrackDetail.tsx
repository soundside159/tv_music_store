import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Download,
  Heart,
  Home,
  Pause,
  Play,
  Plus,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import { Button } from "@/components/ui/button";
import { catalogTracks, categoryLabels } from "@/data/catalogTracks";
import type { CatalogTrack, TrackAudioVersion, TrackVersion } from "@/data/catalogTracks";

type ActivePlayer = {
  trackId: string;
  versionId: TrackVersion;
};

type DetailTab = "versions" | "similar" | "license";

const licenseTiers = [
  {
    name: "Free download",
    price: "$0",
    summary: "Personal, non-commercial use. Credit required.",
    note: "Good for testing the catalog and collecting emails later.",
  },
  {
    name: "Online License",
    price: "$39",
    summary: "One online project: YouTube, social, podcasts, websites, and creator videos.",
    note: "No broadcast, TV, cinema, apps, games, or paid ads.",
  },
  {
    name: "Commercial License",
    price: "$99",
    summary: "Client work, brand videos, corporate content, and paid digital ads.",
    note: "Includes Content ID claim help for purchased projects.",
  },
  {
    name: "Broadcast License",
    price: "$299",
    summary: "TV, film, streaming, trailers, games, and broadcast campaigns.",
    note: "Best for agencies, studios, and larger commercial usage.",
  },
];

const TrackDetail = () => {
  const { slug } = useParams();
  const track = catalogTracks.find((item) => item.slug === slug);
  const [activeTab, setActiveTab] = useState<DetailTab>("versions");
  const [activePlayer, setActivePlayer] = useState<ActivePlayer | null>(
    track ? { trackId: track.id, versionId: track.audioVersions[0].id } : null,
  );
  const [selectedVersions, setSelectedVersions] = useState<Record<string, TrackVersion>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);

  const similarTracks = useMemo(() => {
    if (!track) return [];

    return catalogTracks.filter((item) => item.id !== track.id).slice(0, 4);
  }, [track]);

  const currentTrack = catalogTracks.find((item) => item.id === activePlayer?.trackId) ?? track;
  const currentVersion =
    currentTrack?.audioVersions.find((version) => version.id === activePlayer?.versionId) ??
    currentTrack?.audioVersions[0];
  const currentSrc = currentVersion?.src;

  useEffect(() => {
    if (!track) return;

    setActivePlayer({ trackId: track.id, versionId: track.audioVersions[0].id });
    setSelectedVersions({});
    setProgress(0);
    setIsPlaying(false);
  }, [track]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSrc) return;

    audio.load();
  }, [currentSrc]);

  if (!track) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
          <Sparkles className="mb-4 h-8 w-8 text-primary" />
          <h1 className="font-body text-3xl font-semibold text-foreground">Track not found</h1>
          <p className="mt-3 font-body text-sm text-muted-foreground">This track is not in the current catalog.</p>
          <Link
            to="/catalog"
            className="mt-6 rounded-full bg-foreground px-6 py-3 font-body text-sm text-background transition-colors hover:bg-primary"
          >
            Back to catalog
          </Link>
        </main>
      </div>
    );
  }

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

  const getSelectedVersion = (item: CatalogTrack) =>
    item.audioVersions.find((version) => version.id === selectedVersions[item.id]) ?? item.audioVersions[0];

  const playVersion = (item: CatalogTrack, version: TrackAudioVersion, seekTo: number | null = null) => {
    const audio = audioRef.current;
    const sameVersion = activePlayer?.trackId === item.id && activePlayer.versionId === version.id;

    setSelectedVersions((current) => ({ ...current, [item.id]: version.id }));

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
    setActivePlayer({ trackId: item.id, versionId: version.id });

    if (!audio) return;

    audio.src = version.src;
    audio.load();
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  };

  const mainVersion = getSelectedVersion(track);
  const mainIsPlaying = activePlayer?.trackId === track.id && activePlayer.versionId === mainVersion.id && isPlaying;
  const mainProgress = activePlayer?.trackId === track.id && activePlayer.versionId === mainVersion.id ? progress : 0;

  return (
    <div className="min-h-screen bg-background pb-16">
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
        <TrackBreadcrumb trackTitle={track.title} />

        <section className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,54rem)_20rem] xl:justify-center">
          <div className="min-w-0">
            <Link
              to="/catalog"
              className="mb-7 inline-flex items-center gap-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Music library
            </Link>

            <p className="mb-4 font-body text-xs uppercase tracking-[0.24em] text-muted-foreground">
              {categoryLabels[track.category]} / {track.artist}
            </p>
            <h1 className="font-body text-5xl font-semibold tracking-normal text-foreground md:text-7xl">
              {track.title}
            </h1>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 font-body text-sm font-semibold text-muted-foreground">
              <span>{track.genre}</span>
              <span>/</span>
              <span>{track.mood}</span>
              <span>/</span>
              <span>{track.bpm} BPM</span>
            </div>

            <div className="mt-8 border-y border-border/40 py-6">
              <div className="grid gap-4 md:grid-cols-[4.5rem_minmax(0,1fr)_auto] md:items-center">
                <button
                  type="button"
                  onClick={() => playVersion(track, mainVersion)}
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-foreground"
                  aria-label={mainIsPlaying ? "Pause preview" : "Play preview"}
                >
                  {mainIsPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-1 h-5 w-5" />}
                </button>

                <WaveformPreview
                  active={mainIsPlaying}
                  bars={132}
                  onSeek={(nextProgress) => playVersion(track, mainVersion, nextProgress)}
                  progress={mainProgress}
                  src={mainVersion.src}
                  className="h-20"
                />

                <div className="font-body text-sm text-muted-foreground md:text-right">
                  <div>{mainVersion.label}</div>
                  <div>
                    {mainVersion.duration} / {track.bpm} BPM
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-7 max-w-3xl font-body text-base leading-8 text-muted-foreground">
              {track.description}
            </p>

            <div className="mt-12">
              <div className="flex gap-8 border-b border-border/40">
                <TabButton active={activeTab === "versions"} onClick={() => setActiveTab("versions")}>
                  Versions
                </TabButton>
                <TabButton active={activeTab === "similar"} onClick={() => setActiveTab("similar")}>
                  Similar
                </TabButton>
                <TabButton active={activeTab === "license"} onClick={() => setActiveTab("license")}>
                  License Info
                </TabButton>
              </div>

              {activeTab === "versions" && (
                <div className="border-b border-border/40">
                  {track.audioVersions.map((version, index) => {
                    const active = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;

                    return (
                      <TrackVersionRow
                        key={version.id}
                        active={active}
                        index={index}
                        isPlaying={active && isPlaying}
                        onPlay={() => playVersion(track, version)}
                        onSeek={(nextProgress) => playVersion(track, version, nextProgress)}
                        progress={active ? progress : 0}
                        track={track}
                        version={version}
                      />
                    );
                  })}
                </div>
              )}

              {activeTab === "similar" && (
                <div className="border-b border-border/40">
                  {similarTracks.map((item) => {
                    const version = getSelectedVersion(item);
                    const active = activePlayer?.trackId === item.id && activePlayer.versionId === version.id;

                    return (
                      <div key={item.id} className="border-b border-border/40 py-4 last:border-b-0">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <Link
                            to={`/track/${item.slug}`}
                            className="font-body text-sm font-semibold text-foreground transition-colors hover:text-primary"
                          >
                            {item.title}
                          </Link>
                          <span className="font-body text-xs text-muted-foreground">
                            {item.audioVersions.length} versions / {item.bpm} BPM
                          </span>
                        </div>
                        <div className="grid gap-4 md:grid-cols-[2rem_minmax(10rem,16rem)_minmax(0,1fr)_3.5rem] md:items-center">
                          <button
                            type="button"
                            onClick={() => playVersion(item, version)}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label={active && isPlaying ? `Pause ${item.title}` : `Play ${item.title}`}
                          >
                            {active && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </button>
                          <span className="font-body text-sm text-muted-foreground">{version.label}</span>
                          <WaveformPreview
                            active={active && isPlaying}
                            onSeek={(nextProgress) => playVersion(item, version, nextProgress)}
                            progress={active ? progress : 0}
                            src={version.src}
                            className="h-9"
                          />
                          <span className="font-body text-xs text-muted-foreground">{version.duration}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "license" && (
                <div className="border-b border-border/40">
                  {licenseTiers.map((tier) => (
                    <article key={tier.name} className="border-b border-border/40 py-5 last:border-b-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="font-body text-lg font-semibold text-foreground">{tier.name}</h3>
                        <span className="font-body text-sm text-muted-foreground">{tier.price}</span>
                      </div>
                      <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">{tier.summary}</p>
                      <p className="mt-3 font-body text-xs leading-5 text-muted-foreground">{tier.note}</p>
                    </article>
                  ))}
                  <Link
                    to="/"
                    className="inline-flex py-5 font-body text-sm font-semibold text-primary transition-colors hover:text-foreground"
                  >
                    Read full license terms
                  </Link>
                </div>
              )}
            </div>
          </div>

          <aside className="h-fit border-t border-border/40 pt-7 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Get this track
            </p>
            <div className="mt-6 space-y-7">
              <div>
                <h2 className="font-body text-lg font-semibold text-foreground">Preview download</h2>
                <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
                  MP3 preview is available now. Full delivery flow comes with checkout.
                </p>
                <a
                  href={mainVersion.src}
                  download
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-muted font-body text-sm font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background"
                >
                  Download preview
                </a>
              </div>

              <div className="border-t border-border/40 pt-6">
                <h2 className="font-body text-lg font-semibold text-foreground">Commercial Online</h2>
                <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
                  One online project. No credit required.
                </p>
                <Button className="mt-4 h-11 w-full rounded-full">
                  <Plus className="h-4 w-4" />
                  Add license / ${track.priceFrom}
                </Button>
              </div>

              <div className="border-t border-border/40 pt-6">
                <h2 className="font-body text-sm font-semibold text-foreground">Need a custom edit?</h2>
                <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
                  Different length or version without specific instruments is available on request.
                </p>
                <Link to="/#contact" className="mt-3 inline-flex font-body text-sm font-semibold text-primary">
                  Send a brief
                </Link>
              </div>

              <div className="flex items-center gap-4 border-t border-border/40 pt-6 text-muted-foreground">
                <button type="button" className="transition-colors hover:text-foreground" aria-label={`Save ${track.title}`}>
                  <Heart className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="transition-colors hover:text-foreground"
                  aria-label={`Add ${track.title} to cart`}
                >
                  <ShoppingBag className="h-4 w-4" />
                </button>
                <a
                  href={mainVersion.src}
                  download
                  className="transition-colors hover:text-foreground"
                  aria-label={`Download preview for ${track.title}`}
                >
                  <Download className="h-4 w-4" />
                </a>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};

const TrackBreadcrumb = ({ trackTitle }: { trackTitle: string }) => (
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
      <Link to="/catalog" className="transition-colors hover:text-foreground">
        Music Library
      </Link>
      <span>/</span>
      <span className="font-semibold text-foreground">{trackTitle}</span>
    </nav>
  </div>
);

const TabButton = ({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`border-b py-4 font-body text-sm font-semibold uppercase tracking-[0.14em] transition-colors ${
      active
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

const TrackVersionRow = ({
  active,
  index,
  isPlaying,
  onPlay,
  onSeek,
  progress,
  track,
  version,
}: {
  active: boolean;
  index: number;
  isPlaying: boolean;
  onPlay: () => void;
  onSeek: (progress: number) => void;
  progress: number;
  track: CatalogTrack;
  version: TrackAudioVersion;
}) => (
  <div className="grid gap-4 border-b border-border/40 py-4 last:border-b-0 md:grid-cols-[2rem_minmax(10rem,16rem)_minmax(0,1fr)_3.5rem] md:items-center">
    <button
      type="button"
      onClick={onPlay}
      className="text-muted-foreground transition-colors hover:text-foreground"
      aria-label={isPlaying ? `Pause ${version.label}` : `Play ${version.label}`}
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
    <span className={`font-body text-sm ${active ? "text-foreground" : "text-muted-foreground"}`}>
      {index + 1}. {version.label}
    </span>
    <WaveformPreview
      active={isPlaying}
      onSeek={onSeek}
      progress={progress}
      src={version.src}
      className="h-9"
    />
    <span className="font-body text-xs text-muted-foreground">{version.duration}</span>
  </div>
);

export default TrackDetail;
