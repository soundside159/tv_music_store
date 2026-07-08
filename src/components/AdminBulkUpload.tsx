import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileAudio,
  FolderOpen,
  Loader2,
  Play,
  RotateCcw,
  Star,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDuration, wavToMp3Pair, zipWavs } from "@/lib/audioEncoding";
import { cleanVersionLabel } from "@/lib/downloadTrack";

// Admin → Bulk Upload: the first big catalog import.
// GROUPING (owner's rule): a FOLDER = one track — folder name is the title and
// every WAV inside is a version. Loose files fall back to filename grouping
// ("Epic Battle.wav" + "Epic Battle (short).wav" → one track). The MAIN version
// is the longest file by default; click the star on a file to override.
// Everything is encoded in the browser (MP3 320/128 via lamejs, WAV zip via
// fflate — same pipeline as Add Track) and created as a DRAFT: hidden from
// customers until tagged and published in the Tracks manager.

const GOLD = "#F4C430";

interface QueuedFile {
  file: File;
  /** Raw filename without extension ("Opening Up Space (middle version)"). */
  base: string;
}

type GroupStatus = "queued" | "working" | "done" | "error";

interface Group {
  key: string;
  title: string;
  files: QueuedFile[];
  /** file.name of the version the owner starred as Main; null = auto (longest). */
  mainName: string | null;
  status: GroupStatus;
  note: string;
  error?: string;
}

const baseName = (filename: string) => filename.replace(/\.[a-z0-9]+$/i, "").trim();

/** "Epic Battle (short version)" -> { title: "Epic Battle", hasSuffix: true }. */
const parseLooseName = (filename: string): { title: string } => {
  const base = baseName(filename);
  const m = base.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  return { title: (m ? m[1] : base).trim() };
};

interface Incoming {
  file: File;
  /** Top-level folder the file came from, if any — that folder = the track. */
  folder: string | null;
}

// --- Directory traversal for drag&drop (webkitGetAsEntry) -------------------

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader: () => {
    readEntries: (ok: (list: EntryLike[]) => void, err: (e: unknown) => void) => void;
  };
}

const filesFromEntry = async (entry: EntryLike, topFolder: string | null): Promise<Incoming[]> => {
  if (entry.isFile) {
    const file = await new Promise<File>((ok, err) => entry.file(ok, err));
    return /\.wav$/i.test(file.name) ? [{ file, folder: topFolder }] : [];
  }
  if (entry.isDirectory) {
    // The TOP folder names the track; nested folders keep the top name.
    const folderName = topFolder ?? entry.name;
    const reader = entry.createReader();
    const entries: EntryLike[] = [];
    for (;;) {
      const chunk = await new Promise<EntryLike[]>((ok, err) => reader.readEntries(ok, err));
      if (chunk.length === 0) break;
      entries.push(...chunk);
    }
    const nested = await Promise.all(entries.map((e) => filesFromEntry(e, folderName)));
    return nested.flat();
  }
  return [];
};

// --- Uploads -----------------------------------------------------------------

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

// -----------------------------------------------------------------------------

const AdminBulkUpload = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [running, setRunning] = useState(false);
  // Whole-batch composer: every track created in this run gets this profile
  // ("" = house catalog / TVMUSICSTORE). List comes from the admin content API.
  const [composers, setComposers] = useState<{ id: string; displayName: string }[]>([]);
  const [composerId, setComposerId] = useState("");
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/content", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const d = (await res.json()) as {
          composers?: { id: string; displayName: string }[];
        };
        if (!cancelled && d.composers) setComposers(d.composers);
      })
      .catch(() => {
        // picker simply stays "house"
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (key: string, p: Partial<Group>) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...p } : g)));

  const addIncoming = (list: Incoming[]) => {
    const wavs = list.filter((x) => /\.wav$/i.test(x.file.name));
    if (wavs.length === 0) {
      toast.error("No WAV files found (.wav only)");
      return;
    }
    let skippedDone = 0;
    setGroups((gs) => {
      const next = [...gs];
      for (const { file, folder } of wavs) {
        const title = (folder ?? parseLooseName(file.name).title).trim();
        const key = title.toLowerCase();
        const existing = next.find((g) => g.key === key);
        const qf: QueuedFile = { file, base: baseName(file.name) };
        if (existing) {
          if (existing.status === "done") {
            // The track was already created — re-processing would duplicate it.
            skippedDone += 1;
            continue;
          }
          if (existing.status === "working") continue; // can't change a running group
          if (!existing.files.some((x) => x.file.name === file.name && x.file.size === file.size)) {
            existing.files = [...existing.files, qf];
          }
          existing.status = "queued";
          existing.note = "";
          existing.error = undefined;
        } else {
          next.push({ key, title, files: [qf], mainName: null, status: "queued", note: "", error: undefined });
        }
      }
      return [...next];
    });
    if (skippedDone > 0) {
      toast.error(`${skippedDone} file(s) skipped — that track is already created. Delete it in Tracks and re-upload.`);
    }
  };

  const addFileList = (list: FileList) => {
    // Folder-picker files carry webkitRelativePath ("Folder/file.wav").
    addIncoming(
      [...list].map((file) => {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
        const folder = rel.includes("/") ? rel.split("/")[0] : null;
        return { file, folder };
      }),
    );
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const items = [...e.dataTransfer.items];
    const entries = items
      .map((i) => (i.webkitGetAsEntry ? (i.webkitGetAsEntry() as unknown as EntryLike | null) : null))
      .filter((x): x is EntryLike => !!x);
    if (entries.length > 0) {
      try {
        const collected = await Promise.all(
          entries.map((entry) => filesFromEntry(entry, entry.isDirectory ? entry.name : null)),
        );
        addIncoming(collected.flat());
        return;
      } catch {
        // fall through to the plain file list
      }
    }
    addFileList(e.dataTransfer.files);
  };

  const removeGroup = (key: string) => setGroups((gs) => gs.filter((g) => g.key !== key));

  const removeFile = (key: string, name: string) =>
    setGroups((gs) =>
      gs
        .map((g) =>
          g.key === key
            ? {
                ...g,
                files: g.files.filter((f) => f.file.name !== name),
                mainName: g.mainName === name ? null : g.mainName,
              }
            : g,
        )
        .filter((g) => g.files.length > 0),
    );

  const toggleMain = (key: string, name: string) =>
    setGroups((gs) =>
      gs.map((g) => (g.key === key ? { ...g, mainName: g.mainName === name ? null : name } : g)),
    );

  /** Version label shown on the site: filename minus the track title. */
  const labelOf = (g: Group, qf: QueuedFile) => cleanVersionLabel(qf.base, g.title);

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

    // 2. Main = the starred file, else the longest one.
    let mainIdx = group.mainName
      ? encoded.findIndex((e) => e.qf.file.name === group.mainName)
      : -1;
    if (mainIdx === -1) {
      mainIdx = encoded.reduce((best, e, i) => (e.duration > encoded[best].duration ? i : best), 0);
    }
    const ordered = [encoded[mainIdx], ...encoded.filter((_, i) => i !== mainIdx)];

    // 3. Upload previews (320 + 128) per version.
    const versions: { label: string; previewSrc: string; preview128?: string; duration: string }[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const e = ordered[i];
      patch(group.key, { note: `Uploading version ${i + 1}/${ordered.length}…` });
      const p320 = await uploadAudio(e.mp3_320, "preview", e.qf.file.name);
      const p128 = await uploadAudio(e.mp3_128, "preview128", e.qf.file.name);
      const clean = labelOf(group, e.qf);
      versions.push({
        label: i === 0 ? clean || "Main" : clean || `Version ${i + 1}`,
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
      composerId: composerId || undefined,
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
        <span className="text-foreground">One folder = one track</span>: the folder name becomes the
        title, every WAV inside becomes a version. Loose files are grouped by name ("Epic
        Battle (short).wav" joins "Epic Battle.wav"). The longest version becomes Main — star a
        file to override. Tracks are created as <span className="text-amber-400">drafts</span> —
        tag them in Catalog → Tracks, then select and press Publish. Keep this tab open; work in
        batches of ~20-30 tracks.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void onDrop(e)}
        className="mt-5 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#F4C430]/35 bg-[#F4C430]/[0.03] px-6 py-10 text-center transition-colors hover:border-[#F4C430]/70"
      >
        <UploadCloud className="h-8 w-8" style={{ color: GOLD }} />
        <p className="font-body text-sm text-foreground">Drop track FOLDERS (or WAV files) here</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => folderRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#F4C430]/50 px-3 py-1.5 font-body text-xs font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430]/10"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Select folder
          </button>
          <button
            type="button"
            onClick={() => filesRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
          >
            <FileAudio className="h-3.5 w-3.5" />
            Select WAV files
          </button>
        </div>
        <input
          ref={filesRef}
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFileList(e.target.files);
            e.target.value = "";
          }}
        />
        {/* Folder picker (webkitdirectory isn't in React's input types). */}
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(e) => {
            if (e.target.files) addFileList(e.target.files);
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
            <select
              value={composerId}
              disabled={running}
              onChange={(e) => setComposerId(e.target.value)}
              aria-label="Composer for this batch"
              title="Every track created in this run is credited to this composer"
              className="rounded-lg border border-border bg-background px-2.5 py-2 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none disabled:opacity-50"
            >
              <option value="">Composer: TVMUSICSTORE (house)</option>
              {composers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
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

          <div className="mt-4 flex flex-col gap-2">
            {groups.map((g) => {
              const autoMain = !g.mainName;
              return (
                <div
                  key={g.key}
                  className={`rounded-lg border px-3 py-2.5 ${
                    g.status === "working" ? "border-[#F4C430]/50 bg-[#F4C430]/[0.04]" : "border-border/60 bg-background/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon g={g} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body text-sm font-semibold text-foreground">{g.title}</span>
                      {(g.note || g.error) && (
                        <span className={`block truncate font-body text-xs ${g.error ? "text-red-400" : "text-muted-foreground"}`}>
                          {g.error ?? g.note}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-body text-[11px] text-muted-foreground">
                      {g.files.length} version{g.files.length > 1 ? "s" : ""}
                      {g.files.length > 1 && (autoMain ? " · main: longest (auto)" : "")}
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

                  {/* Version files: star = Main override, X = drop the file. */}
                  {g.status !== "done" && (
                    <ul className="mt-2 flex flex-col gap-0.5 border-t border-border/40 pt-2">
                      {g.files.map((qf) => {
                        const isMain = g.mainName === qf.file.name;
                        const label = labelOf(g, qf) || "Main";
                        return (
                          <li key={qf.file.name} className="flex items-center gap-2 pl-6">
                            <button
                              type="button"
                              disabled={g.status === "working"}
                              onClick={() => toggleMain(g.key, qf.file.name)}
                              title={isMain ? "Main version (click for auto: longest)" : "Make this the Main version"}
                              aria-label={`Set ${qf.file.name} as main`}
                              className="shrink-0 disabled:opacity-40"
                            >
                              <Star
                                className="h-3.5 w-3.5"
                                style={isMain ? { color: GOLD, fill: GOLD } : { color: "#666" }}
                              />
                            </button>
                            <span className="min-w-0 flex-1 truncate font-body text-xs text-muted-foreground">
                              {qf.file.name}
                              <span className="ml-2 text-foreground/80">→ {label}</span>
                            </span>
                            {g.status !== "working" && g.files.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeFile(g.key, qf.file.name)}
                                aria-label={`Remove ${qf.file.name}`}
                                className="shrink-0 text-muted-foreground/60 transition-colors hover:text-red-400"
                              >
                                <XCircle className="h-3 w-3" />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminBulkUpload;
