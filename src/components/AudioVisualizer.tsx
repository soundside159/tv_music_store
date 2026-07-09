import { useEffect, useRef, useState } from "react";
import { getSharedAnalyser } from "@/components/TrackRowPlayer";
import { usePlayer } from "@/components/playerContext";
import { getVisualizerSettings, subscribeVisualizer } from "@/lib/visualizerSettings";

// Classic bar equalizer on the mini-player's top border: LEFT bars follow the
// lows, RIGHT bars follow the highs. Bars jump up instantly with the music
// (the analyser reads the SAME audio graph that feeds the speakers — no
// desync by construction) and fall right back down. Deliberately cheap:
// ≤128 fillRect calls per frame, no shadows, no trails, no particles;
// drawing is skipped entirely while nothing is audible.

const GOLD = "244, 196, 48"; // #F4C430

const AudioVisualizer = () => {
  const { isPlaying } = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(getVisualizerSettings().enabled);

  useEffect(
    () => subscribeVisualizer(() => setEnabled(getVisualizerSettings().enabled)),
    [],
  );

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    let disposed = false;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const freq = new Uint8Array(2048); // fftSize 4096 → 2048 bins
    const MAX_BARS = 256;
    const values = new Float32Array(MAX_BARS); // current bar heights (0..1)
    const peaks = new Float32Array(MAX_BARS); // floating peak caps (0..1)
    // Pause/stop: bars hold for a beat, then plunge (easeInExpo) — natural die-off.
    let stopSnap: Float32Array | null = null;
    let stopStart = 0;
    let cleared = true;
    let last = performance.now();

    const loop = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;

      const s = getVisualizerSettings();
      const analyser = getSharedAnalyser();
      const barCount = Math.max(32, Math.min(MAX_BARS, Math.round(32 + (s.density / 100) * 224)));

      // --- read the spectrum only while playing -------------------------------
      let bins = 0;
      if (analyser && isPlayingRef.current) {
        analyser.smoothingTimeConstant = 0.35 + (s.smoothing / 100) * 0.5;
        bins = Math.min(analyser.frequencyBinCount, freq.length);
        analyser.getByteFrequencyData(freq);
      }

      // --- update bars: instant attack, smooth release ------------------------
      const gate = (s.threshold / 100) * 0.35;
      // trail↑ = slower fall; at 100 a full bar takes ~3 s to sink.
      const release = 0.35 + (1 - s.trail / 100) * 7.75;
      const capFall = 0.25 + (s.fade / 100) * 1.6; // fade↑ = caps drop faster
      let energyLeft = 0;
      const usable = bins > 0 ? Math.floor(bins * 0.62) : 0;

      if (bins === 0) {
        // Track paused/stopped: hold for a beat, then plunge — easeInExpo.
        if (!stopSnap) {
          stopSnap = values.slice(0, MAX_BARS);
          stopStart = now;
        }
        const tt = Math.min(1, (now - stopStart) / 1500);
        const k = 1 - (tt <= 0 ? 0 : Math.pow(2, 10 * (tt - 1))); // 1 - easeInExpo
        for (let i = 0; i < barCount; i++) {
          values[i] = stopSnap[i] * Math.max(0, k);
          peaks[i] = Math.max(values[i], peaks[i] - capFall * dt);
          energyLeft = Math.max(energyLeft, values[i], peaks[i] * 0.5);
        }
      } else {
        stopSnap = null;
      }

      if (bins > 0)
      for (let i = 0; i < barCount; i++) {
        let target = 0;
        if (usable > 0) {
          // Fractional log-spaced bin range per bar. Narrow ranges (low end)
          // INTERPOLATE between neighbouring bins so every bar tracks its own
          // frequency — no more groups of identical bars.
          const f0 = Math.pow(usable, i / barCount);
          const f1 = Math.pow(usable, (i + 1) / barCount);
          let e: number;
          if (f1 - f0 >= 1.5) {
            const b0 = Math.floor(f0);
            const b1 = Math.min(usable, Math.max(b0 + 1, Math.floor(f1)));
            let sum = 0;
            for (let b = b0; b < b1; b++) sum += freq[b];
            e = sum / ((b1 - b0) * 255);
          } else {
            const c = Math.min(usable - 1.001, (f0 + f1) / 2);
            const b = Math.floor(c);
            const frac = c - b;
            e = (freq[b] + (freq[Math.min(b + 1, usable - 1)] - freq[b]) * frac) / 255;
          }
          const pos = i / (barCount - 1);
          const bassW = Math.max(0, 1 - pos * 2.2);
          const highW = Math.max(0, pos * 2.2 - 1.2);
          const midW = Math.max(0, 1 - bassW - highW);
          e *= (bassW * s.bass + midW * s.mid + highW * s.high) / 100;
          e = Math.max(0, e - gate) / Math.max(0.15, 1 - gate);
          target = Math.min(1, e * (0.5 + (s.reactivity / 100) * 1.5));
        }
        // Bars jump straight to the beat, then glide down.
        values[i] = target >= values[i] ? target : Math.max(target, values[i] - release * dt);
        peaks[i] = Math.max(values[i], peaks[i] - capFall * dt);
        energyLeft = Math.max(energyLeft, values[i]);
      }

      // --- draw ----------------------------------------------------------------
      if (energyLeft < 0.004) {
        if (!cleared) {
          ctx.clearRect(0, 0, width, height);
          cleared = true;
        }
        return;
      }
      cleared = false;
      ctx.clearRect(0, 0, width, height);

      const slot = width / barCount;
      const barW = Math.max(1, slot * (0.35 + (s.size / 100) * 0.55));
      const inset = (slot - barW) / 2;
      const rise = Math.min(height - 4, s.maxRise);
      const goldShare = s.gold / 100;
      const capOn = s.sparkle > 5;
      const borderLight = s.glow / 100; // lights the bar's top border under active bars

      for (let i = 0; i < barCount; i++) {
        const v = values[i];
        if (v <= 0.008) continue;
        const h = Math.max(1, v * rise);
        const x = i * slot + inset;
        // Border glow: the player's top edge lights up right where the bars
        // are jumping (full slot width so segments merge into a glowing line).
        if (borderLight > 0.02) {
          ctx.fillStyle = `rgba(${GOLD},${(borderLight * (0.25 + v * 0.75)).toFixed(3)})`;
          ctx.fillRect(i * slot, height - 2, slot, 2);
        }
        // color: gold↔white mix, brighter when taller
        const a = 0.28 + v * 0.6;
        ctx.fillStyle =
          goldShare >= 0.999
            ? `rgba(${GOLD},${a.toFixed(3)})`
            : `rgba(${Math.round(244 + (255 - 244) * (1 - goldShare))},${Math.round(
                196 + (255 - 196) * (1 - goldShare),
              )},${Math.round(48 + (255 - 48) * (1 - goldShare))},${a.toFixed(3)})`;
        ctx.fillRect(x, height - 2 - h, barW, h);
        // floating peak cap (classic EQ), brightness via Sparkle
        if (capOn && peaks[i] > v + 0.015) {
          const py = height - 2 - Math.max(2, peaks[i] * rise);
          ctx.fillStyle = `rgba(${GOLD},${(0.35 + (s.sparkle / 100) * 0.55).toFixed(3)})`;
          ctx.fillRect(x, py, barW, 1.5);
        }
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-full h-24 w-full"
    />
  );
};

export default AudioVisualizer;
