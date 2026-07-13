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
import { decodeAudio, detectBpm, encodeMp3, formatDuration, wavToMp3Pair } from "@/lib/audioEncoding";
import { crc32File } from "@/lib/crc32";
import { cleanVersionLabel } from "@/lib/downloadTrack";
import { useCurrentUser } from "@/hooks/useMockData";

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

/** What is happening to ONE file right now (shown next to it in the queue). */
type FileStage =
  | "reading"
  | "encoding"
  | "encoded"
  | "bpm"
  | "checksum"
  | "uploading-preview"
  | "uploading-master"
  | "done"
  | "error";

interface FileProgress {
  stage: FileStage;
  /** 0-100 for the upload stages. */
  pct?: number;
}

interface Group {
  key: string;
  title: string;
  files: QueuedFile[];
  /** WAVs named …_stem_… / …_stems_… — packed into a SEPARATE stems zip. */
  stems: QueuedFile[];
  /** file.name of the version the owner starred as Main; null = auto (longest). */
  mainName: string | null;
  status: GroupStatus;
  note: string;
  error?: string;
  /** Per-file live status, keyed by file.name — nothing here = still waiting. */
  fileProgress: Record<string, FileProgress>;
}

/** Short human label for the chip next to a file in the queue. */
const stageLabel = (p: FileProgress | undefined): string => {
  if (!p) return "";
  switch (p.stage) {
    case "reading":
      return "reading…";
    case "encoding":
      return "encoding MP3…";
    case "encoded":
      return "encoded";
    case "bpm":
      return "detecting BPM…";
    case "checksum":
      return "checksum…";
    case "uploading-preview":
      return `uploading preview ${p.pct ?? 0}%`;
    case "uploading-master":
      return `uploading master ${p.pct ?? 0}%`;
    case "done":
      return "uploaded";
    case "error":
      return "failed";
  }
};

const STAGE_BUSY: FileStage[] = [
  "reading",
  "encoding",
  "bpm",
  "checksum",
  "uploading-preview",
  "uploading-master",
];

const baseName = (filename: string) => filename.replace(/\.[a-z0-9]+$/i, "").trim();

/** Track titles lose leading catalog numbers: "1685_As Light As A Feather"
 *  → "As Light As A Feather" (many stock libraries prefix files this way).
 *  Digits followed by a duration word stay: "15sec…" / "30 sec…" keep the 15. */
const cleanTitle = (s: string) =>
  s.replace(/^\s*\d+[\s._-]+(?!(?:sec(?:s|onds?)?|min(?:s|utes?)?)\b)/i, "").trim() || s.trim();

/** "Epic Battle_Stems_Drums.wav" → a stem, not a version of the track. */
const isStemFile = (filename: string) => /(^|[_\s(-])stems?([_\s).-]|$)/i.test(baseName(filename));

/** "Epic Battle_main.wav" → this file is the Main version (unless starred). */
const isMainFile = (filename: string) => /(^|[_\s(-])main([_\s).-]|$)/i.test(baseName(filename));

/** Audio we accept: WAV (full pipeline) and MP3 (used as the 320 preview
 *  as-is — no re-encode; a 128 kbps copy is still made for the free tier). */
const isAudioFile = (filename: string) => /\.(wav|mp3)$/i.test(filename);
const isMp3 = (filename: string) => /\.mp3$/i.test(filename);

/** Cloudflare rejects request bodies over ~100 MB; our server cap is 95 MB. */
const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/** Track title for a loose stem file: everything before the stem marker. */
const stemTitle = (filename: string): string => {
  const base = baseName(filename);
  const m = base.match(/^(.*?)[_\s(-]+stems?([_\s).-]|$)/i);
  return (m ? m[1] : base).replace(/[_\s-]+$/, "").trim();
};

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

const filesFromEntry = async (entry: EntryLike, parentFolder: string | null): Promise<Incoming[]> => {
  if (entry.isFile) {
    const file = await new Promise<File>((ok, err) => entry.file(ok, err));
    return isAudioFile(file.name) ? [{ file, folder: parentFolder }] : [];
  }
  if (entry.isDirectory) {
    // The CLOSEST folder around a WAV names its track — so a wrapper folder
    // full of track folders imports each subfolder as its own track.
    const reader = entry.createReader();
    const entries: EntryLike[] = [];
    for (;;) {
      const chunk = await new Promise<EntryLike[]>((ok, err) => reader.readEntries(ok, err));
      if (chunk.length === 0) break;
      entries.push(...chunk);
    }
    const nested = await Promise.all(entries.map((e) => filesFromEntry(e, entry.name)));
    return nested.flat();
  }
  return [];
};

// --- Uploads -----------------------------------------------------------------

const uploadAudio = (
  file: Blob,
  kind: "preview" | "preview128" | "wavzip" | "stems" | "master",
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<{ key: string; path: string | null }> => {
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(
      new Error(
        `${kind === "stems" ? "STEMS zip" : kind === "wavzip" ? "WAV zip" : "File"} is ${mb(file.size)} — over the ~95 MB per-upload limit. Split it into smaller parts.`,
      ),
    );
  }
  const base = filename.replace(/\.[^.]+$/, "");
  // XMLHttpRequest instead of fetch — it reports UPLOAD progress, so the big
  // zips show a live percentage instead of a silent multi-minute wait.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/upload-audio?kind=${kind}&filename=${encodeURIComponent(base)}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader(
      "content-type",
      file.type ||
        (kind === "wavzip" || kind === "stems"
          ? "application/zip"
          : kind === "master"
            ? "audio/wav"
            : "audio/mpeg"),
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let d: { ok?: boolean; key?: string; path?: string | null; error?: string } = {};
      try {
        d = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300 && d.ok && d.key) {
        resolve({ key: d.key, path: d.path ?? null });
      } else {
        reject(new Error(d.error ?? `Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
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

/** The little live-status chip next to a file: "encoding MP3…", "uploading master 42%", "uploaded". */
const FileStatus = ({ p }: { p?: FileProgress }) => {
  if (!p) return null;
  const busy = STAGE_BUSY.includes(p.stage);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-body text-[10px] tabular-nums ${
        p.stage === "error"
          ? "text-red-400"
          : p.stage === "done"
            ? "text-[#F4C430]"
            : busy
              ? "text-foreground"
              : "text-muted-foreground"
      }`}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {p.stage === "done" && <CheckCircle2 className="h-3 w-3" />}
      {stageLabel(p)}
    </span>
  );
};

const AdminBulkUpload = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [running, setRunning] = useState(false);
  // Whole-batch composer: every track created in this run gets this profile
  // ("" = No composer / house catalog). List comes from the admin content API.
  // Deliberately NOT preselected (owner request): he must consciously pick one
  // per batch — auto-preselecting his own profile caused wrong-account uploads.
  const user = useCurrentUser();
  const [composers, setComposers] = useState<{ id: string; userId: string | null; displayName: string }[]>([]);
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
          composers?: { id: string; userId: string | null; displayName: string }[];
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

  /** Live per-file status — this is what tells the owner WHERE a run is stuck. */
  const patchFile = (key: string, name: string, p: FileProgress) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.key === key ? { ...g, fileProgress: { ...g.fileProgress, [name]: p } } : g,
      ),
    );

  const addIncoming = (list: Incoming[]) => {
    const wavs = list.filter((x) => isAudioFile(x.file.name));
    if (wavs.length === 0) {
      toast.error("No audio files found (.wav or .mp3)");
      return;
    }
    let skippedDone = 0;
    setGroups((gs) => {
      const next = [...gs];
      for (const { file, folder } of wavs) {
        // Files named …_stem(s)_… are STEMS of the track, not versions — they
        // go into their own zip and unlock the STEMS download automatically.
        const stem = isStemFile(file.name);
        const title = cleanTitle(folder ?? (stem ? stemTitle(file.name) : parseLooseName(file.name).title));
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
          const list = stem ? existing.stems : existing.files;
          if (!list.some((x) => x.file.name === file.name && x.file.size === file.size)) {
            if (stem) existing.stems = [...existing.stems, qf];
            else existing.files = [...existing.files, qf];
          }
          // A file named ..._main... stars itself on drop, so the Main version
          // is visible in the queue before anything is uploaded.
          if (!stem && !existing.mainName && isMainFile(file.name)) existing.mainName = file.name;
          existing.status = "queued";
          existing.note = "";
          existing.error = undefined;
        } else {
          next.push({
            key,
            title,
            files: stem ? [] : [qf],
            stems: stem ? [qf] : [],
            mainName: !stem && isMainFile(file.name) ? file.name : null,
            status: "queued",
            note: "",
            error: undefined,
            fileProgress: {},
          });
        }
      }
      return [...next];
    });
    if (skippedDone > 0) {
      toast.error(`${skippedDone} file(s) skipped — that track is already created. Delete it in Tracks and re-upload.`);
    }
  };

  const addFileList = (list: FileList) => {
    // Folder-picker files carry webkitRelativePath ("Wrapper/Track A/file.wav")
    // — the CLOSEST folder names the track, so nested folders import as
    // separate tracks.
    addIncoming(
      [...list].map((file) => {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
        const parts = rel.split("/");
        const folder = parts.length > 1 ? parts[parts.length - 2] : null;
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
        const collected = await Promise.all(entries.map((entry) => filesFromEntry(entry, null)));
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
                stems: g.stems.filter((f) => f.file.name !== name),
                mainName: g.mainName === name ? null : g.mainName,
              }
            : g,
        )
        .filter((g) => g.files.length > 0 || g.stems.length > 0),
    );

  const toggleMain = (key: string, name: string) =>
    setGroups((gs) =>
      gs.map((g) => (g.key === key ? { ...g, mainName: g.mainName === name ? null : name } : g)),
    );

  /** Version label shown on the site: filename minus the track title. */
  const labelOf = (g: Group, qf: QueuedFile) => cleanVersionLabel(qf.base, g.title);

  const processGroup = async (group: Group) => {
    if (group.files.length === 0) {
      throw new Error("Only stem files here — add at least one version WAV for this track");
    }
    patch(group.key, { status: "working", note: "Decoding & encoding…", error: undefined });

    // 1. Encode every version (one at a time — keeps memory in check).
    //    WAV → MP3 320 + 128; MP3 → used AS-IS for the 320 preview (no
    //    re-encode), only the 128 kbps copy is rendered from it.
    const encoded: { qf: QueuedFile; mp3_320: Blob; mp3_128: Blob; duration: number }[] = [];
    for (let i = 0; i < group.files.length; i++) {
      const qf = group.files[i];
      const name = qf.file.name;
      if (isMp3(name)) {
        patch(group.key, { note: `Reading MP3 ${i + 1}/${group.files.length}: ${name}` });
        patchFile(group.key, name, { stage: "reading" });
        const buffer = await decodeAudio(qf.file);
        encoded.push({
          qf,
          mp3_320: qf.file,
          mp3_128: encodeMp3(buffer, 128),
          duration: buffer.duration,
        });
      } else {
        patch(group.key, { note: `Encoding ${i + 1}/${group.files.length}: ${name}` });
        patchFile(group.key, name, { stage: "encoding" });
        const pair = await wavToMp3Pair(qf.file);
        encoded.push({ qf, ...pair });
      }
      patchFile(group.key, name, { stage: "encoded" });
    }

    // 2. Main = the starred file → a file named …_main… → else the longest.
    let mainIdx = group.mainName
      ? encoded.findIndex((e) => e.qf.file.name === group.mainName)
      : -1;
    if (mainIdx === -1) mainIdx = encoded.findIndex((e) => isMainFile(e.qf.file.name));
    if (mainIdx === -1) {
      mainIdx = encoded.reduce((best, e, i) => (e.duration > encoded[best].duration ? i : best), 0);
    }
    const ordered = [encoded[mainIdx], ...encoded.filter((_, i) => i !== mainIdx)];

    // 2b. Tempo of the Main version — saved into the draft so the owner
    // doesn't have to type it during tagging.
    patch(group.key, { note: "Detecting BPM…" });
    patchFile(group.key, ordered[0].qf.file.name, { stage: "bpm" });
    let bpmDetected: number | null = null;
    try {
      bpmDetected = await detectBpm(await decodeAudio(ordered[0].qf.file));
    } catch {
      // no beat found — BPM stays empty
    }
    patchFile(group.key, ordered[0].qf.file.name, { stage: "encoded" });

    // 3. Upload previews (320 + 128) per version.
    const versions: {
      label: string;
      previewSrc: string;
      preview128?: string;
      duration: string;
      /** R2 key of this version's WAV master (filled after the masters upload). */
      wavKey?: string;
    }[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const e = ordered[i];
      const name = e.qf.file.name;
      patch(group.key, { note: `Uploading version ${i + 1}/${ordered.length}…` });
      const onPct = (pct: number) => patchFile(group.key, name, { stage: "uploading-preview", pct });
      onPct(0);
      const p320 = await uploadAudio(e.mp3_320, "preview", name, onPct);
      const p128 = await uploadAudio(e.mp3_128, "preview128", name, onPct);
      // A "…_main…" filename shouldn't leak "main" into the site label.
      const clean = isMainFile(e.qf.file.name) ? "" : labelOf(group, e.qf);
      versions.push({
        label: i === 0 ? clean || "Main" : clean || `Version ${i + 1}`,
        previewSrc: p320.path ?? "",
        preview128: p128.path ?? undefined,
        duration: formatDuration(e.duration),
      });
      // MP3 versions have no master to sell — they are finished here. WAVs still
      // have their master upload ahead of them.
      patchFile(group.key, name, { stage: isMp3(name) ? "done" : "encoded" });
    }

    // 4. Master files go up INDIVIDUALLY (v2 storage) — each stays under the
    // ~95 MB per-upload cap no matter how many stems/versions a track has.
    // The customer's zip is assembled ON DOWNLOAD from these files (with the
    // license PDF dropped in), using the checksums computed here.
    type ManifestEntry = { key: string; name: string; size: number; crc: number };
    const uploadMasters = async (
      files: QueuedFile[],
      label: string,
    ): Promise<ManifestEntry[]> => {
      const manifest: ManifestEntry[] = [];
      for (let i = 0; i < files.length; i++) {
        const { file } = files[i];
        patch(group.key, { note: `Checksumming ${label} ${i + 1}/${files.length}…` });
        patchFile(group.key, file.name, { stage: "checksum" });
        const crc = await crc32File(file);
        const up = await uploadAudio(file, "master", file.name, (pct) => {
          patch(group.key, {
            note: `Uploading ${label} ${i + 1}/${files.length} (${mb(file.size)})… ${pct}%`,
          });
          patchFile(group.key, file.name, { stage: "uploading-master", pct });
        });
        patchFile(group.key, file.name, { stage: "done" });
        manifest.push({ key: up.key, name: file.name, size: file.size, crc });
      }
      return manifest;
    };

    // WAV versions only — MP3 versions have no master to sell.
    const wavFiles = group.files.filter(({ file }) => !isMp3(file.name));
    const wavManifest = wavFiles.length > 0 ? await uploadMasters(wavFiles, "WAV") : undefined;
    // Link each version row to its own master file: deleting a version later
    // must drop exactly that WAV from the customer's download zip.
    if (wavManifest) {
      for (let i = 0; i < ordered.length; i++) {
        const hit = wavManifest.find((m) => m.name === ordered[i].qf.file.name);
        if (hit) versions[i].wavKey = hit.key;
      }
    }
    const stemsManifest =
      group.stems.length > 0 ? await uploadMasters(group.stems, "stem") : undefined;

    // 5. Create the draft track.
    patch(group.key, { note: "Creating track…" });
    await createTrack({
      title: group.title,
      duration: versions[0].duration,
      bpm: bpmDetected ?? undefined,
      versions,
      wavManifest,
      stemsManifest,
      composerId: composerId || undefined,
    });

    patch(group.key, { status: "done", note: `Draft created · ${versions.length} version${versions.length > 1 ? "s" : ""}` });
  };

  const start = async () => {
    if (running) {
      stopRef.current = true;
      return;
    }
    // Belt and braces — the button is disabled without a composer, but a batch
    // created with no attribution is a mess to fix afterwards.
    if (!composerId) {
      toast.error("Pick the composer for this batch first");
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
        title, every WAV/MP3 inside becomes a version (MP3s are used as-is, no re-encode). Files
        named <span className="text-foreground">…_stem(s)_…</span> go into a separate STEMS zip.
        Main = the starred file → a file named <span className="text-foreground">…_main…</span> →
        else the longest. Loose files are grouped by name ("Epic Battle (short).wav" joins "Epic
        Battle.wav"). Tracks are created as <span className="text-amber-400">drafts</span> — tag
        them in Catalog → Tracks, then select and press Publish. Keep this tab open; work in
        batches of ~20-30 tracks. Masters upload one by one (any number of stems/versions) —
        the customer's zip is built at download time with the license PDF inside; only a
        SINGLE file over ~95 MB would be rejected.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void onDrop(e)}
        className="mt-5 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#F4C430]/35 bg-[#F4C430]/[0.03] px-6 py-10 text-center transition-colors hover:border-[#F4C430]/70"
      >
        <UploadCloud className="h-8 w-8" style={{ color: GOLD }} />
        <p className="font-body text-sm text-foreground">Drop track FOLDERS (or WAV/MP3 files) here</p>
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
          accept=".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg"
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
              disabled={!running && (queuedCount === 0 || !composerId)}
              title={
                !running && !composerId
                  ? "Pick the composer for this batch first"
                  : undefined
              }
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-body text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
              className={`rounded-lg border bg-background px-2.5 py-2 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none disabled:opacity-50 ${
                composerId ? "border-border" : "border-red-400/60"
              }`}
            >
              <option value="">No composer — pick one (required)</option>
              {[...composers]
                .sort(
                  (a, b) =>
                    (b.userId === user?.id ? 1 : 0) - (a.userId === user?.id ? 1 : 0) ||
                    a.displayName.localeCompare(b.displayName),
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                    {c.userId === user?.id ? " (me)" : ""}
                  </option>
                ))}
            </select>
            {!composerId && !running && (
              <span className="font-body text-xs text-red-400">Pick a composer to start</span>
            )}
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
                      {g.files.length} version{g.files.length !== 1 ? "s" : ""}
                      {g.stems.length > 0 && (
                        <span className="text-[#F4C430]"> · {g.stems.length} stems</span>
                      )}
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
                            <FileStatus p={g.fileProgress[qf.file.name]} />
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
                      {g.stems.map((qf) => (
                        <li key={qf.file.name} className="flex items-center gap-2 pl-6">
                          <span className="shrink-0 rounded border border-[#F4C430]/60 bg-[#F4C430]/10 px-1 py-px font-body text-[9px] font-bold uppercase tracking-wide text-[#F4C430]">
                            Stem
                          </span>
                          <span className="min-w-0 flex-1 truncate font-body text-xs text-muted-foreground">
                            {qf.file.name}
                          </span>
                          <FileStatus p={g.fileProgress[qf.file.name]} />
                          {g.status !== "working" && (
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
                      ))}
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
