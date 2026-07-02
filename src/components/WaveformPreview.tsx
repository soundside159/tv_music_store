import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface WaveformPreviewProps {
  active?: boolean;
  bars?: number;
  className?: string;
  onSeek?: (progress: number) => void;
  progress?: number;
  seed?: number;
  src?: string;
}

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | null = null;
const audioBufferCache = new Map<string, Promise<AudioBuffer>>();
const peaksCache = new Map<string, Promise<number[]>>();

const getAudioContext = () => {
  if (sharedAudioContext) return sharedAudioContext;

  const AudioContextConstructor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  sharedAudioContext = new AudioContextConstructor();
  return sharedAudioContext;
};

const getAudioBuffer = (src: string) => {
  const cached = audioBufferCache.get(src);
  if (cached) return cached;

  const promise = fetch(src)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load waveform audio: ${src}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      const context = getAudioContext();
      if (!context) throw new Error("Web Audio API is not available");
      return context.decodeAudioData(buffer.slice(0));
    });

  audioBufferCache.set(src, promise);
  return promise;
};

const getPeaks = (src: string, bars: number) => {
  const cacheKey = `${src}:${bars}`;
  const cached = peaksCache.get(cacheKey);
  if (cached) return cached;

  const promise = getAudioBuffer(src).then((buffer) => {
    const length = buffer.length;
    const channelCount = Math.min(buffer.numberOfChannels, 2);
    const peaks = Array.from({ length: bars }, (_, index) => {
      const start = Math.floor((index / bars) * length);
      const end = Math.max(start + 1, Math.floor(((index + 1) / bars) * length));
      const sampleStep = Math.max(1, Math.floor((end - start) / 120));
      let peak = 0;

      for (let channel = 0; channel < channelCount; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let sample = start; sample < end; sample += sampleStep) {
          peak = Math.max(peak, Math.abs(data[sample] ?? 0));
        }
      }

      return peak;
    });

    const maxPeak = Math.max(...peaks, 0.001);
    return peaks.map((peak) => Math.max(0.08, peak / maxPeak));
  });

  peaksCache.set(cacheKey, promise);
  return promise;
};

const WaveformPreview = ({
  active = false,
  bars = 96,
  className,
  onSeek,
  progress = 0,
  seed = 0,
  src,
}: WaveformPreviewProps) => {
  const fallbackPeaks = useMemo(
    () => Array.from({ length: bars }, (_, index) => (18 + ((index * 17 + seed * 7) % 68)) / 100),
    [bars, seed],
  );
  const [peaks, setPeaks] = useState(fallbackPeaks);

  useEffect(() => {
    let cancelled = false;

    if (!src) {
      setPeaks(fallbackPeaks);
      return;
    }

    getPeaks(src, bars)
      .then((nextPeaks) => {
        if (!cancelled) setPeaks(nextPeaks);
      })
      .catch(() => {
        if (!cancelled) setPeaks(fallbackPeaks);
      });

    return () => {
      cancelled = true;
    };
  }, [bars, fallbackPeaks, src]);

  const seekFromClientX = (clientX: number, element: HTMLDivElement) => {
    if (!onSeek) return;

    const rect = element.getBoundingClientRect();
    const nextProgress = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    onSeek(Math.max(0, Math.min(1, nextProgress)));
  };

  return (
    <div
      className={cn(
        "flex h-14 w-full items-center gap-0.5 overflow-hidden",
        onSeek && "cursor-pointer",
        className,
      )}
      role={onSeek ? "slider" : undefined}
      tabIndex={onSeek ? 0 : undefined}
      aria-label={onSeek ? "Seek preview" : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
      onClick={(event) => seekFromClientX(event.clientX, event.currentTarget)}
      onKeyDown={(event) => {
        if (!onSeek) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSeek(progress);
        }
      }}
    >
      {peaks.map((peak, index) => {
        const played = progress > 0 && index / Math.max(1, peaks.length - 1) <= progress;

        return (
          <span
            key={index}
            className={cn(
              "w-full min-w-px rounded-full transition-colors",
              played ? "bg-primary" : active ? "bg-foreground/40" : "bg-foreground/25",
            )}
            style={{ height: `${Math.round(peak * 100)}%` }}
          />
        );
      })}
    </div>
  );
};

export default WaveformPreview;
