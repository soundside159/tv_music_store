import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { decodeAudio, encodeMp3, formatDuration } from "@/lib/audioEncoding";
import { crc32File } from "@/lib/crc32";

// Admin → Sound Effects (see docs/SFX_PLAN.md).
//
// SFX are NOT tracks: no BPM, no versions, no stems, no Content ID, and no
// per-sound cover — the artwork belongs to the CATEGORY. The library will hold
// tens of thousands of rows, so the table is paged IN THE DATABASE
// (/api/admin/sfx?page=…): the browser never holds more than 50 rows.
//
// Upload: drop a folder → the FOLDER NAME is the category. Each WAV becomes one
// sound: an MP3 320 is rendered in the browser for streaming, the WAV master is
// uploaded to its own R2 prefix (sfx/) and is what customers download (Pro+).

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";
const btnCls =
  "rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:pointer-events-none disabled:opacity-50";
const goldBtnCls =
  "rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50";

interface SfxSub {
  id: string;
  category_id: string;
  title: string;
}
interface SfxCategory {
  id: string;
  title: string;
  description: string | null;
  image: string | null;
  count: number;
  subs: SfxSub[];
}
interface Sound {
  id: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  tags: string[];
  duration: string | null;
  preview_src: string | null;
  wav_size: number | null;
  status: string;
  composer_id: string | null;
}
interface SfxData {
  page: number;
  pages: number;
  total: number;
  sounds: Sound[];
  categories: SfxCategory[];
  composers: { id: string; display_name: string }[];
}

const api = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const res = await fetch("/api/admin/sfx", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !d.ok) throw new Error(d.error ?? "Request failed");
  return d as Record<string, unknown>;
};

const uploadFile = async (
  file: Blob,
  kind: "preview" | "sfx",
  filename: string,
): Promise<{ key: string; path: string | null }> => {
  const base = filename.replace(/\.[^.]+$/, "");
  const res = await fetch(`/api/admin/upload-audio?kind=${kind}&filename=${encodeURIComponent(base)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type || (kind === "sfx" ? "audio/wav" : "audio/mpeg") },
    body: file,
  });
  const d = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    key?: string;
    path?: string | null;
    error?: string;
  };
  if (!res.ok || !d.ok || !d.key) throw new Error(d.error ?? "Upload failed");
  return { key: d.key, path: d.path ?? null };
};

const isWav = (name: string) => /\.wav$/i.test(name);
const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

type Tab = "library" | "upload" | "categories";

const AdminSfx = () => {
  const [tab, setTab] = useState<Tab>("library");
  const [data, setData] = useState<SfxData | null>(null);
  const [busy, setBusy] = useState(false);

  // library filters
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    if (cat) params.set("cat", cat);
    if (status) params.set("status", status);
    try {
      const res = await fetch(`/api/admin/sfx?${params.toString()}`, { credentials: "include" });
      const d = (await res.json()) as SfxData & { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Load failed");
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    }
  }, [page, q, cat, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- playback (one preview at a time) -------------------------------------
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const play = (s: Sound) => {
    if (!s.preview_src) return;
    if (playingId === s.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = s.preview_src;
    void audioRef.current.play();
    audioRef.current.onended = () => setPlayingId(null);
    setPlayingId(s.id);
  };

  // ---- bulk actions ---------------------------------------------------------
  const run = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await api(payload);
      toast.success(okMsg);
      setSelected([]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Delete ${selected.length} sound(s)? Their WAV and MP3 files are deleted too.`)) return;
    await run({ action: "delete_sfx", ids: selected }, "Deleted");
  };

  // ---- upload ---------------------------------------------------------------
  const [dropBusy, setDropBusy] = useState(false);
  const [dropNote, setDropNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadCat, setUploadCat] = useState("");
  const [uploadComposer, setUploadComposer] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    const wavs = files.filter((f) => isWav(f.name));
    if (wavs.length === 0) {
      toast.error("Sound effects are uploaded as WAV files");
      return;
    }
    setDropBusy(true);
    let done = 0;
    try {
      for (const file of wavs) {
        const name = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
        // The folder a file came from names its category, if it matches one.
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
        const folder = rel.split("/").slice(-2, -1)[0] ?? "";
        const byFolder = (data?.categories ?? []).find(
          (c) => c.title.toLowerCase() === folder.trim().toLowerCase(),
        );
        const categoryId = uploadCat || byFolder?.id || "";

        setDropNote(`Encoding ${done + 1}/${wavs.length}: ${file.name}`);
        const buffer = await decodeAudio(file);
        const mp3 = encodeMp3(buffer, 320);

        setDropNote(`Uploading ${done + 1}/${wavs.length}: ${file.name}`);
        const preview = await uploadFile(mp3, "preview", file.name);
        const crc = await crc32File(file);
        const master = await uploadFile(file, "sfx", file.name);

        await api({
          action: "create_sfx",
          name,
          categoryId,
          composerId: uploadComposer || undefined,
          duration: formatDuration(buffer.duration),
          previewSrc: preview.path,
          wavKey: master.key,
          wavSize: file.size,
          wavCrc: crc,
        });
        done += 1;
      }
      toast.success(`${done} sound(s) uploaded as drafts`);
      setTab("library");
      setPage(1);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setDropBusy(false);
      setDropNote("");
    }
  };

  // ---- categories -----------------------------------------------------------
  const [newCat, setNewCat] = useState("");
  const [newSub, setNewSub] = useState<Record<string, string>>({});

  const cats = data?.categories ?? [];
  const sounds = data?.sounds ?? [];
  const catTitle = (id: string | null) => cats.find((c) => c.id === id)?.title ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-body text-lg font-semibold text-foreground">
          <AudioLines className="h-5 w-5 text-[#F4C430]" />
          Sound Effects
        </h2>
        <div className="flex gap-1 rounded-lg border border-border/60 bg-background/40 p-1">
          {(
            [
              ["library", `Library${data ? ` (${data.total})` : ""}`],
              ["upload", "Upload"],
              ["categories", "Categories"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
                tab === id ? "bg-[#F4C430] text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ===================== LIBRARY ===================== */}
      {tab === "library" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search sounds…"
                className={`${inputCls} w-64 pl-9`}
              />
            </label>
            <select
              value={cat}
              onChange={(e) => {
                setCat(e.target.value);
                setPage(1);
              }}
              className={`${inputCls} py-2`}
            >
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.count})
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={`${inputCls} py-2`}
            >
              <option value="">Any status</option>
              <option value="draft">Drafts</option>
              <option value="published">Live</option>
            </select>

            {selected.length > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="font-body text-xs text-muted-foreground">{selected.length} selected</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = "";
                    if (v) void run({ action: "update_sfx", ids: selected, fields: { categoryId: v } }, "Category set");
                  }}
                  className={`${inputCls} py-1.5 text-xs`}
                >
                  <option value="">Move to category…</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: "update_sfx", ids: selected, fields: { status: "published" } }, "Published")}
                  className={btnCls}
                >
                  Publish
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: "update_sfx", ids: selected, fields: { status: "draft" } }, "Unpublished")}
                  className={btnCls}
                >
                  Unpublish
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeSelected()}
                  className="rounded-lg border border-red-400/50 px-3 py-1.5 font-body text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/10"
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border/60">
            <div className="grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_9rem_7rem_5rem_5rem] items-center gap-2 border-b border-border/60 bg-secondary/40 px-3 py-2.5 font-body text-xs uppercase tracking-wide text-muted-foreground">
              <span />
              <span />
              <span>Sound</span>
              <span>Category</span>
              <span>Composer</span>
              <span>Size</span>
              <span>Status</span>
            </div>

            {sounds.map((s) => {
              const isSel = selected.includes(s.id);
              return (
                <div
                  key={s.id}
                  className={`grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_9rem_7rem_5rem_5rem] items-center gap-2 border-b border-border/40 px-3 py-2 last:border-b-0 ${
                    isSel ? "bg-[#F4C430]/[0.06]" : "hover:bg-foreground/[0.03]"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`Select ${s.name}`}
                    onClick={() =>
                      setSelected((prev) => (isSel ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                    }
                    className={`flex h-[18px] w-[18px] items-center justify-center justify-self-center rounded border transition-colors ${
                      isSel ? "border-[#F4C430] bg-[#F4C430]" : "border-border hover:border-[#F4C430]/60"
                    }`}
                  >
                    {isSel && <Check className="h-3 w-3 text-background" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => play(s)}
                    aria-label={playingId === s.id ? `Pause ${s.name}` : `Play ${s.name}`}
                    className="flex h-8 w-8 items-center justify-center justify-self-center rounded-full border border-border/70 text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                  >
                    {playingId === s.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                  </button>
                  <span className="min-w-0">
                    <span className="block truncate font-body text-sm text-foreground">{s.name}</span>
                    <span className="block truncate font-body text-xs text-muted-foreground">
                      {s.duration || "—"}
                      {s.tags.length > 0 ? ` · ${s.tags.slice(0, 4).join(", ")}` : ""}
                    </span>
                  </span>
                  <span className="truncate font-body text-xs text-muted-foreground">{catTitle(s.category_id)}</span>
                  <span className="truncate font-body text-xs text-muted-foreground">
                    {data?.composers.find((c) => c.id === s.composer_id)?.display_name ?? "House"}
                  </span>
                  <span className="font-body text-xs tabular-nums text-muted-foreground">
                    {s.wav_size ? mb(s.wav_size) : "—"}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-center font-body text-[10px] font-bold uppercase ${
                      s.status === "published"
                        ? "border-[#F4C430]/50 bg-[#F4C430]/10 text-[#F4C430]"
                        : "border-amber-400/50 bg-amber-400/10 text-amber-400"
                    }`}
                  >
                    {s.status === "published" ? "Live" : "Draft"}
                  </span>
                </div>
              );
            })}

            {sounds.length === 0 && (
              <p className="px-4 py-8 text-center font-body text-sm text-muted-foreground">
                No sounds yet — upload some on the Upload tab.
              </p>
            )}
          </div>

          {data && data.pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={btnCls}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="font-body text-xs text-muted-foreground">
                Page {data.page} of {data.pages} · {data.total} sounds
              </span>
              <button
                type="button"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
                className={btnCls}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ===================== UPLOAD ===================== */}
      {tab === "upload" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} className={`${inputCls} py-2`}>
              <option value="">Category from the folder name</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              value={uploadComposer}
              onChange={(e) => setUploadComposer(e.target.value)}
              className={`${inputCls} py-2`}
            >
              <option value="">House (no composer)</option>
              {(data?.composers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!dropBusy) void uploadFiles([...e.dataTransfer.files]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
              dragOver ? "border-[#F4C430] bg-[#F4C430]/10" : "border-border/70 hover:border-[#F4C430]/60"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".wav,audio/wav,audio/x-wav"
              className="hidden"
              {...({ webkitdirectory: "" } as Record<string, string>)}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length > 0) void uploadFiles(files);
              }}
            />
            {dropBusy ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-[#F4C430]" />
                <span className="font-body text-sm text-foreground">{dropNote || "Working…"}</span>
              </>
            ) : (
              <>
                <UploadCloud className="h-7 w-7 text-muted-foreground" />
                <span className="font-body text-sm text-foreground">
                  Drop a folder of WAV files (or click to pick one)
                </span>
                <span className="max-w-md font-body text-xs text-muted-foreground">
                  The folder name is the category (or pick one above). Each file becomes one sound: an
                  MP3 is rendered for streaming, the WAV master is what customers download (Pro and up).
                  Everything lands as a <span className="text-foreground">draft</span>.
                </span>
              </>
            )}
          </label>
        </div>
      )}

      {/* ===================== CATEGORIES ===================== */}
      {tab === "categories" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="New category (e.g. Glass Breaking)"
              className={`${inputCls} w-72`}
            />
            <button
              type="button"
              disabled={busy || !newCat.trim()}
              onClick={() => {
                const title = newCat.trim();
                setNewCat("");
                void run({ action: "upsert_category", title, sort: cats.length }, "Category added");
              }}
              className={goldBtnCls}
            >
              <Plus className="mr-1 inline h-4 w-4" />
              Add category
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {cats.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-body text-sm font-semibold text-foreground">
                    {c.title}
                    <span className="ml-2 font-body text-xs text-muted-foreground">{c.count} sounds</span>
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Delete the category "${c.title}"? Its sounds are kept, they just lose the shelf.`)) return;
                      void run({ action: "delete_category", id: c.id }, "Category deleted");
                    }}
                    aria-label={`Delete ${c.title}`}
                    className="text-muted-foreground transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.subs.map((sub) => (
                    <span
                      key={sub.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-body text-xs text-muted-foreground"
                    >
                      {sub.title}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run({ action: "delete_subcategory", id: sub.id }, "Removed")}
                        aria-label={`Delete ${sub.title}`}
                        className="transition-colors hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="mt-2 flex gap-2">
                  <input
                    value={newSub[c.id] ?? ""}
                    onChange={(e) => setNewSub((p) => ({ ...p, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const title = (newSub[c.id] ?? "").trim();
                      if (!title) return;
                      setNewSub((p) => ({ ...p, [c.id]: "" }));
                      void run(
                        { action: "upsert_subcategory", categoryId: c.id, title, sort: c.subs.length },
                        "Subcategory added",
                      );
                    }}
                    placeholder="Add a subcategory + Enter"
                    className={`${inputCls} flex-1 py-1.5 text-xs`}
                  />
                </div>
              </div>
            ))}
            {cats.length === 0 && (
              <p className="font-body text-sm text-muted-foreground">
                No categories yet. They are the shelves of the SFX page — and the artwork lives on them,
                not on the individual sounds.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSfx;
