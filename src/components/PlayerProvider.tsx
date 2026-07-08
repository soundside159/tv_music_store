import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Download, Heart, Pause, Play, ShoppingCart, Volume2 } from "lucide-react";
import { openDownloadOptions } from "@/lib/downloadTrack";
import { openLicenseModal } from "@/hooks/useCart";
import { toggleFavourite, useFavourites } from "@/lib/favourites";
import WaveformPreview from "@/components/WaveformPreview";
import {
  ActionIcon,
  PlayProgressRing,
  durationToSeconds,
  formatClock,
  useTrackAudioEngine,
} from "@/components/TrackRowPlayer";
import { PlayerContext } from "@/components/playerContext";

export { usePlayer } from "@/components/playerContext";

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const engine = useTrackAudioEngine();
  const { isPlaying, progress, playVersion, volume, setVolume } = engine;
  const currentTrack = engine.activeTrack;
  const currentVersion = engine.activeVersion;
  const favIds = useFavourites();

  return (
    <PlayerContext.Provider value={engine}>
      {engine.audioElement}
      {children}
      {currentTrack && currentVersion && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-card/95 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="mx-auto grid min-h-16 w-full max-w-7xl gap-3 px-4 py-3 sm:px-6 md:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)_auto] md:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => playVersion(currentTrack, currentVersion)}
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isPlaying ? "border-transparent" : "border-border/70 hover:border-[#F4C430]"
                }`}
                aria-label={isPlaying ? "Pause current track" : "Play current track"}
              >
                {isPlaying && <PlayProgressRing progress={progress} />}
                {isPlaying ? <Pause className="h-4 w-4 text-[#F4C430]" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <div className="min-w-0">
                <Link
                  to={`/track/${currentTrack.slug}`}
                  className={`block truncate font-body text-sm font-medium transition-colors ${
                    isPlaying ? "text-[#F4C430]" : "text-foreground hover:text-[#F4C430]"
                  }`}
                >
                  {currentTrack.title}
                </Link>
                <p className="truncate font-body text-xs text-muted-foreground">{currentVersion.label}</p>
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
                  className="h-1 w-20 cursor-pointer accent-[#F4C430]"
                  aria-label="Volume"
                />
              </div>
              <div className="flex items-center gap-5 text-muted-foreground">
                <ActionIcon
                  label={favIds.has(currentTrack.id) ? "Remove from favourites" : "Favorite"}
                  onClick={() => void toggleFavourite(currentTrack.id)}
                >
                  <Heart
                    className={`h-5 w-5 stroke-[1.6] ${
                      favIds.has(currentTrack.id) ? "fill-[#F4C430] text-[#F4C430]" : ""
                    }`}
                  />
                </ActionIcon>
                <ActionIcon
                  label="Buy License"
                  onClick={() =>
                    openLicenseModal({
                      trackId: currentTrack.id,
                      slug: currentTrack.slug,
                      title: currentTrack.title,
                      artist: currentTrack.artist,
                      cover: currentTrack.cover,
                    })
                  }
                >
                  <ShoppingCart className="h-5 w-5 stroke-[1.6]" />
                </ActionIcon>
                <ActionIcon
                  label="Download"
                  onClick={() =>
                    openDownloadOptions({
                      slug: currentTrack.slug,
                      versionId: currentVersion.id,
                      src: currentVersion.src,
                      title: currentTrack.title,
                      label: currentVersion.label,
                      hasStems: currentTrack.hasStems,
                    })
                  }
                >
                  <Download className="h-5 w-5 stroke-[1.6]" />
                </ActionIcon>
              </div>
            </div>
          </div>
        </div>
      )}
    </PlayerContext.Provider>
  );
};
