// Settings for the bottom-player particle equalizer (owner's experiment).
// All values 0–100 like the owner's Python visualizer sliders; persisted in
// localStorage so tweaks survive reloads. The temporary tuning panel lives on
// the homepage footer (admin-only) and will be removed once dialed in.

export interface VisualizerSettings {
  enabled: boolean;
  /** How many particles spawn (spawn rate). */
  density: number;
  /** How strongly band energy turns into jump height/velocity. */
  reactivity: number;
  /** Max rise above the player border, in px. */
  maxRise: number;
  /** Particle size. */
  size: number;
  /** Afterglow trails (frame fade). */
  trail: number;
  /** Glow/bloom around particles. */
  glow: number;
  /** Horizontal jitter / drift randomness. */
  chaos: number;
  /** Twinkle amount (driven by highs, like the sphere shimmer). */
  sparkle: number;
  /** Share of gold particles vs white (0 = all white, 100 = all gold). */
  gold: number;
  /** Spectrum smoothing (higher = calmer, floatier motion). */
  smoothing: number;
  /** Band gains. */
  bass: number;
  mid: number;
  high: number;
  /** Spawn sensitivity threshold — higher = only louder moments emit particles. */
  threshold: number;
  /** How fast a particle dissolves while rising (higher = shorter life). */
  fade: number;
}

// Owner-approved defaults (bar-EQ round 2, tuned live on 2026-07-09).
export const DEFAULT_VISUALIZER: VisualizerSettings = {
  enabled: true,
  density: 100, // Bars
  reactivity: 7,
  maxRise: 56,
  size: 100, // Bar width
  trail: 17, // Fall smooth
  glow: 49, // Border light
  chaos: 22, // unused (particle era)
  sparkle: 90, // Peak caps
  gold: 100,
  smoothing: 43,
  bass: 100,
  mid: 79,
  high: 86,
  threshold: 53, // Sensitivity
  fade: 0, // Cap fall (0 = caps linger — owner's pick)
};

const KEY = "tvms_visualizer_v1";

let settings: VisualizerSettings = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_VISUALIZER, ...(JSON.parse(raw) as Partial<VisualizerSettings>) };
  } catch {
    // ignore — defaults
  }
  return { ...DEFAULT_VISUALIZER };
})();

const listeners = new Set<() => void>();

export const getVisualizerSettings = (): VisualizerSettings => settings;

export const updateVisualizerSettings = (patch: Partial<VisualizerSettings>): void => {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage full/blocked — keep in memory
  }
  listeners.forEach((l) => l());
};

export const resetVisualizerSettings = (): void => {
  updateVisualizerSettings({ ...DEFAULT_VISUALIZER });
};

export const subscribeVisualizer = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
