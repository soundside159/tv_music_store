import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface WaveformPreviewProps {
  active?: boolean;
  /** @deprecated bar count is now computed from the container width. */
  bars?: number;
  className?: string;
  durationRatio?: number;
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

// Bars have a FIXED on-screen width; the bar COUNT adapts to the container,
// so resizing the window re-buckets the waveform instead of stretching bars.
const BAR_STEP = 4; // px per bar slot (bar + gap)
const BAR_WIDTH = 3; // px bar thickness
const MIN_BARS = 16;

// FIFO queue with limited concurrency: rows mount top-to-bottom, so loading
// them in mount order makes waveforms appear top-down instead of randomly.
const QUEUE_CONCURRENCY = 4;
let activeLoads = 0;
const loadQueue: (() => void)[] = [];

const pumpQueue = () => {
  while (activeLoads < QUEUE_CONCURRENCY && loadQueue.length > 0) {
    const next = loadQueue.shift();
    if (!next) return;
    activeLoads += 1;
    next();
  }
};

const enqueueLoad = <T,>(work: () => Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    loadQueue.push(() => {
      work()
        .then(resolve, reject)
        .finally(() => {
          activeLoads -= 1;
          pumpQueue();
        });
    });
    pumpQueue();
  });

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

  const promise = enqueueLoad(() =>
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load waveform audio: ${src}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        const context = getAudioContext();
        if (!context) throw new Error("Web Audio API is not available");
        return context.decodeAudioData(buffer.slice(0));
      }),
  );

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
      let squaredSum = 0;
      let sampleCount = 0;

      for (let channel = 0; channel < channelCount; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let sample = start; sample < end; sample += sampleStep) {
          const value = Math.abs(data[sample] ?? 0);
          peak = Math.max(peak, value);
          squaredSum += value * value;
          sampleCount += 1;
        }
      }

      const rms = Math.sqrt(squaredSum / Math.max(1, sampleCount));
      return peak * 0.72 + rms * 0.28;
    });

    const maxPeak = Math.max(...peaks, 0.001);
    return peaks.map((peak) => Math.max(0.05, peak / maxPeak));
  });

  peaksCache.set(cacheKey, promise);
  return promise;
};

const WaveformPreview = ({
  active = false,
  className,
  durationRatio = 1,
  onSeek,
  progress = 0,
  seed = 0,
  src,
}: WaveformPreviewProps) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [barCount, setBarCount] = useState(0);

  // Measure the (duration-scaled) inner container and derive the bar count.
  // Width is quantized to 20px so window dragging doesn't recompute per pixel.
  useEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width <= 0) return;
      const quantized = Math.max(MIN_BARS * BAR_STEP, Math.round(width / 20) * 20);
      setBarCount(Math.round(quantized / BAR_STEP));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fallbackPeaks = useMemo(
    () =>
      barCount > 0
        ? Array.from({ length: barCount }, (_, index) => (18 + ((index * 17 + seed * 7) % 68)) / 100)
        : null,
    [barCount, seed],
  );
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (barCount <= 0) return;

    if (!src) {
      setPeaks(fallbackPeaks);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    getPeaks(src, barCount)
      .then((nextPeaks) => {
        if (!cancelled) {
          setPeaks(nextPeaks);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPeaks(Array.from({ length: barCount }, () => 0.08));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [barCount, fallbackPeaks, src]);

  const safeDurationRatio = Math.max(0.08, Math.min(1, durationRatio));

  const seekFromClientX = (clientX: number, element: HTMLDivElement) => {
    if (!onSeek) return;

    const rect = element.getBoundingClientRect();
    const nextProgress = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    onSeek(Math.max(0, Math.min(1, nextProgress)));
  };

  return (
    <div
      className={cn(
        "relative h-14 w-full overflow-hidden text-foreground",
        className,
      )}
    >
      <div
        ref={innerRef}
        className={cn("relative h-full overflow-hidden", onSeek && "cursor-pointer")}
        style={{ width: `${safeDurationRatio * 100}%` }}
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
        {isLoading || !peaks ? (
          <div className="absolute inset-0 overflow-hidden rounded-sm bg-foreground/[0.04]">
            <div className="waveform-loading-scan h-full w-1/3 bg-gradient-to-r from-transparent via-[#F4C430]/40 to-transparent" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-foreground/10" />
          </div>
        ) : (
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${peaks.length * BAR_STEP} 100`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              x1="0"
              x2={peaks.length * BAR_STEP}
              y1="50"
              y2="50"
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {peaks.map((peak, index) => {
              const position = index / Math.max(1, peaks.length - 1);
              const played = progress > 0 && position <= progress;
              // Tunetank-style states: idle rows are dim grey, the selected
              // (playing) track brightens smoothly, played part is solid gold.
              const color = played ? "#F4C430" : "currentColor";
              // Unplayed grey: darker when idle (0.18) and only moderately lit
              // when the track is playing (0.42) — was too bright at 0.62/0.3.
              const opacity = played ? 1 : active ? 0.42 : 0.18;
              const height = Math.max(6, peak * 86);
              const center = 50;
              const x = index * BAR_STEP + BAR_STEP / 2;

              return (
                <line
                  key={index}
                  x1={x}
                  x2={x}
                  y1={center - height / 2}
                  y2={center + height / 2}
                  stroke={color}
                  strokeOpacity={opacity}
                  strokeWidth={BAR_WIDTH}
                  style={{ transition: "stroke-opacity 0.35s ease, stroke 0.35s ease" }}
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};

export default WaveformPreview;
