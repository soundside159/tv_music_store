import { useEffect, useState } from "react";
import {
  DEFAULT_VISUALIZER,
  getVisualizerSettings,
  resetVisualizerSettings,
  subscribeVisualizer,
  updateVisualizerSettings,
  type VisualizerSettings,
} from "@/lib/visualizerSettings";

// TEMPORARY tuning panel for the bottom-player particle equalizer — rendered
// on the homepage above the footer, ADMIN ONLY. Remove once the owner has
// dialed the numbers in (then hardcode them as DEFAULT_VISUALIZER).

// Bar-equalizer semantics (v3): density = bar count, trail = how slowly bars
// fall, sparkle = floating peak caps, fade = cap fall speed. Chaos/glow from
// the particle era are unused (glow kept in storage for a possible comeback).
const SLIDERS: Array<[keyof VisualizerSettings, string, number, number]> = [
  ["density", "Bars", 0, 100],
  ["opacity", "Opacity", 0, 100],
  ["reactivity", "Reactivity", 0, 100],
  ["maxRise", "Max rise (px)", 20, 96],
  ["size", "Bar width", 0, 100],
  ["trail", "Fall smooth", 0, 100],
  ["sparkle", "Peak caps", 0, 100],
  ["fade", "Cap fall", 0, 100],
  ["glow", "Border light", 0, 100],
  ["gold", "Gold %", 0, 100],
  ["smoothing", "Smoothing", 0, 100],
  ["threshold", "Sensitivity", 0, 100],
  ["bass", "Bass", 0, 100],
  ["mid", "Mid", 0, 100],
  ["high", "High", 0, 100],
];

const VisualizerSettingsPanel = () => {
  const [s, setS] = useState(getVisualizerSettings());
  useEffect(() => subscribeVisualizer(() => setS({ ...getVisualizerSettings() })), []);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <div className="rounded-xl border border-[#F4C430]/30 bg-card/60 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-body text-sm font-semibold uppercase tracking-wide text-[#F4C430]">
            Player Visualizer — temp settings (admin only)
          </h2>
          <label className="ml-auto flex cursor-pointer items-center gap-2 font-body text-xs text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#F4C430]"
              checked={s.enabled}
              onChange={(e) => updateVisualizerSettings({ enabled: e.target.checked })}
            />
            Enabled
          </label>
          <button
            type="button"
            onClick={() => resetVisualizerSettings()}
            className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
          >
            Reset to my setup
          </button>
        </div>
        <p className="mt-1 font-body text-[11px] text-muted-foreground">
          Play any track and tweak live — values are saved in this browser. Left of the bar =
          lows, right = highs. Tell the AI the final numbers to hardcode, then this panel goes away.
          Defaults: {JSON.stringify(DEFAULT_VISUALIZER)}
        </p>
        <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {SLIDERS.map(([key, label, min, max]) => (
            <label key={key} className="flex items-center gap-3 font-body text-xs text-muted-foreground">
              <span className="w-24 shrink-0">{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                value={Number(s[key])}
                onChange={(e) => updateVisualizerSettings({ [key]: Number(e.target.value) })}
                className="min-w-0 flex-1 accent-[#F4C430]"
              />
              <span className="w-8 shrink-0 text-right tabular-nums text-foreground">
                {Number(s[key])}
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
};

export default VisualizerSettingsPanel;
