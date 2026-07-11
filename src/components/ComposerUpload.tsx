import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Music, Sparkles, Star, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { decodeAudio, detectBpm, formatDuration, makeThumbnail, wavToMp3Pair, zipWavs } from "@/lib/audioEncoding";
import { brandCover, generateCoverApi, generateDescriptionApi, uploadCoverImage } from "@/lib/coverArt";
import { cleanVersionLabel } from "@/lib/downloadTrack";
import { defaultVocabularies, type Vocabularies } from "@/lib/tagOptions";

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
  /** Use Case / Genre / Mood options for the upload form. */
  vocabularies: Vocabularies;
  /** null while loading; message when the API refused (no profile / not composer). */
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** The signed-in composer's own tracks + profile from /api/composer/tracks. */
export const useComposerTracks = (enabled: boolean): ComposerTracksData => {
  const [composer, setComposer] = useState<{ id: string; displayName: string } | null>(null);
  const [tracks, setTracks] = useState<ComposerTrackRow[]>([]);
  const [vocabularies, setVocabularies] = useState<Vocabularies>(defaultVocabularies);
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
          vocabularies?: Vocabularies;
          error?: string;
        };
        if (!res.ok) throw new Error(d.error ?? "Failed to load");
        setComposer(d.composer ?? null);
        setTracks(d.tracks ?? []);
        if (d.vocabularies) setVocabularies(d.vocabularies);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { composer, tracks, error, loading, reload, vocabularies };
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
  /** Seconds, read from audio metadata right after the file is added. */
  duration?: number;
}

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, "");

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

/** Cheap duration probe (metadata only — no decode). 0 when unreadable. */
const probeDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(a.duration) ? a.duration : 0);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    a.src = url;
  });

const ComposerUpload = ({
  onCreated,
  vocabularies = defaultVocabularies,
}: {
  onCreated: () => void;
  vocabularies?: Vocabularies;
}) => {
  const [wavs, setWavs] = useState<WavRow[]>([]);
  /** file id starred as Main — auto-set to the LONGEST file until the
      composer stars one manually. */
  const [mainId, setMainId] = useState<string | null>(null);
  const [mainManual, setMainManual] = useState(false);
  const [title, setTitle] = useState("");
  const [bpm, setBpm] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [stemsFile, setStemsFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  // Use Case / Genre / Mood chips (same options as the admin panels).
  const [sel, setSel] = useState<Record<keyof Vocabularies, string[]>>({
    useCase: [],
    genre: [],
    mood: [],
  });
  // AI cover: generated+branded cover path, its clean thumb, optional word.
  const [cover, setCover] = useState("");
  const [coverThumb, setCoverThumb] = useState("");
  const [coverHint, setCoverHint] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  // BPM auto-detect: which file id we already analysed (one decode per Main).
  const bpmProbedRef = useRef<string | null>(null);

  const toggleFacet = (facet: keyof Vocabularies, v: string) =>
    setSel((s) => ({
      ...s,
      [facet]: s[facet].includes(v) ? s[facet].filter((x) => x !== v) : [...s[facet], v],
    }));

  // Detect the tempo of the Main file and prefill the BPM field (only while
  // it's still empty — the composer's own typing always wins).
  useEffect(() => {
    if (wavs.length === 0 || bpm) return;
    const target = wavs.find((w) => w.id === mainId) ?? wavs[0];
    if (!target || bpmProbedRef.current === target.id) return;
    bpmProbedRef.current = target.id;
    void (async () => {
      try {
        const detected = await detectBpm(await decodeAudio(target.file));
        if (detected) setBpm((prev) => prev || String(detected));
      } catch {
        // no beat found — field just stays empty
      }
    })();
  }, [wavs, mainId, bpm]);

  const facetsPicked = sel.useCase.length > 0 && sel.genre.length > 0 && sel.mood.length > 0;
  const canGenerate = facetsPicked && !coverBusy && !busy;

  // AI description from the picked tags (owner's fixed SEO prompt server-side).
  const [descBusy, setDescBusy] = useState(false);
  const generateDescription = async () => {
    setDescBusy(true);
    try {
      const text = await generateDescriptionApi({
        genre: sel.genre,
        mood: sel.mood,
        useCase: sel.useCase,
      });
      setDescription(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setDescBusy(false);
    }
  };

  // Same pipeline as the admin track page: generate → brand the full cover →
  // clean thumbnail for the rows. Paths go into the track on Upload.
  const generateCover = async () => {
    setCoverBusy(true);
    try {
      const path = await generateCoverApi({
        useCase: sel.useCase,
        mood: sel.mood,
        hint: coverHint.trim() || undefined,
      });
      const blob = await (await fetch(path)).blob();
      const original = new File([blob], "ai-cover.png", { type: blob.type || "image/png" });
      let branded = path;
      try {
        branded = await uploadCoverImage(await brandCover(original), "ai-cover-branded.jpg");
      } catch {
        // unbranded original stays
      }
      let thumb = "";
      try {
        thumb = await uploadCoverImage(await makeThumbnail(original), "ai-cover-thumb.jpg");
      } catch {
        // rows fall back to the full cover
      }
      setCover(branded);
      setCoverThumb(thumb);
      toast.success("Cover generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setCoverBusy(false);
    }
  };

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
          const id = `${file.name}-${file.size}`;
          next.push({ id, file });
          // Probe the duration in the background; the auto-Main effect below
          // re-stars the longest file as results arrive.
          void probeDuration(file).then((d) =>
            setWavs((cur) => cur.map((w) => (w.id === id ? { ...w, duration: d } : w))),
          );
        }
      }
      return next.slice(0, 12);
    });
    // First files also suggest a title ("Epic Battle (short).wav" -> "Epic Battle").
    if (!title.trim() && incoming[0]) {
      const base = baseName(incoming[0]);
      const m = base.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
      const raw = (m ? m[1] : base).trim();
      // Leading catalog numbers drop: "1685_Epic Battle" -> "Epic Battle"
      // (digits + duration word stay: "15sec…" keeps its 15).
      setTitle(raw.replace(/^\s*\d+[\s._-]+(?!(?:sec(?:s|onds?)?|min(?:s|utes?)?)\b)/i, "").trim() || raw);
    }
  };

  const removeWav = (id: string) => {
    setWavs((prev) => prev.filter((w) => w.id !== id));
    if (mainId === id) {
      setMainId(null);
      setMainManual(false); // auto-star kicks back in
    }
  };

  // Auto-star: a file named …_main… wins, else the longest (probed duration,
  // file size as tiebreaker) — until the composer picks one by hand.
  useEffect(() => {
    if (mainManual || wavs.length === 0) return;
    const named = wavs.find((w) =>
      /(^|[_\s(-])main([_\s).-]|$)/i.test(w.file.name.replace(/\.[^.]+$/, "")),
    );
    const pick =
      named ??
      wavs.reduce((best, w) => {
        const a = w.duration ?? 0;
        const b = best.duration ?? 0;
        if (a !== b) return a > b ? w : best;
        return w.file.size > best.file.size ? w : best;
      });
    if (pick.id !== mainId) setMainId(pick.id);
  }, [wavs, mainManual, mainId]);

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
          useCase: sel.useCase.join(" / "),
          genre: sel.genre.join(" / "),
          mood: sel.mood.join(" / "),
          cover: cover || undefined,
          coverThumb: coverThumb || undefined,
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
      setMainManual(false);
      setTitle("");
      setBpm("");
      setDescription("");
      setTags("");
      setStemsFile(null);
      setSel({ useCase: [], genre: [], mood: [] });
      setCover("");
      setCoverThumb("");
      setCoverHint("");
      bpmProbedRef.current = null;
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

      {/* Everything below the drop zone appears only once files are added —
          the empty form was just noise (owner request). */}
      {wavs.length > 0 && (
        <>
        {/* Two columns on desktop: files + fields LEFT, tags + AI cover RIGHT. */}
        <div className="items-start gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
        {/* Version list: star = Main override (default longest). */}
        <ul className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background/40 p-3">
          {wavs.map((w) => {
            const isMain = mainId === w.id;
            return (
              <li key={w.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMainId(w.id);
                    setMainManual(true);
                  }}
                  title={isMain ? "Main version" : "Make this the Main version"}
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
        </ul>

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
      <div className="relative">
        <textarea
          placeholder="Description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputCls} w-full`}
        />
        <button
          type="button"
          disabled={!facetsPicked || descBusy || busy}
          onClick={() => void generateDescription()}
          title={
            facetsPicked
              ? "Generate an SEO description from your tags"
              : "Pick at least one Use Case, Genre and Mood first"
          }
          className="absolute bottom-2.5 right-2 inline-flex items-center gap-1 rounded-md border border-[#F4C430]/50 bg-card px-2 py-1 font-body text-[11px] font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background disabled:opacity-40"
        >
          <Sparkles className={`h-3 w-3 ${descBusy ? "animate-pulse" : ""}`} />
          {descBusy ? "Writing…" : "Generate"}
        </button>
      </div>
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
      </div>

      {/* ===== Right: tags + AI cover generation ===== */}
      <div className="mt-5 flex flex-col gap-4 rounded-xl border border-[#F4C430]/25 bg-background/30 p-4 lg:mt-0">
        {(
          [
            ["useCase", "Use Case"],
            ["genre", "Genre"],
            ["mood", "Mood"],
          ] as const
        ).map(([facet, label]) => (
          <div key={facet}>
            <p className="mb-1.5 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {vocabularies[facet].map((v) => {
                const on = sel[facet].includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleFacet(facet, v)}
                    className={`rounded-full border px-2.5 py-1 font-body text-xs transition-colors disabled:opacity-50 ${
                      on
                        ? "border-[#F4C430] bg-[#F4C430]/15 text-[#F4C430]"
                        : "border-border text-muted-foreground hover:border-[#F4C430]/50"
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* AI cover — needs at least one pick in EACH group. */}
        <div className="border-t border-border/60 pt-4">
          <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cover
          </p>
          <div className="flex items-start gap-3">
            <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-secondary">
              {cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : coverBusy ? (
                <Sparkles className="h-5 w-5 animate-pulse text-[#F4C430]" />
              ) : (
                <Music className="h-5 w-5 text-muted-foreground/60" />
              )}
              {coverBusy && <span className="absolute inset-0 animate-pulse bg-[#F4C430]/10" />}
            </span>
            <div className="min-w-0 flex-1">
              <input
                value={coverHint}
                onChange={(e) => setCoverHint(e.target.value)}
                maxLength={60}
                placeholder="Optional: one element (violin…)"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-body text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
              />
              <button
                type="button"
                disabled={!canGenerate}
                onClick={() => void generateCover()}
                title={
                  canGenerate || coverBusy
                    ? "Generate cinematic cover art from your tags"
                    : "Pick at least one Use Case, Genre and Mood first"
                }
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#F4C430] px-3 py-1.5 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {coverBusy ? "Generating…" : cover ? "Regenerate" : "Generate cover"}
              </button>
            </div>
          </div>
          {!canGenerate && !coverBusy && !cover && (
            <p className="mt-2 font-body text-[11px] text-muted-foreground">
              Pick at least one Use Case, one Genre and one Mood to unlock generation.
            </p>
          )}
        </div>
      </div>
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
      </>
      )}
    </div>
  );
};

export default ComposerUpload;
