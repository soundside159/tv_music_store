import { useState } from "react";
import { toast } from "sonner";
import { Check, GripVertical, Music, Star, Trash2, X } from "lucide-react";
import type { Vocabularies } from "@/lib/tagOptions";
import { formatDuration, makeThumbnail, wavToMp3Pair, zipWavs } from "@/lib/audioEncoding";
import { cleanVersionLabel } from "@/lib/downloadTrack";

// Admin "Add Track" flow. The owner uploads WAV files and picks the main one;
// the browser (lamejs) makes an MP3 320 (site preview + 320 download) and MP3
// 128 (128 download) for every version, and packs all WAVs into one zip for the
// WAV/licensed download. No server-side transcoding (Workers can't run ffmpeg).

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";
const goldBtnCls =
  "rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50";
const btnCls =
  "rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-50";

type Facet = keyof Vocabularies;

interface VersionRow {
  id: string;
  file: File;
  label: string;
  edited: boolean;
}

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, "");

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

const AddTrackModal = ({
  onClose,
  run,
  uploadCover,
  uploadAudio,
  onCreated,
  vocabularies,
  categories,
  composers = [],
}: {
  onClose: () => void;
  run: (payload: Record<string, unknown>, okMsg: string) => Promise<boolean>;
  uploadCover: (file: File | Blob, apply: (path: string) => void, filename?: string) => Promise<void> | void;
  uploadAudio: (
    file: File | Blob,
    kind: "preview" | "preview128" | "master" | "wavzip" | "stems",
    filename?: string,
  ) => Promise<{ key: string; path: string | null } | null>;
  onCreated: () => void;
  vocabularies: Vocabularies;
  categories: { id: string; title: string }[];
  /** Composer profiles for the artist picker ("" = house / TVMUSICSTORE). */
  composers?: { id: string; displayName: string }[];
}) => {
  const [title, setTitle] = useState("");
  const [bpm, setBpm] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [cover, setCover] = useState("");
  const [coverThumb, setCoverThumb] = useState("");
  const [category, setCategory] = useState(categories[0]?.id ?? "");
  const [composerId, setComposerId] = useState("");
  // Stems ship as an optional zip — has_stems flips automatically when present
  // (the old manual checkbox was redundant and got removed).
  const [stemsFile, setStemsFile] = useState<File | null>(null);
  const [sel, setSel] = useState<Record<Facet, string[]>>({ useCase: [], genre: [], mood: [] });
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [mainIdx, setMainIdx] = useState(0);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const toggle = (facet: Facet, v: string) =>
    setSel((s) => ({
      ...s,
      [facet]: s[facet].includes(v) ? s[facet].filter((x) => x !== v) : [...s[facet], v],
    }));

  const addWavs = (files: FileList | null) => {
    if (!files) return;
    const incoming: VersionRow[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      label: baseName(file).slice(0, 60),
      edited: false,
    }));
    setVersions((prev) => [...prev, ...incoming].slice(0, 12));
  };

  // Shown label: auto-strip the track title from the filename (so "Opening Up
  // Space (short version)" shows as "short version") until the owner edits it.
  const labelOf = (v: VersionRow) => (v.edited ? v.label : cleanVersionLabel(baseName(v.file), title));

  const removeVersion = (id: string) =>
    setVersions((prev) => {
      const idx = prev.findIndex((v) => v.id === id);
      const next = prev.filter((v) => v.id !== id);
      // Keep the "main" pointer valid after a removal.
      setMainIdx((m) => (idx < m ? m - 1 : m >= next.length ? Math.max(0, next.length - 1) : m));
      return next;
    });

  const setLabel = (id: string, label: string) =>
    setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, label, edited: true } : v)));

  const onCover = async (file: File) => {
    setUploadingCover(true);
    try {
      await uploadCover(file, (p) => setCover(p), file.name);
      const thumb = await makeThumbnail(file, 200);
      await uploadCover(thumb, (p) => setCoverThumb(p), `${file.name.replace(/\.[^.]+$/, "")}-thumb.jpg`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cover failed");
    } finally {
      setUploadingCover(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (versions.length === 0) return toast.error("Add at least one WAV file");
    setBusy(true);
    try {
      // Process main first, then the rest, so version_id "main" is the chosen one.
      const ordered = [versions[mainIdx], ...versions.filter((_, i) => i !== mainIdx)];

      const outVersions: {
        label: string;
        previewSrc: string;
        preview128: string;
        duration: string;
      }[] = [];

      for (let i = 0; i < ordered.length; i++) {
        const v = ordered[i];
        // Clean label with the track title stripped; main -> "Main".
        const cleaned = labelOf(v) || (i === 0 ? "Main" : `Version ${i + 1}`);
        setProgress(`Encoding "${cleaned}" (${i + 1}/${ordered.length})…`);
        await yieldToUi();
        const { mp3_320, mp3_128, duration } = await wavToMp3Pair(v.file);
        const base = `${title.trim()}-${cleaned}`;
        const up320 = await uploadAudio(mp3_320, "preview", `${base}-320.mp3`);
        if (!up320?.path) throw new Error(`Upload failed for "${cleaned}" (320)`);
        const up128 = await uploadAudio(mp3_128, "preview128", `${base}-128.mp3`);
        if (!up128?.path) throw new Error(`Upload failed for "${cleaned}" (128)`);
        outVersions.push({
          label: cleaned,
          previewSrc: up320.path,
          preview128: up128.path,
          duration: formatDuration(duration),
        });
      }

      setProgress("Packing WAV bundle…");
      await yieldToUi();
      const zipBlob = await zipWavs(ordered.map((v) => ({ name: v.file.name, file: v.file })));
      const zipUp = await uploadAudio(zipBlob, "wavzip", `${title.trim()}-wav`);
      if (!zipUp?.key) throw new Error("WAV bundle upload failed");

      let stemsKey: string | undefined;
      if (stemsFile) {
        setProgress("Uploading stems zip…");
        const stemsUp = await uploadAudio(stemsFile, "stems", stemsFile.name);
        if (!stemsUp?.key) throw new Error("Stems upload failed");
        stemsKey = stemsUp.key;
      }

      setProgress("Saving track…");
      const ok = await run(
        {
          action: "create_track",
          title: title.trim(),
          bpm: bpm ? Number(bpm) : undefined,
          duration: outVersions[0]?.duration ?? "",
          description: description.trim(),
          tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
          useCase: sel.useCase.join(" / "),
          genre: sel.genre.join(" / "),
          mood: sel.mood.join(" / "),
          cover: cover || undefined,
          coverThumb: coverThumb || undefined,
          category: category || undefined,
          composerId: composerId || undefined,
          stemsKey,
          versions: outVersions,
          wavZipKey: zipUp.key,
        },
        "Track created",
      );
      if (ok) {
        onCreated();
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create track");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const facetRow = (facet: Facet, label: string) => (
    <div>
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
              onClick={() => toggle(facet, v)}
              className={`rounded-full border px-2.5 py-1 font-body text-xs transition-colors ${
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
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add track"
    >
      <div
        className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-body text-lg font-semibold text-foreground">Add track</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <input
            placeholder="Track title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
          <div className="flex flex-wrap gap-3">
            <input
              placeholder="BPM"
              inputMode="numeric"
              value={bpm}
              onChange={(e) => setBpm(e.target.value.replace(/[^0-9]/g, ""))}
              className={`${inputCls} w-24`}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${inputCls} min-w-0 flex-1`}
              aria-label="Category"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              value={composerId}
              onChange={(e) => setComposerId(e.target.value)}
              className={`${inputCls} min-w-0 flex-1`}
              aria-label="Composer"
              title="Composer pseudonym shown as the track artist"
            >
              <option value="">Composer: TVMUSICSTORE (house)</option>
              {composers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
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

          {facetRow("useCase", "Use Case")}
          {facetRow("genre", "Genre")}
          {facetRow("mood", "Mood")}

          {/* Optional stems zip — attaching it flips has_stems on automatically. */}
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
            <span className="font-body text-[11px] text-muted-foreground">
              STEMS badge &amp; Max-plan download switch on automatically
            </span>
          </div>

          {/* WAV versions */}
          <div className="border-t border-border/60 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                WAV versions *
              </p>
              <span className="font-body text-[11px] text-muted-foreground">
                MP3 320/128 are made in your browser · all WAVs bundled into a zip
              </span>
            </div>

            {versions.length > 0 && (
              <div className="mb-3 flex flex-col gap-2">
                {versions.map((v, i) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-2"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    <button
                      type="button"
                      onClick={() => setMainIdx(i)}
                      title={i === mainIdx ? "Main version (site preview)" : "Set as main"}
                      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-body text-[11px] font-semibold transition-colors ${
                        i === mainIdx
                          ? "bg-[#F4C430]/15 text-[#F4C430]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${i === mainIdx ? "fill-[#F4C430]" : ""}`} />
                      {i === mainIdx ? "Main" : "Set main"}
                    </button>
                    <input
                      value={labelOf(v)}
                      onChange={(e) => setLabel(v.id, e.target.value)}
                      placeholder={i === mainIdx ? "Main" : "Version label"}
                      className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
                    />
                    <span className="hidden max-w-[9rem] shrink-0 truncate font-body text-[11px] text-muted-foreground sm:block">
                      {v.file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeVersion(v.id)}
                      aria-label="Remove"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className={`${btnCls} inline-flex cursor-pointer items-center gap-1.5`}>
              <Music className="h-3.5 w-3.5" />
              {versions.length ? "Add more WAVs" : "Choose WAV file(s)"}
              <input
                type="file"
                accept="audio/wav,.wav"
                multiple
                className="hidden"
                onChange={(e) => {
                  addWavs(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {/* Cover */}
          <div className="border-t border-border/60 pt-4">
            <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cover (1000×1000) — a thumbnail is made automatically
            </p>
            <div className="flex items-center gap-2">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border/50 bg-secondary">
                {cover ? (
                  <img src={cover} alt="" className="h-12 w-12 object-cover" />
                ) : (
                  <Music className="h-4 w-4 text-muted-foreground/70" />
                )}
              </span>
              <label
                className={`${btnCls} cursor-pointer ${uploadingCover ? "pointer-events-none opacity-60" : ""}`}
              >
                {uploadingCover ? "Uploading…" : cover ? "Replace cover" : "Choose cover"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onCover(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {coverThumb && <span className="font-body text-[11px] text-muted-foreground">thumb ✓</span>}
            </div>
          </div>
        </div>

        {progress && (
          <p className="mt-4 rounded-lg border border-[#F4C430]/40 bg-[#F4C430]/5 px-3 py-2 text-center font-body text-xs text-[#F4C430]">
            {progress}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="font-body text-[11px] text-muted-foreground">
            {versions.length > 0 ? `${versions.length} version(s) · encoding may take a moment` : ""}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={btnCls}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || uploadingCover || !title.trim() || versions.length === 0}
              onClick={() => void submit()}
              className={goldBtnCls}
            >
              {busy ? "Working…" : "Create track"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddTrackModal;
