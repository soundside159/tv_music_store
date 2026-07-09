import { useEffect, useRef, useState } from "react";
import { getSharedAnalyser } from "@/components/TrackRowPlayer";
import { usePlayer } from "@/components/playerContext";
import {
  getVisualizerSettings,
  subscribeVisualizer,
} from "@/lib/visualizerSettings";

// Particle equalizer above the bottom mini-player (owner's experiment,
// inspired by his Python particle sphere): particles jump UP from the
// player's top border while music plays — LEFT columns follow the lows,
// RIGHT columns follow the highs. Soft physics, twinkle, trails and glow;
// everything tunable via the temporary panel on the homepage footer
// (src/lib/visualizerSettings.ts, localStorage).

const GOLD = "255, 196, 48"; // #F4C430-ish rgb for canvas colors
const COLUMNS = 96;
const MAX_PARTICLES = 900;

interface Particle {
  x: number;
  y: number; // px above the baseline (positive = higher)
  vx: number;
  vy: number;
  life: number; // 1 → 0
  decay: number;
  size: number;
  gold: boolean;
  phase: number; // twinkle phase
  spin: number; // twinkle speed
}

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
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    const freq = new Uint8Array(1024);
    // Per-column smoothed energy (extra envelope on top of the analyser).
    const columnEnergy = new Float32Array(COLUMNS);
    let last = performance.now();
    let idleFade = 1; // lets particles finish after pause instead of vanishing

    const loop = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = getVisualizerSettings();
      const analyser = getSharedAnalyser();

      // --- read spectrum -----------------------------------------------------
      let bins = 0;
      if (analyser && isPlayingRef.current) {
        analyser.smoothingTimeConstant = 0.5 + (s.smoothing / 100) * 0.45;
        bins = Math.min(analyser.frequencyBinCount, freq.length);
        analyser.getByteFrequencyData(freq);
        idleFade = 1;
      } else {
        idleFade = Math.max(0, idleFade - dt * 1.4);
      }

      // --- per-column energy: log-spaced bins, left = lows, right = highs ----
      if (bins > 0) {
        // Use bins up to ~14 kHz (≈ bin 650 of 1024 @ 44.1k) — the top octave
        // is mostly empty and would flatten the right side.
        const usable = Math.floor(bins * 0.62);
        for (let c = 0; c < COLUMNS; c++) {
          const t0 = c / COLUMNS;
          const t1 = (c + 1) / COLUMNS;
          // log mapping: column → bin range
          const b0 = Math.floor(Math.pow(usable, t0));
          const b1 = Math.max(b0 + 1, Math.floor(Math.pow(usable, t1)));
          let sum = 0;
          for (let b = b0; b < b1 && b < usable; b++) sum += freq[b];
          let e = sum / ((b1 - b0) * 255);
          // band gains: crossfade bass → mid → high across the width
          const pos = c / (COLUMNS - 1);
          const bassW = Math.max(0, 1 - pos * 2.2);
          const highW = Math.max(0, pos * 2.2 - 1.2);
          const midW = Math.max(0, 1 - bassW - highW);
          const gain =
            (bassW * s.bass + midW * s.mid + highW * s.high) / 100;
          e = Math.min(1, e * gain * 1.35) * idleFade;
          // envelope: fast attack, slow release (the "floaty" feel)
          columnEnergy[c] +=
            (e - columnEnergy[c]) * (e > columnEnergy[c] ? 0.55 : 0.08);
        }
      } else if (idleFade <= 0) {
        columnEnergy.fill(0);
      }

      // --- spawn particles ----------------------------------------------------
      if (idleFade > 0 && particles.length < MAX_PARTICLES) {
        const rate = (s.density / 100) * 340; // particles/sec across the bar
        const colW = width / COLUMNS;
        for (let c = 0; c < COLUMNS; c++) {
          const e = columnEnergy[c];
          if (e < 0.04) continue;
          const p = rate * e * dt * 0.9;
          if (Math.random() < p) {
            const react = (s.reactivity / 100) * e;
            particles.push({
              x: (c + 0.15 + Math.random() * 0.7) * colW,
              y: 0,
              vx: (Math.random() - 0.5) * (s.chaos / 100) * 60,
              vy: 60 + react * s.maxRise * (2.2 + Math.random() * 1.4),
              life: 1,
              decay: 0.9 + Math.random() * 0.9,
              size: 0.7 + (s.size / 100) * 2.1 * (0.6 + Math.random() * 0.8),
              gold: Math.random() * 100 < s.gold,
              phase: Math.random() * Math.PI * 2,
              spin: 5 + Math.random() * 9,
            });
          }
        }
      }

      // --- fade previous frame (trails on a transparent canvas) --------------
      ctx.globalCompositeOperation = "destination-out";
      const fade = 1 - Math.pow(s.trail / 100, 0.6) * 0.82; // 1 = instant clear
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.12, fade)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      // --- physics + draw -----------------------------------------------------
      const gravity = 190 + s.maxRise * 1.1;
      const glow = (s.glow / 100) * 9;
      const tSec = now / 1000;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy -= gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0 || p.y < -4) {
          particles.splice(i, 1);
          continue;
        }
        // twinkle: highs make everything shimmer harder (the sphere feel)
        const tw =
          0.55 +
          0.45 *
            Math.sin(p.phase + tSec * p.spin * (0.4 + (s.sparkle / 100) * 1.2));
        const alpha = Math.min(1, p.life * 1.2) * (0.35 + tw * 0.65);
        const px = p.x;
        const py = height - 1 - Math.min(height - 2, p.y);
        ctx.shadowBlur = glow;
        if (p.gold) {
          ctx.shadowColor = `rgba(${GOLD},0.9)`;
          ctx.fillStyle = `rgba(${GOLD},${alpha.toFixed(3)})`;
        } else {
          ctx.shadowColor = "rgba(255,255,255,0.8)";
          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        }
        ctx.beginPath();
        ctx.arc(px, py, p.size * (0.75 + tw * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
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
      className="pointer-events-none absolute inset-x-0 bottom-full h-32 w-full"
    />
  );
};

export default AudioVisualizer;
