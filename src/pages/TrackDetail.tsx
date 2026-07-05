import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Check,
  Download,
  Heart,
  Home,
  Music,
  Pause,
  Play,
  Share2,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import type { CatalogTrack, TrackAudioVersion, TrackVersion } from "@/data/catalogTracks";
import { useTracks } from "@/hooks/useTracks";
import { usePlayer } from "@/components/playerContext";
import { licenseTiers, type LicenseTierId } from "@/lib/licenses";
import { addToCart } from "@/hooks/useCart";
import { downloadTrackVersion } from "@/lib/downloadTrack";

const GOLD = "#F4C430";

type DetailTab = "versions" | "similar";

const TrackDetail = () => {
  const { slug } = useParams();
  const { tracks: catalogTracks } = useTracks();
  const track = catalogTracks.find((item) => item.slug === slug);
  const [activeTab, setActiveTab] = useState<DetailTab>("versions");
  const [selectedVersions, setSelectedVersions] = useState<Record<string, TrackVersion>>({});
  const [selectedTier, setSelectedTier] = useState<LicenseTierId>("personal");
  const [liked, setLiked] = useState(false);
  const { activePlayer, isPlaying, progress, playVersion: playFromEngine } = usePlayer();

  const similarTracks = useMemo(() => {
    if (!track) return [];
    return catalogTracks.filter((item) => item.id !== track.id).slice(0, 4);
  }, [track, catalogTracks]);

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

  const getSelectedVersion = (item: CatalogTrack) =>
    item.audioVersions.find((version) => version.id === selectedVersions[item.id]) ?? item.audioVersions[0];

  const playVersion = (item: CatalogTrack, version: TrackAudioVersion, seekTo: number | null = null) => {
    setSelectedVersions((current) => ({ ...current, [item.id]: version.id }));
    playFromEngine(item, version, seekTo);
  };

  const mainVersion = getSelectedVersion(track);
  const mainIsPlaying = activePlayer?.trackId === track.id && activePlayer.versionId === mainVersion.id && isPlaying;
  const tier = licenseTiers.find((t) => t.id === selectedTier) ?? licenseTiers[0];
  const tags = [track.useCase, track.genre, track.mood, ...track.tags].filter(Boolean).slice(0, 6);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied");
    } catch {
      toast("Copy the link from the address bar");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pt-24 sm:px-6">
        <TrackBreadcrumb trackTitle={track.title} />

        <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* Left: cover + info */}
          <div className="h-fit rounded-xl border border-border bg-card p-6">
            {/* Square cover — real artwork comes with track upload later. */}
            <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br from-secondary via-background to-secondary">
              <Music className="h-16 w-16 text-[#F4C430]/40" />
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 font-body text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                <img src="/logo.svg" alt="" className="h-3.5 w-auto opacity-70" />
                TV Music Store
              </span>
            </div>

            <h1 className="mt-5 font-body text-2xl font-semibold text-foreground">{track.title}</h1>
            <p className="mt-1 font-body text-sm text-muted-foreground">by {track.artist}</p>
            <p className="mt-2 font-body text-xs text-muted-foreground">
              {mainVersion.duration} · {track.bpm} BPM
            </p>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => playVersion(track, mainVersion)}
                aria-label={mainIsPlaying ? "Pause preview" : "Play preview"}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-[#F4C430]"
              >
                {mainIsPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <IconButton
                label={liked ? "Remove from favorites" : "Add to favorites"}
                onClick={() => setLiked((v) => !v)}
              >
                <Heart className="h-4 w-4" style={liked ? { color: GOLD, fill: GOLD } : undefined} />
              </IconButton>
              <IconButton label="Share" onClick={() => void share()}>
                <Share2 className="h-4 w-4" />
              </IconButton>
            </div>

            <button
              type="button"
              onClick={() =>
                void downloadTrackVersion({
                  slug: track.slug,
                  versionId: mainVersion.id,
                  src: mainVersion.src,
                  title: track.title,
                  label: mainVersion.label,
                })
              }
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F4C430] py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
            >
              <Download className="h-4 w-4" />
              Download
            </button>

            <div className="mt-5 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border px-3 py-1 font-body text-xs text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-6 border-t border-border/60 pt-5">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                About the track
              </p>
              <p className="mt-3 font-body text-sm leading-6 text-muted-foreground">{track.description}</p>
            </div>
          </div>

          {/* Right: licenses */}
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {licenseTiers.map((t) => {
                  const active = t.id === selectedTier;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTier(t.id)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        active
                          ? "border-[#F4C430] bg-[#F4C430]/10"
                          : "border-border bg-background/40 hover:border-[#F4C430]/50"
                      }`}
                    >
                      <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t.name}
                      </p>
                      <p className="mt-1.5 font-body text-2xl font-semibold text-foreground">${t.price}</p>
                      <p className="mt-1 font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t.formats}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-border/60 pt-5">
                <p className="font-body text-sm font-semibold text-foreground">Usage Terms</p>
                <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {tier.usageTerms.map((term) => (
                    <li key={term} className="flex items-center gap-2.5 font-body text-sm text-muted-foreground">
                      <Check className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                      {term}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-5">
                <span className="font-body text-3xl font-semibold text-foreground">${tier.price}</span>
                <button
                  type="button"
                  onClick={() =>
                    addToCart({
                      trackId: track.id,
                      slug: track.slug,
                      title: track.title,
                      artist: track.artist,
                      tier: selectedTier,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-[#F4C430] px-6 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add to Cart
                </button>
              </div>
              <p className="mt-3 font-body text-xs text-muted-foreground">
                Unlimited downloads for subscribers —{" "}
                <Link to="/pricing" className="font-semibold text-[#F4C430] hover:underline">
                  see plans
                </Link>
                .
              </p>
            </div>

            {/* Main waveform */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="grid gap-4 md:grid-cols-[3.5rem_minmax(0,1fr)_auto] md:items-center">
                <button
                  type="button"
                  onClick={() => playVersion(track, mainVersion)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                  aria-label={mainIsPlaying ? "Pause preview" : "Play preview"}
                >
                  {mainIsPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                </button>
                <WaveformPreview
                  active={mainIsPlaying}
                  bars={360}
                  onSeek={(nextProgress) => playVersion(track, mainVersion, nextProgress)}
                  progress={
                    activePlayer?.trackId === track.id && activePlayer.versionId === mainVersion.id ? progress : 0
                  }
                  src={mainVersion.src}
                  className="h-16"
                />
                <div className="font-body text-sm text-muted-foreground md:text-right">
                  <div>{mainVersion.label}</div>
                  <div>
                    {mainVersion.duration} / {track.bpm} BPM
                  </div>
                </div>
              </div>
            </div>

            {/* Versions / Similar */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex gap-8 border-b border-border/40">
                <TabButton active={activeTab === "versions"} onClick={() => setActiveTab("versions")}>
                  Versions
                </TabButton>
                <TabButton active={activeTab === "similar"} onClick={() => setActiveTab("similar")}>
                  Similar tracks
                </TabButton>
              </div>

              {activeTab === "versions" && (
                <div>
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
                        version={version}
                      />
                    );
                  })}
                </div>
              )}

              {activeTab === "similar" && (
                <div>
                  {similarTracks.map((item) => {
                    const version = getSelectedVersion(item);
                    const active = activePlayer?.trackId === item.id && activePlayer.versionId === version.id;
                    return (
                      <div key={item.id} className="border-b border-border/40 py-4 last:border-b-0">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <Link
                            to={`/track/${item.slug}`}
                            className="font-body text-sm font-semibold text-foreground transition-colors hover:text-[#F4C430]"
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
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

const IconButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
  >
    {children}
  </button>
);

const TrackBreadcrumb = ({ trackTitle }: { trackTitle: string }) => (
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
    <span className="font-semibold text-foreground">{trackTitle}</span>
  </nav>
);

const TabButton = ({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`border-b py-3.5 font-body text-sm font-semibold uppercase tracking-[0.14em] transition-colors ${
      active
        ? "border-[#F4C430] text-foreground"
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
  version,
}: {
  active: boolean;
  index: number;
  isPlaying: boolean;
  onPlay: () => void;
  onSeek: (progress: number) => void;
  progress: number;
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
    <WaveformPreview active={isPlaying} bars={360} onSeek={onSeek} progress={progress} src={version.src} className="h-9" />
    <span className="font-body text-xs text-muted-foreground">{version.duration}</span>
  </div>
);

export default TrackDetail;
