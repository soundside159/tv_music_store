import { useState } from "react";
import { toast } from "sonner";
import { Check, Music, X } from "lucide-react";
import type { Vocabularies } from "@/lib/tagOptions";

// Admin "Add Track" flow: metadata + tag chips + cover / preview-MP3 / master-WAV
// uploads to R2, then POST create_track. Preview is required; master is optional.

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";
const goldBtnCls =
  "rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50";
const btnCls =
  "rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-50";

type Facet = keyof Vocabularies;

// Read a media file's duration locally (no upload needed) and format as m:ss.
// Returns "" if the browser can't decode the metadata.
const readAudioDuration = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    const finish = (value: string) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => {
      const secs = audio.duration;
      if (!Number.isFinite(secs) || secs <= 0) return finish("");
      let m = Math.floor(secs / 60);
      let s = Math.round(secs % 60);
      if (s === 60) {
        m += 1;
        s = 0;
      }
      finish(`${m}:${String(s).padStart(2, "0")}`);
    };
    audio.onerror = () => finish("");
    audio.src = url;
  });

const AddTrackModal = ({
  onClose,
  run,
  uploadCover,
  uploadAudio,
  onCreated,
  vocabularies,
  categories,
}: {
  onClose: () => void;
  run: (payload: Record<string, unknown>, okMsg: string) => Promise<boolean>;
  uploadCover: (file: File, apply: (path: string) => void) => Promise<void> | void;
  uploadAudio: (file: File, kind: "preview" | "master") => Promise<{ key: string; path: string | null } | null>;
  onCreated: () => void;
  vocabularies: Vocabularies;
  categories: { id: string; title: string }[];
}) => {
  const [title, setTitle] = useState("");
  const [bpm, setBpm] = useState("");
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [cover, setCover] = useState("");
  const [category, setCategory] = useState(categories[0]?.id ?? "");
  const [hasStems, setHasStems] = useState(false);
  const [sel, setSel] = useState<Record<Facet, string[]>>({ useCase: [], genre: [], mood: [] });
  const [previewSrc, setPreviewSrc] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [masterName, setMasterName] = useState("");
  const [uploading, setUploading] = useState<"" | "cover" | "preview" | "master">("");
  const [busy, setBusy] = useState(false);

  const toggle = (facet: Facet, v: string) =>
    setSel((s) => ({
      ...s,
      [facet]: s[facet].includes(v) ? s[facet].filter((x) => x !== v) : [...s[facet], v],
    }));

  const onCover = async (file: File) => {
    setUploading("cover");
    await uploadCover(file, (p) => setCover(p));
    setUploading("");
  };
  const onAudio = async (file: File, kind: "preview" | "master") => {
    setUploading(kind);
    // Auto-fill duration from the preview audio itself (local, before upload).
    if (kind === "preview") {
      const detected = await readAudioDuration(file);
      if (detected) setDuration(detected);
    }
    const r = await uploadAudio(file, kind);
    setUploading("");
    if (!r) return;
    if (kind === "preview") {
      setPreviewSrc(r.path ?? "");
      setPreviewName(file.name);
    } else {
      setMasterKey(r.key);
      setMasterName(file.name);
    }
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!previewSrc) return toast.error("Upload an MP3 preview first");
    setBusy(true);
    const ok = await run(
      {
        action: "create_track",
        title: title.trim(),
        bpm: bpm ? Number(bpm) : undefined,
        duration: duration.trim(),
        description: description.trim(),
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
        useCase: sel.useCase.join(" / "),
        genre: sel.genre.join(" / "),
        mood: sel.mood.join(" / "),
        cover: cover || undefined,
        category: category || undefined,
        hasStems,
        previewSrc,
        masterKey: masterKey || undefined,
      },
      "Track created",
    );
    setBusy(false);
    if (ok) {
      onCreated();
      onClose();
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
      onClick={onClose}
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
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
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
            <input
              placeholder="Duration (auto from audio)"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              title="Filled automatically from the preview MP3 — editable if needed"
              className={`${inputCls} w-44`}
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

          <label className="flex items-center gap-2.5">
            <span
              onClick={() => setHasStems((v) => !v)}
              className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded border ${
                hasStems ? "border-[#F4C430] bg-[#F4C430]" : "border-border"
              }`}
            >
              {hasStems && <Check className="h-3 w-3 text-background" />}
            </span>
            <span className="font-body text-xs text-foreground/90">
              Includes stems (shown on the track page, Max-plan download)
            </span>
          </label>

          {/* Uploads */}
          <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
            <UploadField
              label="Cover (1000×1000)"
              accept="image/png,image/jpeg,image/webp"
              busy={uploading === "cover"}
              done={cover ? "Uploaded" : ""}
              onFile={onCover}
              preview={
                cover ? (
                  <img src={cover} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <Music className="h-4 w-4 text-muted-foreground/70" />
                )
              }
            />
            <UploadField
              label="Preview MP3 *"
              accept="audio/mpeg"
              busy={uploading === "preview"}
              done={previewName}
              onFile={(f) => onAudio(f, "preview")}
            />
            <UploadField
              label="Master WAV (optional)"
              accept="audio/wav,audio/mpeg"
              busy={uploading === "master"}
              done={masterName}
              onFile={(f) => onAudio(f, "master")}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnCls}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !!uploading || !title.trim() || !previewSrc}
            onClick={() => void submit()}
            className={goldBtnCls}
          >
            {busy ? "Creating..." : "Create track"}
          </button>
        </div>
      </div>
    </div>
  );
};

const UploadField = ({
  label,
  accept,
  busy,
  done,
  onFile,
  preview,
}: {
  label: string;
  accept: string;
  busy: boolean;
  done: string;
  onFile: (file: File) => void;
  preview?: React.ReactNode;
}) => (
  <div className="rounded-lg border border-border/60 p-3">
    <p className="mb-2 font-body text-xs font-semibold text-foreground">{label}</p>
    <div className="flex items-center gap-2">
      {preview && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border/50 bg-secondary">
          {preview}
        </span>
      )}
      <label className={`${btnCls} cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? "Uploading..." : "Choose file"}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {done && <span className="min-w-0 truncate font-body text-xs text-muted-foreground">{done}</span>}
    </div>
  </div>
);

export default AddTrackModal;
