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
}

export const DEFAULT_VISUALIZER: VisualizerSettings = {
  enabled: true,
  density: 60,
  reactivity: 70,
  maxRise: 90,
  size: 40,
  trail: 45,
  glow: 55,
  chaos: 30,
  sparkle: 60,
  gold: 35,
  smoothing: 70,
  bass: 85,
  mid: 55,
  high: 65,
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
