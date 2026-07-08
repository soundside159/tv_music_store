import { useCallback, useEffect, useState } from "react";
import { Check, Music, Star, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { formatDuration, wavToMp3Pair, zipWavs } from "@/lib/audioEncoding";
import { cleanVersionLabel } from "@/lib/downloadTrack";

// Composer panel "Add track" (owner-approved UX, stage 4): a Bulk-style drop
// zone where several WAVs = versions of ONE track, then ONLY Title / BPM /
// Description / Extra Tags / optional Stems ZIP — no category, no cover, no
// stems checkbox (has_stems flips automatically when a stems zip is attached).
// Star picks the Main version (default: longest). One Upload button.
// Tracks are created via POST /api/composer/tracks as draft + pending review.

const GOLD = "#F4C430";

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";
const btnCls =
  "rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-50";

export interface ComposerTrackRow {
  id: string;
  slug: string;
  title: string;
  duration: string | null;
  bpm: number | null;
  status: string;
  moderation_status: string;
  created_at: string | null;
  versions: number;
  downloads: number;
}

export interface ComposerTracksData {
  composer: { id: string; displayName: string } | null;
  tracks: ComposerTrackRow[];
  /** null while loading; message when the API refused (no profile / not composer). */
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** The signed-in composer's own tracks + profile from /api/composer/tracks. */
export const useComposerTracks = (enabled: boolean): ComposerTracksData => {
  const [composer, setComposer] = useState<{ id: string; displayName: string } | null>(null);
  const [tracks, setTracks] = useState<ComposerTrackRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    fetch("/api/composer/tracks", { credentials: "include" })
      .then(async (res) => {
        const d = (await res.json()) as {
          composer?: { id: string; displayName: string };
          tracks?: ComposerTrackRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(d.error ?? "Failed to load");
        setComposer(d.composer ?? null);
        setTracks(d.tracks ?? []);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { composer, tracks, error, loading, reload };
};

const uploadAudio = async (
  file: Blob,
  kind: "preview" | "preview128" | "wavzip" | "stems",
  filename: string,
): Promise<{ key: string; path: string | null }> => {
  const base = filename.replace(/\.[^.]+$/, "");
  const res = await fetch(
    `/api/admin/upload-audio?kind=${kind}&filename=${encodeURIComponent(base)}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type":
          file.type || (kind === "wavzip" || kind === "stems" ? "application/zip" : "audio/mpeg"),
      },
      body: file,
    },
  );
  const d = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    key?: string;
    path?: string | null;
    error?: string;
  };
  if (!res.ok || !d.ok || !d.key) throw new Error(d.error ?? "Upload failed");
  return { key: d.key, path: d.path ?? null };
};

interface WavRow {
  id: string;
  file: File;
}

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, "");

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

const ComposerUpload = ({ onCreated }: { onCreated: () => void }) => {
  const [wavs, setWavs] = useState<WavRow[]>([]);
  /** file id starred as Main; null = auto (longest — resolved during encode). */
  const [mainId, setMainId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [bpm, setBpm] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [stemsFile, setStemsFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = [...list].filter((f) => /\.wav$/i.test(f.name));
    if (incoming.length === 0) {
      toast.error("WAV files only (.wav)");
      return;
    }
    setWavs((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (!next.some((w) => w.file.name === file.name && w.file.size === file.size)) {
          next.push({ id: `${file.name}-${file.size}`, file });
        }
      }
      return next.slice(0, 12);
    });
    // First files also suggest a title ("Epic Battle (short).wav" -> "Epic Battle").
    if (!title.trim() && incoming[0]) {
      const base = baseName(incoming[0]);
      const m = base.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
      setTitle((m ? m[1] : base).trim());
    }
  };

  const removeWav = (id: string) => {
    setWavs((prev) => prev.filter((w) => w.id !== id));
    setMainId((m) => (m === id ? null : m));
  };

  const labelOf = (w: WavRow) => cleanVersionLabel(baseName(w.file), title) || "Main";

  const submit = async () => {
    const t = title.trim();
    if (!t) return toast.error("Title is required");
    if (wavs.length === 0) return toast.error("Add at least one WAV file");
    setBusy(true);
    try {
      // 1. Encode everything first (also measures durations for auto-Main).
      const encoded: { w: WavRow; mp3_320: Blob; mp3_128: Blob; duration: number }[] = [];
      for (let i = 0; i < wavs.length; i++) {
        setProgress(`Encoding ${i + 1}/${wavs.length}: ${wavs[i].file.name}`);
        await yieldToUi();
        const pair = await wavToMp3Pair(wavs[i].file);
        encoded.push({ w: wavs[i], ...pair });
      }

      // 2. Main = starred file, else the longest one.
      let mainIdx = mainId ? encoded.findIndex((e) => e.w.id === mainId) : -1;
      if (mainIdx === -1) {
        mainIdx = encoded.reduce((best, e, i) => (e.duration > encoded[best].duration ? i : best), 0);
      }
      const ordered = [encoded[mainIdx], ...encoded.filter((_, i) => i !== mainIdx)];

      // 3. Upload previews per version.
      const versions: { label: string; previewSrc: string; preview128?: string; duration: string }[] = [];
      for (let i = 0; i < ordered.length; i++) {
        const e = ordered[i];
        setProgress(`Uploading version ${i + 1}/${ordered.length}…`);
        const p320 = await uploadAudio(e.mp3_320, "preview", e.w.file.name);
        const p128 = await uploadAudio(e.mp3_128, "preview128", e.w.file.name);
        const clean = cleanVersionLabel(baseName(e.w.file), t);
        versions.push({
          label: i === 0 ? clean || "Main" : clean || `Version ${i + 1}`,
          previewSrc: p320.path ?? "",
          preview128: p128.path ?? undefined,
          duration: formatDuration(e.duration),
        });
      }

      // 4. Private WAV bundle + optional stems zip.
      setProgress("Packing & uploading WAV zip…");
      await yieldToUi();
      const zipBlob = await zipWavs(wavs.map(({ file }) => ({ name: file.name, file })));
      const zipUp = await uploadAudio(zipBlob, "wavzip", t);
      let stemsKey: string | undefined;
      if (stemsFile) {
        setProgress("Uploading stems zip…");
        const stemsUp = await uploadAudio(stemsFile, "stems", stemsFile.name);
        stemsKey = stemsUp.key;
      }

      // 5. Create the track (draft + pending review).
      setProgress("Submitting for review…");
      const res = await fetch("/api/composer/tracks", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: t,
          bpm: bpm ? Number(bpm) : undefined,
          description: description.trim(),
          tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
          versions,
          wavZipKey: zipUp.key,
          stemsKey,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Could not create track");

      toast.success("Track submitted for review", {
        description: "It goes live after the admin approves and publishes it.",
      });
      setWavs([]);
      setMainId(null);
      setTitle("");
      setBpm("");
      setDescription("");
      setTags("");
      setStemsFile(null);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#F4C430]/35 bg-[#F4C430]/[0.03] px-6 py-10 text-center transition-colors hover:border-[#F4C430]/70"
      >
        <UploadCloud className="h-8 w-8" style={{ color: GOLD }} />
        <p className="font-body text-sm text-foreground">
          Drop WAV files here — several files become versions of ONE track
        </p>
        <label className={`${btnCls} inline-flex cursor-pointer items-center gap-1.5`}>
          <Music className="h-3.5 w-3.5" />
          {wavs.length ? "Add more WAVs" : "Choose WAV file(s)"}
          <input
            type="file"
            accept=".wav,audio/wav,audio/x-wav"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {/* Version list: star = Main override (default longest). */}
      {wavs.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background/40 p-3">
          {wavs.map((w) => {
            const isMain = mainId === w.id;
            return (
              <li key={w.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setMainId((m) => (m === w.id ? null : w.id))}
                  title={isMain ? "Main version (click for auto: longest)" : "Make this the Main version"}
                  aria-label={`Set ${w.file.name} as main`}
                  className="shrink-0 disabled:opacity-40"
                >
                  <Star
                    className="h-3.5 w-3.5"
                    style={isMain ? { color: GOLD, fill: GOLD } : { color: "#666" }}
                  />
                </button>
                <span className="min-w-0 flex-1 truncate font-body text-xs text-muted-foreground">
                  {w.file.name}
                  <span className="ml-2 text-foreground/80">→ {labelOf(w)}</span>
                </span>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => removeWav(w.id)}
                    aria-label={`Remove ${w.file.name}`}
                    className="shrink-0 text-muted-foreground/60 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
          {!mainId && wavs.length > 1 && (
            <li className="pl-6 font-body text-[11px] text-muted-foreground">
              main: longest (auto) — star a file to override
            </li>
          )}
        </ul>
      )}

      {/* Fields — exactly Title / BPM / Description / Extra tags / Stems ZIP. */}
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <input
          placeholder="Track title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
        />
        <input
          placeholder="BPM"
          inputMode="numeric"
          value={bpm}
          onChange={(e) => setBpm(e.target.value.replace(/[^0-9]/g, ""))}
          className={inputCls}
        />
      </div>
      <textarea
        placeholder="Description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={inputCls}
      />
      <input
        placeholder="Extra tags, comma separated"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        className={inputCls}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnCls} inline-flex cursor-pointer items-center gap-1.5`}>
          <Check className={`h-3.5 w-3.5 ${stemsFile ? "text-[#F4C430]" : "opacity-40"}`} />
          {stemsFile ? "Replace stems ZIP" : "Stems ZIP (optional)"}
          <input
            type="file"
            accept="application/zip,.zip"
            className="hidden"
            onChange={(e) => {
              setStemsFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        {stemsFile && (
          <span className="flex items-center gap-1.5 font-body text-[11px] text-muted-foreground">
            <span className="max-w-[14rem] truncate">{stemsFile.name}</span>
            <button
              type="button"
              onClick={() => setStemsFile(null)}
              aria-label="Remove stems zip"
              className="text-muted-foreground transition-colors hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {progress && (
        <p className="rounded-lg border border-[#F4C430]/40 bg-[#F4C430]/5 px-3 py-2 text-center font-body text-xs text-[#F4C430]">
          {progress}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-xs text-muted-foreground">
          Your track goes to the admin for review — it appears in the catalog once approved.
        </p>
        <button
          type="button"
          disabled={busy || !title.trim() || wavs.length === 0}
          onClick={() => void submit()}
          className="rounded-lg bg-[#F4C430] px-5 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </div>
  );
};

export default ComposerUpload;
