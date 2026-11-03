import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { currentSessionRole } from "@/hooks/useAuth";

interface WaveformPreviewProps {
  active?: boolean;
  /** @deprecated bar count is now computed from the container width. */
  bars?: number;
  className?: string;
  durationRatio?: number;
  /** Minimum time the "loading" scan bar stays on screen, even when the peaks
   *  are already cached and resolve instantly. Lets a whole list flash the same
   *  fresh-load animation when it (re)mounts on a filter/theme switch, instead
   *  of already-seen rows snapping in with no shimmer. 0 = show as soon as ready. */
  minLoadingMs?: number;
  /** Change this to REPLAY the loading scan without remounting the row. On a
   *  filter/theme switch React often reuses the row (same track id in both
   *  lists), so a key-based remount never fires and the cached waveform snapped
   *  in instantly. Bumping reloadKey re-runs the load effect → the scan shows
   *  again for minLoadingMs, cached or not. */
  reloadKey?: string | number;
  onSeek?: (progress: number) => void;
  progress?: number;
  seed?: number;
  src?: string;
}

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | null = null;
// MEMORY: the decoded AudioBuffer used to be cached per track forever — a
// 3-minute preview decodes to ~65 MB of float samples, so scrolling the
// catalogue grew the tab to several GB. Now only a tiny PROFILE (PROFILE_POINTS
// peak/rms pairs) is kept: in memory and in localStorage, so a returning
// visitor doesn't even re-download the mp3. The audio is decoded at a low
// sample rate and dropped right after the profile is taken.
type Profile = { peak: Float32Array; rms: Float32Array };
const profileCache = new Map<string, Promise<Profile>>();
const PROFILE_POINTS = 512;
const DECODE_RATE = 8000; // plenty for a 100-400 bar picture
const STORE_PREFIX = "wf1:";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

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

/** Decode at a low sample rate (smaller + faster); full-rate context as fallback. */
const decodeSmall = async (data: ArrayBuffer): Promise<AudioBuffer> => {
  try {
    const Offline = window.OfflineAudioContext;
    if (Offline) return await new Offline(1, 1, DECODE_RATE).decodeAudioData(data.slice(0));
  } catch {
    // old Safari etc. — use the normal context below
  }
  const context = getAudioContext();
  if (!context) throw new Error("Web Audio API is not available");
  return context.decodeAudioData(data.slice(0));
};

const buildProfile = (buffer: AudioBuffer): Profile => {
  const length = buffer.length;
  const channelCount = Math.min(buffer.numberOfChannels, 2);
  const channels = Array.from({ length: channelCount }, (_, c) => buffer.getChannelData(c));
  const peak = new Float32Array(PROFILE_POINTS);
  const rms = new Float32Array(PROFILE_POINTS);
  for (let i = 0; i < PROFILE_POINTS; i += 1) {
    const start = Math.floor((i / PROFILE_POINTS) * length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / PROFILE_POINTS) * length));
    const step = Math.max(1, Math.floor((end - start) / 120));
    let p = 0;
    let sq = 0;
    let n = 0;
    for (const data of channels) {
      for (let k = start; k < end; k += step) {
        const v = Math.abs(data[k] ?? 0);
        if (v > p) p = v;
        sq += v * v;
        n += 1;
      }
    }
    peak[i] = p;
    rms[i] = Math.sqrt(sq / Math.max(1, n));
  }
  return { peak, rms };
};

// localStorage form: one char (6 bits) per value, values normalised to the
// track's loudest peak. ~1 KB per track.
const encodeProfile = (pr: Profile): string => {
  let max = 0.0001;
  for (const v of pr.peak) if (v > max) max = v;
  let out = "";
  for (const arr of [pr.peak, pr.rms]) {
    for (const v of arr) out += ALPHABET[Math.max(0, Math.min(63, Math.round((v / max) * 63)))];
  }
  return out;
};

const decodeProfile = (text: string): Profile | null => {
  if (text.length !== PROFILE_POINTS * 2) return null;
  const peak = new Float32Array(PROFILE_POINTS);
  const rms = new Float32Array(PROFILE_POINTS);
  for (let i = 0; i < PROFILE_POINTS * 2; i += 1) {
    const v = ALPHABET.indexOf(text[i]);
    if (v < 0) return null;
    if (i < PROFILE_POINTS) peak[i] = v / 63;
    else rms[i - PROFILE_POINTS] = v / 63;
  }
  return { peak, rms };
};

const readStored = (src: string): Profile | null => {
  try {
    const t = window.localStorage.getItem(STORE_PREFIX + src);
    return t ? decodeProfile(t) : null;
  } catch {
    return null;
  }
};

const writeStored = (src: string, pr: Profile) => {
  const text = encodeProfile(pr);
  try {
    window.localStorage.setItem(STORE_PREFIX + src, text);
  } catch {
    // Storage full: drop our old waveforms and try once more.
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(STORE_PREFIX)) window.localStorage.removeItem(k);
      }
      window.localStorage.setItem(STORE_PREFIX + src, text);
    } catch {
      // storage unavailable — memory cache only
    }
  }
};

/** "/api/file/previews/x.mp3" -> "/api/file/waveforms/previews/x.mp3.txt" (else null). */
const waveformUrl = (src: string): string | null => {
  const m = src.match(/^\/api\/file\/(previews\/.+)$/);
  return m ? `/api/file/waveforms/${m[1]}.txt` : null;
};

const isStaff = () => {
  const r = currentSessionRole();
  return r === "admin" || r === "editor";
};

/** Staff browsers publish what they computed, so visitors never decode it. */
const uploadProfile = (src: string, pr: Profile) => {
  if (!waveformUrl(src)) return Promise.resolve(false);
  return fetch("/api/admin/waveform", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ src, profile: encodeProfile(pr) }),
  })
    .then((r) => r.ok)
    .catch(() => false);
};

/** Fetch + decode the mp3 itself and take the profile (the slow, heavy path). */
const computeProfile = (src: string): Promise<Profile> =>
  enqueueLoad(() =>
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load waveform audio: ${src}`);
        return response.arrayBuffer();
      })
      .then(decodeSmall)
      // The decoded buffer goes out of scope here — only the profile survives.
      .then(buildProfile),
  );

/** The precomputed waveform (~1 KB) if it exists, else null. */
const fetchStoredProfile = async (src: string): Promise<Profile | null> => {
  const url = waveformUrl(src);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return decodeProfile((await res.text()).trim());
  } catch {
    return null;
  }
};

const getProfile = (src: string): Promise<Profile> => {
  const cached = profileCache.get(src);
  if (cached) return cached;

  const local = readStored(src);
  const promise = local
    ? Promise.resolve(local)
    : fetchStoredProfile(src).then(async (remote) => {
        if (remote) {
          writeStored(src, remote);
          return remote;
        }
        const pr = await computeProfile(src);
        writeStored(src, pr);
        if (isStaff()) void uploadProfile(src, pr);
        return pr;
      });
  // A failed load must not stick forever (network blip) — retry next time.
  promise.catch(() => profileCache.delete(src));
  profileCache.set(src, promise);
  return promise;
};

/**
 * Admin "Generate waveforms": for every preview without a stored waveform,
 * decode it here and upload the profile. Resumable (skips existing ones),
 * 3 at a time. Returns counts.
 */
export const backfillWaveforms = async (
  srcs: string[],
  onProgress: (done: number, total: number, made: number) => void,
  shouldStop: () => boolean = () => false,
): Promise<{ made: number; skipped: number; failed: number }> => {
  const list = [...new Set(srcs.filter((s) => waveformUrl(s)))];
  let next = 0;
  let done = 0;
  let made = 0;
  let skipped = 0;
  let failed = 0;
  const worker = async () => {
    while (next < list.length && !shouldStop()) {
      const src = list[next++];
      try {
        const head = await fetch(waveformUrl(src)!, { cache: "no-store" }); // ~1 KB
        if (head.ok) {
          skipped += 1;
        } else {
          const pr = await buildProfile(
            await decodeSmall(await (await fetch(src)).arrayBuffer()),
          );
          if (await uploadProfile(src, pr)) {
            made += 1;
            writeStored(src, pr);
          } else failed += 1;
        }
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress(done, list.length, made);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { made, skipped, failed };
};

const getPeaks = (src: string, bars: number) =>
  getProfile(src).then(({ peak, rms }) => {
    const peaks = Array.from({ length: bars }, (_, index) => {
      const start = Math.floor((index / bars) * PROFILE_POINTS);
      const end = Math.max(start + 1, Math.floor(((index + 1) / bars) * PROFILE_POINTS));
      let p = 0;
      let sq = 0;
      for (let i = start; i < end; i += 1) {
        if (peak[i] > p) p = peak[i];
        sq += rms[i] * rms[i];
      }
      return p * 0.72 + Math.sqrt(sq / (end - start)) * 0.28;
    });
    const maxPeak = Math.max(...peaks, 0.001);
    return peaks.map((value) => Math.max(0.05, value / maxPeak));
  });

const WaveformPreview = ({
  active = false,
  className,
  durationRatio = 1,
  minLoadingMs = 0,
  reloadKey,
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
    let holdTimer = 0;
    if (barCount <= 0) return;

    // Always drop back to the loading scan when this effect (re)runs — that is
    // what makes a filter/theme switch re-shimmer a REUSED row, not just a
    // freshly mounted one.
    setIsLoading(true);
    const startedAt = performance.now();

    // Per-run jitter around minLoadingMs so the list doesn't reveal every row at
    // the same instant — each waveform holds its scan for a slightly different
    // time (~0.45×–1.45× the base: some quicker, some slower), which reads as
    // organic loading. Only matters for cached previews; an uncached one takes
    // longer to fetch + decode than this hold anyway, so its real time wins.
    const hold = minLoadingMs > 0 ? Math.round(minLoadingMs * (0.45 + Math.random())) : 0;

    const reveal = (next: number[]) => {
      if (cancelled) return;
      const wait = Math.max(0, hold - (performance.now() - startedAt));
      const commit = () => {
        if (cancelled) return;
        setPeaks(next);
        setIsLoading(false);
      };
      if (wait <= 0) commit();
      else holdTimer = window.setTimeout(commit, wait);
    };

    if (!src) {
      reveal(fallbackPeaks ?? []);
    } else {
      getPeaks(src, barCount)
        .then((nextPeaks) => reveal(nextPeaks))
        .catch(() => reveal(Array.from({ length: barCount }, () => 0.08)));
    }

    return () => {
      cancelled = true;
      if (holdTimer) window.clearTimeout(holdTimer);
    };
    // reloadKey is intentionally a dep: bumping it replays the scan without a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barCount, fallbackPeaks, src, minLoadingMs, reloadKey]);

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
              // Both the gold (played) and grey (unplayed) bars dim together on
              // idle rows and light up when the track is playing.
              const opacity = played ? (active ? 1 : 0.5) : active ? 0.42 : 0.18;
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
