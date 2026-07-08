import { useRef, useState } from "react";
import { CheckCircle2, FileAudio, Loader2, Play, RotateCcw, Trash2, UploadCloud, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDuration, wavToMp3Pair, zipWavs } from "@/lib/audioEncoding";

// Admin → Bulk Upload: the first big catalog import. Drop dozens of WAVs;
// files sharing a base name become ONE track ("Epic Battle.wav" +
// "Epic Battle (short).wav" → track with 2 versions), the LONGEST version
// becomes Main. Everything is encoded in the browser (MP3 320/128 via lamejs,
// WAV zip via fflate — same pipeline as Add Track) and created as a DRAFT:
// hidden from customers until tagged and published in the Tracks manager.

const GOLD = "#F4C430";

interface QueuedFile {
  file: File;
  /** Version label parsed from the parenthetical: "Epic (short).wav" → "short". */
  suffix: string;
}

type GroupStatus = "queued" | "working" | "done" | "error";

interface Group {
  key: string;
  title: string;
  files: QueuedFile[];
  status: GroupStatus;
  note: string;
  error?: string;
}

const parseName = (filename: string): { title: string; suffix: string } => {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").trim();
  const m = base.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  return m ? { title: m[1].trim(), suffix: m[2].trim() } : { title: base, suffix: "" };
};

const uploadAudio = async (
  file: Blob,
  kind: "preview" | "preview128" | "wavzip",
  filename: string,
): Promise<{ key: string; path: string | null }> => {
  const base = filename.replace(/\.[^.]+$/, "");
  const res = await fetch(`/api/admin/upload-audio?kind=${kind}&filename=${encodeURIComponent(base)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type || (kind === "wavzip" ? "application/zip" : "audio/mpeg") },
    body: file,
  });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; key?: string; path?: string | null; error?: string };
  if (!res.ok || !d.ok || !d.key) throw new Error(d.error ?? "Upload failed");
  return { key: d.key, path: d.path ?? null };
};

const createTrack = async (payload: Record<string, unknown>): Promise<void> => {
  const res = await fetch("/api/admin/content", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create_track", status: "draft", ...payload }),
  });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !d.ok) throw new Error(d.error ?? "Create failed");
};

const AdminBulkUpload = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Abort flag readable from inside the loop.
  const stopRef = useRef(false);

  const patch = (key: string, p: Partial<Group>) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...p } : g)));

  const addFiles = (list: FileList | File[]) => {
    const wavs = [...list].filter((f) => /\.wav$/i.test(f.name));
    if (wavs.length === 0) {
      toast.error("Drop WAV files (.wav)");
      return;
    }
    setGroups((gs) => {
      const next = [...gs];
      for (const file of wavs) {
        const { title, suffix } = parseName(file.name);
        const key = title.toLowerCase();
        const existing = next.find((g) => g.key === key);
        const qf: QueuedFile = { file, suffix };
        if (existing) {
          // Re-adding to a finished/failed group re-queues it.
          if (!existing.files.some((x) => x.file.name === file.name && x.file.size === file.size)) {
            existing.files = [...existing.files, qf];
          }
          if (existing.status !== "working") {
            existing.status = "queued";
            existing.note = "";
            existing.error = undefined;
          }
        } else {
          next.push({ key, title, files: [qf], status: "queued", note: "", error: undefined });
        }
      }
      return [...next];
    });
  };

  const removeGroup = (key: string) => setGroups((gs) => gs.filter((g) => g.key !== key));

  const processGroup = async (group: Group) => {
    patch(group.key, { status: "working", note: "Decoding & encoding…", error: undefined });

    // 1. Encode every version (one at a time — keeps memory in check).
    const encoded: { qf: QueuedFile; mp3_320: Blob; mp3_128: Blob; duration: number }[] = [];
    for (let i = 0; i < group.files.length; i++) {
      const qf = group.files[i];
      patch(group.key, { note: `Encoding ${i + 1}/${group.files.length}: ${qf.file.name}` });
      const pair = await wavToMp3Pair(qf.file);
      encoded.push({ qf, ...pair });
    }

    // 2. Longest version becomes Main; the rest keep their filename suffix.
    const mainIdx = encoded.reduce((best, e, i) => (e.duration > encoded[best].duration ? i : best), 0);
    const ordered = [encoded[mainIdx], ...encoded.filter((_, i) => i !== mainIdx)];

    // 3. Upload previews (320 + 128) per version.
    const versions: { label: string; previewSrc: string; preview128?: string; duration: string }[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const e = ordered[i];
      patch(group.key, { note: `Uploading version ${i + 1}/${ordered.length}…` });
      const p320 = await uploadAudio(e.mp3_320, "preview", e.qf.file.name);
      const p128 = await uploadAudio(e.mp3_128, "preview128", e.qf.file.name);
      versions.push({
        label: i === 0 ? (e.qf.suffix || "Main") : (e.qf.suffix || `Version ${i + 1}`),
        previewSrc: p320.path ?? "",
        preview128: p128.path ?? undefined,
        duration: formatDuration(e.duration),
      });
    }

    // 4. One zip with all the original WAVs (the paid WAV download).
    patch(group.key, { note: "Packing & uploading WAV zip…" });
    const zipBlob = await zipWavs(group.files.map(({ file }) => ({ name: file.name, file })));
    const zipUp = await uploadAudio(zipBlob, "wavzip", group.title);

    // 5. Create the draft track.
    patch(group.key, { note: "Creating track…" });
    await createTrack({
      title: group.title,
      duration: versions[0].duration,
      versions,
      wavZipKey: zipUp.key,
    });

    patch(group.key, { status: "done", note: `Draft created · ${versions.length} version${versions.length > 1 ? "s" : ""}` });
  };

  const start = async () => {
    if (running) {
      stopRef.current = true;
      return;
    }
    stopRef.current = false;
    setRunning(true);
    const queue = groups.filter((g) => g.status === "queued" || g.status === "error");
    let done = 0;
    for (const g of queue) {
      if (stopRef.current) break;
      try {
        await processGroup(g);
        done += 1;
      } catch (e) {
        patch(g.key, {
          status: "error",
          note: "",
          error: e instanceof Error ? e.message : "Failed — press Start to retry",
        });
      }
    }
    setRunning(false);
    if (done > 0) {
      toast.success(`${done} draft track${done > 1 ? "s" : ""} created`, {
        description: "Tag them in Catalog → Tracks, then select and press Publish.",
      });
    }
  };

  const queuedCount = groups.filter((g) => g.status === "queued" || g.status === "error").length;
  const doneCount = groups.filter((g) => g.status === "done").length;

  const StatusIcon = ({ g }: { g: Group }) => {
    if (g.status === "done") return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    if (g.status === "error") return <XCircle className="h-4 w-4 text-red-400" />;
    if (g.status === "working") return <Loader2 className="h-4 w-4 animate-spin" style={{ color: GOLD }} />;
    return <FileAudio className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg text-foreground">Bulk Upload</h2>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        Drop WAV files below. Files sharing a name become one track ("Epic Battle.wav" +
        "Epic Battle (short).wav" → one track, the longest file becomes the Main version). Tracks
        are created as <span className="text-amber-400">drafts</span> — tag them in Catalog →
        Tracks, then select and press Publish. Keep this tab open while it runs; work in batches
        of ~20-30 files.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") inputRef.current?.click();
        }}
        className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#F4C430]/35 bg-[#F4C430]/[0.03] px-6 py-10 text-center transition-colors hover:border-[#F4C430]/70"
      >
        <UploadCloud className="h-8 w-8" style={{ color: GOLD }} />
        <p className="font-body text-sm text-foreground">Drop WAV files here or click to browse</p>
        <p className="font-body text-xs text-muted-foreground">.wav only · versions grouped by filename</p>
        <input
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Queue */}
      {groups.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void start()}
              disabled={!running && queuedCount === 0}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-body text-sm font-bold transition-colors disabled:opacity-40 ${
                running
                  ? "border border-red-400/50 text-red-400 hover:bg-red-400/10"
                  : "bg-[#F4C430] text-background hover:bg-[#F4C430]/85"
              }`}
            >
              {running ? (
                <>Stop after current</>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start upload ({queuedCount})
                </>
              )}
            </button>
            <span className="font-body text-xs text-muted-foreground">
              {groups.length} track{groups.length > 1 ? "s" : ""} in the list · {doneCount} done
            </span>
            {!running && doneCount > 0 && (
              <button
                type="button"
                onClick={() => setGroups((gs) => gs.filter((g) => g.status !== "done"))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-body text-xs text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear done
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            {groups.map((g) => (
              <div
                key={g.key}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  g.status === "working" ? "border-[#F4C430]/50 bg-[#F4C430]/[0.04]" : "border-border/60 bg-background/40"
                }`}
              >
                <StatusIcon g={g} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-sm text-foreground">
                    {g.title}
                    <span className="ml-2 font-body text-xs text-muted-foreground">
                      {g.files.length} file{g.files.length > 1 ? "s" : ""}
                      {g.files.length > 1 && ` (${g.files.map((f) => f.suffix || "main").join(", ")})`}
                    </span>
                  </span>
                  {(g.note || g.error) && (
                    <span className={`block truncate font-body text-xs ${g.error ? "text-red-400" : "text-muted-foreground"}`}>
                      {g.error ?? g.note}
                    </span>
                  )}
                </span>
                {g.status !== "working" && (
                  <button
                    type="button"
                    onClick={() => removeGroup(g.key)}
                    aria-label={`Remove ${g.title}`}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminBulkUpload;
