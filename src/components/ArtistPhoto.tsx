import { useEffect, useState, type CSSProperties } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { refreshContent } from "@/hooks/useContent";

// The composer's photo BEHIND his public artist page (a background layer, it
// takes no space): a blurred warm glow across the top + the sharp photo with
// soft edges. Every photo is different, so the owner tunes each one on the
// page itself (admin only): position, size, zoom, the soft mask, brightness.
// Saved per composer in composers.photo_settings (/api/admin/composer-photo).

export interface PhotoSettings {
  right: number; // % of the window from the right edge
  width: number; // % of the window
  height: number; // px
  focusX: number; // part of the photo kept in view, %
  focusY: number;
  zoom: number; // %
  maskW: number; // soft ellipse size, %
  maskH: number;
  maskX: number; // ellipse centre, %
  maskY: number;
  inner: number; // fully visible up to, %
  outer: number; // fully faded from, %
  brightness: number; // %
  glow: number; // blurred glow strength, %
}

// The look the owner approved on Lumine Wave (variant B).
export const PHOTO_DEFAULTS: PhotoSettings = {
  right: 4,
  width: 46,
  height: 820,
  focusX: 50,
  focusY: 20,
  zoom: 100,
  maskW: 60,
  maskH: 62,
  maskX: 55,
  maskY: 42,
  inner: 45,
  outer: 75,
  brightness: 80,
  glow: 100,
};

const SLIDERS: { key: keyof PhotoSettings; label: string; min: number; max: number; step?: number; unit: string }[] = [
  { key: "right", label: "Position from right", min: -20, max: 60, unit: "%" },
  { key: "width", label: "Width", min: 20, max: 90, unit: "%" },
  { key: "height", label: "Height", min: 300, max: 1400, step: 10, unit: "px" },
  { key: "zoom", label: "Zoom", min: 100, max: 250, unit: "%" },
  { key: "focusX", label: "Photo left / right", min: 0, max: 100, unit: "%" },
  { key: "focusY", label: "Photo up / down", min: 0, max: 100, unit: "%" },
  { key: "maskW", label: "Cut-out width", min: 20, max: 120, unit: "%" },
  { key: "maskH", label: "Cut-out height", min: 20, max: 120, unit: "%" },
  { key: "maskX", label: "Cut-out left / right", min: 0, max: 100, unit: "%" },
  { key: "maskY", label: "Cut-out up / down", min: 0, max: 100, unit: "%" },
  { key: "inner", label: "Sharp area", min: 0, max: 95, unit: "%" },
  { key: "outer", label: "Fade ends at", min: 5, max: 100, unit: "%" },
  { key: "brightness", label: "Brightness", min: 20, max: 120, unit: "%" },
  { key: "glow", label: "Background glow", min: 0, max: 100, unit: "%" },
];

const merge = (s?: Record<string, number> | null): PhotoSettings => ({ ...PHOTO_DEFAULTS, ...(s ?? {}) });

const ArtistPhoto = ({
  photo,
  composerId,
  saved,
  editable,
}: {
  photo: string;
  composerId: string;
  saved?: Record<string, number> | null;
  editable: boolean;
}) => {
  const [s, setS] = useState<PhotoSettings>(() => merge(saved));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(merge(saved)), [saved, composerId]);

  const mask = `radial-gradient(ellipse ${s.maskW}% ${s.maskH}% at ${s.maskX}% ${s.maskY}%, #000 ${s.inner}%, transparent ${Math.max(s.outer, s.inner + 1)}%)`;
  // Desktop size/position come from the settings (CSS variables read by md:
  // classes); a phone keeps a full-width, slightly dimmer version.
  const vars = {
    "--ph-right": `${s.right}%`,
    "--ph-w": `${s.width}%`,
    "--ph-h": `${s.height}px`,
  } as CSSProperties;

  const save = async (value: PhotoSettings | null) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/composer-photo", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ composerId, settings: value }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Save failed");
      if (!value) setS(PHOTO_DEFAULTS);
      refreshContent();
      toast.success(value ? "Photo settings saved" : "Photo settings reset");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[760px] md:h-[900px]"
      >
        <div
          className="absolute -inset-10 bg-cover"
          style={{
            backgroundImage: `url("${photo}")`,
            backgroundPosition: "center 30%",
            filter: "blur(40px) brightness(0.35) saturate(0.9)",
            opacity: s.glow / 100,
            WebkitMaskImage: "linear-gradient(#000 20%, transparent 85%)",
            maskImage: "linear-gradient(#000 20%, transparent 85%)",
          }}
        />
        <div
          className="absolute right-0 top-0 h-[560px] w-full overflow-hidden opacity-70 md:right-[var(--ph-right)] md:h-[var(--ph-h)] md:w-[var(--ph-w)] md:opacity-100"
          style={{ ...vars, WebkitMaskImage: mask, maskImage: mask, filter: `brightness(${s.brightness / 100})` }}
        >
          <div
            className="absolute inset-0 bg-cover"
            style={{
              backgroundImage: `url("${photo}")`,
              backgroundPosition: `${s.focusX}% ${s.focusY}%`,
              transform: `scale(${s.zoom / 100})`,
              transformOrigin: `${s.focusX}% ${s.focusY}%`,
            }}
          />
        </div>
      </div>

      {editable && (
        <div className="fixed bottom-28 left-4 z-[60]">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-[#F4C430]/60 bg-card/95 px-4 py-2 font-body text-xs font-semibold text-[#F4C430] shadow-xl backdrop-blur hover:bg-[#F4C430]/10"
            >
              <SlidersHorizontal className="h-4 w-4" /> Photo settings
            </button>
          ) : (
            <div className="max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-body text-sm font-semibold text-foreground">Photo settings</p>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2.5">
                {SLIDERS.map((sl) => (
                  <label key={sl.key} className="block font-body text-[11px] text-muted-foreground">
                    <span className="flex justify-between">
                      {sl.label}
                      <span className="tabular-nums text-foreground">
                        {s[sl.key]}
                        {sl.unit}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={sl.min}
                      max={sl.max}
                      step={sl.step ?? 1}
                      value={s[sl.key]}
                      onChange={(e) => setS((p) => ({ ...p, [sl.key]: Number(e.target.value) }))}
                      className="mt-1 w-full accent-[#F4C430]"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(s)}
                  className="flex-1 rounded-lg bg-[#F4C430] px-3 py-2 font-body text-xs font-bold text-background hover:bg-[#F4C430]/85 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(null)}
                  className="rounded-lg border border-border px-3 py-2 font-body text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Reset
                </button>
              </div>
              <p className="mt-2 font-body text-[10px] text-muted-foreground">
                Changes show live. Save keeps them for this composer; Reset goes back to the default look.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default ArtistPhoto;
