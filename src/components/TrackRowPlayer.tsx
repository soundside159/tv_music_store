import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Download, Heart, Pause, Play, ShoppingCart } from "lucide-react";
import { downloadTrackVersion } from "@/lib/downloadTrack";
import WaveformPreview from "@/components/WaveformPreview";
import type { CatalogTrack, TrackAudioVersion, TrackVersion } from "@/data/catalogTracks";
import { usePlayer } from "@/components/playerContext";

// Shared track-row player pieces. Single source of truth for how a track row
// looks and plays everywhere (catalog, homepage trending, artist pages).

export type ActivePlayer = {
  trackId: string;
  versionId: TrackVersion;
};

export const splitFilterValues = (value: string) =>
  value.split("/").map((item) => item.trim()).filter(Boolean);

export const durationToSeconds = (duration: string) => {
  const parts = duration.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
};

export const getDurationRatio = (track: CatalogTrack, version: TrackAudioVersion) => {
  const trackSeconds = durationToSeconds(track.duration);
  const versionSeconds = durationToSeconds(version.duration);
  if (!trackSeconds || !versionSeconds) return 1;
  return Math.min(1, Math.max(0.08, versionSeconds / trackSeconds));
};

export const formatClock = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Perceptual volume: slider 0.8 = unity (100%), below fades correctly, above boosts a bit.
export const sliderToGain = (value: number) => {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.min(2, (clamped / 0.8) ** 2);
};

export const pickTag = (value: string, seed: number) => {
  const options = splitFilterValues(value);
  if (options.length === 0) return null;
  return options[seed % options.length];
};

export const PlayProgressRing = ({ progress }: { progress: number }) => {
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
        stroke="#F4C430"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
  );
};

export const ActionIcon = ({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="group/act relative flex items-center justify-center text-muted-foreground transition-colors duration-200 hover:text-[#F4C430]"
  >
    <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-card px-2 py-1 font-body text-[11px] text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/act:opacity-100">
      {label}
    </span>
    {children}
  </button>
);

export const TrackRow = ({
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

  // Fixed tag order: 1 = Use Case, 2 = Genre, 3 = Mood. Each links to the
  // catalog with only that filter active.
  const firstOf = (value: string) => splitFilterValues(value)[0] ?? null;
  const rowTags = [
    { param: "usecase", label: firstOf(track.useCase) },
    { param: "genre", label: firstOf(track.genre) },
    { param: "mood", label: firstOf(track.mood) },
  ]
    .filter((t): t is { param: string; label: string } => Boolean(t.label))
    .map((t) => ({ label: t.label, to: `/catalog?${t.param}=${encodeURIComponent(t.label)}` }));

  return (
  <motion.article
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, delay: 0.55 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    className="border-b border-border/30 last:border-b-0"
  >
    <div className="music-track-grid grid gap-2.5 rounded-lg px-4 py-3 transition-colors duration-150 hover:bg-foreground/[0.04] xl:items-center">
      <button
        type="button"
        onClick={() => onPlayVersion(track, selectedVersion)}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
          mainIsPlaying ? "border-transparent text-[#F4C430]" : "border-border/70 text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
        }`}
        aria-label={mainIsPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {mainIsPlaying && <PlayProgressRing progress={versionProgress(selectedVersion.id)} />}
        {mainIsPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <Link
        to={`/track/${track.slug}`}
        className={`min-w-0 truncate whitespace-nowrap font-body text-sm font-medium transition-colors ${
          mainIsPlaying ? "text-[#F4C430]" : "text-foreground hover:text-[#F4C430]"
        }`}
      >
        {track.title}
      </Link>

      <div className="hidden min-w-0 items-center gap-2 overflow-hidden xl:flex">
        {rowTags.map((tag) => (
          <Link
            key={tag.to}
            to={tag.to}
            className="whitespace-nowrap rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-body text-xs text-muted-foreground transition-colors duration-200 hover:border-[#F4C430]/60 hover:text-[#F4C430]"
          >
            {tag.label}
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggleExpanded}
        className={`group/ver relative hidden justify-self-center whitespace-nowrap px-1 py-1 font-body text-xs tabular-nums transition-colors duration-200 xl:block ${
          expanded
            ? "text-foreground underline decoration-[#F4C430] decoration-2 underline-offset-4"
            : "text-foreground hover:text-[#F4C430]"
        }`}
      >
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-card px-2 py-1 font-body text-[11px] text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/ver:opacity-100">
          Versions
        </span>
        +{track.audioVersions.length - 1}
      </button>

      <WaveformPreview
        active={mainIsPlaying}
        bars={420}
        durationRatio={1}
        onSeek={(nextProgress) => onPlayVersion(track, selectedVersion, nextProgress)}
        progress={versionProgress(selectedVersion.id)}
        src={selectedVersion.src}
        className="hidden h-9 min-w-0 md:block"
      />

      <span className={`hidden justify-self-end font-body text-sm tabular-nums md:block ${mainIsPlaying ? "text-[#F4C430]" : "text-muted-foreground"}`}>
        {selectedVersion.duration}
      </span>
      <span className={`hidden justify-self-end whitespace-nowrap font-body text-sm tabular-nums xl:block ${mainIsPlaying ? "text-[#F4C430]" : "text-muted-foreground"}`}>
        {track.bpm} BPM
      </span>
      <div className="flex items-center justify-end gap-3 text-muted-foreground">
        <ActionIcon label="Favorite">
          <Heart className="h-5 w-5 stroke-[1.6]" />
        </ActionIcon>
        <span className="hidden xl:contents">
          <ActionIcon label="Similar Tracks">
            <Copy className="h-5 w-5 stroke-[1.6]" />
          </ActionIcon>
        </span>
        <ActionIcon label="Buy License">
          <ShoppingCart className="h-5 w-5 stroke-[1.6]" />
        </ActionIcon>
        <ActionIcon
          label="Download"
          onClick={() =>
            void downloadTrackVersion({
              slug: track.slug,
              versionId: selectedVersion.id,
              src: selectedVersion.src,
              title: track.title,
              label: selectedVersion.label,
            })
          }
        >
          <Download className="h-5 w-5 stroke-[1.6]" />
        </ActionIcon>
      </div>
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
                  className="music-track-grid grid gap-2.5 px-4 py-1.5 xl:items-center"
                >
                  <div className="hidden xl:block" />
                  <button
                    type="button"
                    onClick={() => onPlayVersion(track, version)}
                    className="flex min-w-0 items-center gap-3 text-left font-body text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  >
                    <span
                      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                        active && globalIsPlaying ? "border-transparent text-[#F4C430]" : "border-border/60"
                      }`}
                    >
                      {active && globalIsPlaying && <PlayProgressRing progress={versionProgress(version.id)} />}
                      {active && globalIsPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                    </span>
                    <span className={`truncate ${active && globalIsPlaying ? "text-[#F4C430]" : active ? "text-foreground" : undefined}`}>{version.label}</span>
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
                  <span className={`justify-self-end font-body text-sm ${active ? "text-[#F4C430]" : "text-muted-foreground"}`}>
                    {version.duration}
                  </span>
                  <div className="hidden xl:block" />
                  <div className="flex items-center justify-end gap-4 text-muted-foreground">
                    <ActionIcon label="Buy License">
                      <ShoppingCart className="h-5 w-5 stroke-[1.6]" />
                    </ActionIcon>
                    <ActionIcon
                      label="Download"
                      onClick={() =>
                        void downloadTrackVersion({
                          slug: track.slug,
                          versionId: version.id,
                          src: version.src,
                          title: track.title,
                          label: version.label,
                        })
                      }
                    >
                      <Download className="h-5 w-5 stroke-[1.6]" />
                    </ActionIcon>
                  </div>
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

// ---------------------------------------------------------------------------
// Self-contained audio engine for embedding track rows outside the catalog
// (homepage trending, artist pages). Mirrors the catalog playback behavior.
// ---------------------------------------------------------------------------

export const useTrackAudioEngine = () => {
  const [activePlayer, setActivePlayer] = useState<ActivePlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playedProgress, setPlayedProgress] = useState<Record<string, number>>({});
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [activeTrack, setActiveTrack] = useState<CatalogTrack | null>(null);
  const [activeVersion, setActiveVersion] = useState<TrackAudioVersion | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = sliderToGain(volume);
    } else if (audioRef.current) {
      audioRef.current.volume = Math.min(1, sliderToGain(volume));
    }
  }, [volume]);

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
    ensureAudioGraph();
    setActiveTrack(track);
    setActiveVersion(version);
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

  const audioElement = (
    <audio
      ref={audioRef}
      preload="metadata"
      onLoadedMetadata={(event) => applyPendingStart(event.currentTarget)}
      onTimeUpdate={(event) => {
        const audio = event.currentTarget;
        if (audio.seeking || pendingSeekRef.current !== null) return;
        const nextProgress = audio.duration ? audio.currentTime / audio.duration : 0;
        setProgress(nextProgress);
        if (activePlayer) {
          setPlayedProgress((prev) => ({
            ...prev,
            [`${activePlayer.trackId}:${activePlayer.versionId}`]: nextProgress,
          }));
        }
      }}
      onEnded={() => {
        setIsPlaying(false);
        setProgress(0);
        if (activePlayer) {
          setPlayedProgress((prev) => ({
            ...prev,
            [`${activePlayer.trackId}:${activePlayer.versionId}`]: 1,
          }));
        }
      }}
    />
  );

  return {
    activePlayer,
    activeTrack,
    activeVersion,
    audioElement,
    expandedTrackId,
    isPlaying,
    playVersion,
    playedProgress,
    progress,
    setExpandedTrackId,
    setVolume,
    volume,
  };
};

export type PlayerEngine = ReturnType<typeof useTrackAudioEngine>;

/** Drop-in track list with full playback — visually identical to the catalog rows. */
export const TrackRowList = ({ tracks }: { tracks: CatalogTrack[] }) => {
  const engine = usePlayer();

  return (
    <div className="rounded-lg border border-border/30 bg-card/25">
      {tracks.map((track, index) => {
        const mainVersion = track.audioVersions[0];
        const expanded = engine.expandedTrackId === track.id;
        const mainIsPlaying =
          engine.activePlayer?.trackId === track.id &&
          engine.activePlayer.versionId === mainVersion.id &&
          engine.isPlaying;

        return (
          <TrackRow
            key={track.id}
            activePlayer={engine.activePlayer}
            expanded={expanded}
            globalIsPlaying={engine.isPlaying}
            globalProgress={engine.progress}
            index={index}
            mainIsPlaying={mainIsPlaying}
            onPlayVersion={engine.playVersion}
            onToggleExpanded={() => engine.setExpandedTrackId(expanded ? null : track.id)}
            playedProgress={engine.playedProgress}
            selectedVersion={mainVersion}
            track={track}
          />
        );
      })}
    </div>
  );
};
