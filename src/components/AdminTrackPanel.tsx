import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ImageUp,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { CatalogTrack, TrackAudioVersion } from "@/data/catalogTracks";
import { splitFilterValues } from "@/components/TrackRowPlayer";
import WaveformPreview from "@/components/WaveformPreview";
import { usePlayer } from "@/components/playerContext";
import { refreshContent } from "@/hooks/useContent";
import { decodeAudio, encodeMp3, formatDuration, makeThumbnail, wavToMp3Pair } from "@/lib/audioEncoding";
import { crc32File } from "@/lib/crc32";
import { cleanVersionLabel } from "@/lib/downloadTrack";
import { brandCover } from "@/lib/coverArt";
import type { Vocabularies } from "@/lib/tagOptions";

// Admin-only side panels for the public track page (/track/:slug).
// LEFT: toggle the track's Use Case / Genre / Mood values + a Trending box
//       (add this track, reorder with arrows — same list as the homepage).
// RIGHT: Collections & Playlists with a plus / green check per item.
// Customers never see these — TrackDetail renders them only for role=admin,
// and every call goes through the admin-gated /api/admin/content API.

const GOLD = "#F4C430";
// Same default cover the public collection/playlist pages fall back to.

export interface AdminContentItem {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  image?: string;
  /** Playlists only: section name on the /playlists page ("Featured", "Podcast"…). */
  theme?: string;
  trackIds: string[];
}

export interface AdminContentData {
  vocabularies: Vocabularies;
  trending: string[];
  collections: AdminContentItem[];
  playlists: AdminContentItem[];
  /** Persisted theme names — empty themes survive F5 (site_config list). */
  playlistThemes: string[];
}

type RunPayload = Record<string, unknown>;

/** Loads /api/admin/content once (admins only) + a small POST helper. */
export const useAdminTrackContent = (enabled: boolean) => {
  const [data, setData] = useState<AdminContentData | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/admin/content", { credentials: "include" });
      if (!res.ok) return;
      const d = (await res.json()) as Partial<AdminContentData>;
      if (d.vocabularies) {
        setData({
          vocabularies: d.vocabularies,
          trending: d.trending ?? [],
          collections: d.collections ?? [],
          playlists: d.playlists ?? [],
          playlistThemes: d.playlistThemes ?? [],
        });
      }
    } catch {
      // admin API unreachable — panels just don't render content
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // Like `run`, but returns the parsed response (e.g. the created item's id).
  const call = useCallback(async (payload: RunPayload): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        toast.error((body.error as string) ?? "Save failed");
        return null;
      }
      return body;
    } catch {
      toast.error("Network error");
      return null;
    }
  }, []);

  const run = useCallback(
    async (payload: RunPayload): Promise<boolean> => (await call(payload)) !== null,
    [call],
  );

  return { data, setData, run, call, reload: load };
};

// ---------------------------------------------------------------------------
// TOP BAR (under the site header): status chip + Publish/Unpublish + Delete.
// ---------------------------------------------------------------------------

export const AdminTrackTopBar = ({
  track,
  run,
  onTracksChanged,
}: {
  track: CatalogTrack;
  run: (payload: RunPayload) => Promise<boolean>;
  onTracksChanged: () => void;
}) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const isDraft = track.status === "draft";
  // Composer uploads await review; Publish approves + publishes in one go.
  const isPending = track.moderation === "pending";

  const setStatus = async (status: "published" | "draft") => {
    setBusy(true);
    const ok = await run({ action: "bulk_update_tracks", trackIds: [track.id], fields: { status } });
    setBusy(false);
    if (ok) {
      toast.success(status === "published" ? "Track published — it's live in the catalog" : "Track unpublished (draft)");
      onTracksChanged();
    }
  };

  const deleteTrack = async () => {
    if (
      !window.confirm(
        `Delete "${track.title}" from the catalog? Its files, collections and playlist entries go too. This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    const ok = await run({ action: "delete_track", id: track.id });
    setBusy(false);
    if (ok) {
      toast.success("Track deleted");
      refreshContent();
      navigate("/catalog");
    }
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#F4C430]/30 bg-card px-4 py-2.5">
      <span className="font-body text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: GOLD }}>
        Admin
      </span>
      <span
        className={`rounded border px-1.5 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${
          isPending
            ? "border-orange-400/60 bg-orange-400/10 text-orange-400"
            : isDraft
              ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
              : "border-green-500/40 bg-green-500/10 text-green-400"
        }`}
      >
        {isPending
          ? `Pending review${track.artist && track.artist !== "TVMUSICSTORE" ? ` — ${track.artist}` : ""}`
          : isDraft
            ? "Draft — hidden from customers"
            : "Published"}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {isDraft ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setStatus("published")}
            className="rounded-lg bg-[#F4C430] px-4 py-1.5 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
          >
            Publish
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setStatus("draft")}
            className="rounded-lg border border-border px-3 py-1.5 font-body text-xs font-semibold text-muted-foreground transition-colors hover:border-amber-400/60 hover:text-amber-400 disabled:opacity-50"
          >
            Unpublish
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void deleteTrack()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 px-3 py-1.5 font-body text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete track
        </button>
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// COVER OVERLAY: hover the track cover → upload a new one (with an auto thumb
// for the row lists) or remove it. Render inside a `group/cover` container.
// ---------------------------------------------------------------------------

const uploadImageApi = async (file: Blob, filename: string): Promise<string> => {
  const base = filename.replace(/\.[^.]+$/, "");
  const res = await fetch(`/api/admin/upload?filename=${encodeURIComponent(base)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type || "image/jpeg" },
    body: file,
  });
  const d = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !d.path) throw new Error(d.error ?? "Upload failed");
  return d.path;
};

export const AdminTrackCoverOverlay = ({
  track,
  run,
  onTracksChanged,
}: {
  track: CatalogTrack;
  run: (payload: RunPayload) => Promise<boolean>;
  onTracksChanged: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // AI cover generation (OpenAI Images): optional one-word featured element.
  const [genOpen, setGenOpen] = useState(false);
  const [genHint, setGenHint] = useState("");
  const [genBusy, setGenBusy] = useState(false);

  // Generates the key art server-side (prompt uses the track's SAVED Use Case
  // and Mood), then builds the row thumbnail in the browser and saves both —
  // same tail end as a manual upload.
  const generateCover = async () => {
    setGenBusy(true);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/generate-cover", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId: track.id, hint: genHint.trim() || undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; error?: string };
      if (!res.ok || !d.ok || !d.path) throw new Error(d.error ?? "Generation failed");

      // Brand the full cover (logo + wordmark, bottom-left); the row thumbnail
      // comes from the clean original. If branding fails, use the original.
      const blob = await (await fetch(d.path)).blob();
      const original = new File([blob], "ai-cover.png", { type: blob.type || "image/png" });
      let cover = d.path;
      try {
        cover = await uploadImageApi(await brandCover(original), "ai-cover-branded.jpg");
      } catch {
        // unbranded original stays
      }
      let coverThumb = "";
      try {
        coverThumb = await uploadImageApi(await makeThumbnail(original), "ai-cover-thumb.jpg");
      } catch {
        // keep coverThumb empty — rows fall back to the full cover
      }
      const ok = await run({
        action: "bulk_update_tracks",
        trackIds: [track.id],
        fields: { cover, coverThumb },
      });
      if (ok) {
        toast.success("Cover generated");
        setGenOpen(false);
        setGenHint("");
        onTracksChanged();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenBusy(false);
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const cover = await uploadImageApi(file, file.name);
      // Small square thumb for the track rows (non-fatal if it fails).
      let coverThumb = "";
      try {
        coverThumb = await uploadImageApi(await makeThumbnail(file), `${file.name}-thumb.jpg`);
      } catch {
        // keep coverThumb empty — rows fall back to the full cover
      }
      const ok = await run({
        action: "bulk_update_tracks",
        trackIds: [track.id],
        fields: { cover, coverThumb },
      });
      if (ok) {
        toast.success("Cover updated");
        onTracksChanged();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const removeCover = async () => {
    if (!window.confirm("Remove the cover image? The placeholder is shown instead.")) return;
    setBusy(true);
    const ok = await run({
      action: "bulk_update_tracks",
      trackIds: [track.id],
      fields: { cover: "", coverThumb: "" },
    });
    setBusy(false);
    if (ok) {
      toast.success("Cover removed");
      onTracksChanged();
    }
  };

  return (
    <>
      <div
        className={`absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 transition-opacity ${
          busy || genOpen ? "opacity-100" : "opacity-0 group-hover/cover:opacity-100"
        }`}
      >
        {genBusy ? (
          /* "Thinking" animation while OpenAI paints — the art pops in the
             moment the response lands (no fixed wait). */
          <span className="flex flex-col items-center gap-2.5">
            <span className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#F4C430]/20" />
              <span className="absolute inset-1.5 animate-pulse rounded-full bg-[#F4C430]/15" />
              <Sparkles className="relative h-6 w-6 animate-pulse text-[#F4C430]" />
            </span>
            <span className="animate-pulse font-body text-[11px] text-muted-foreground">
              Generating…
            </span>
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              title="Upload a new cover (1000x1000 recommended)"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#F4C430]/60 bg-card text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background disabled:opacity-50"
            >
              <ImageUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setGenOpen((v) => !v)}
              title="Generate cover with AI (uses the track's Use Case & Mood)"
              className={`flex h-10 w-10 items-center justify-center rounded-full border bg-card transition-colors disabled:opacity-50 ${
                genOpen
                  ? "border-[#F4C430] bg-[#F4C430] text-background"
                  : "border-[#F4C430]/60 text-[#F4C430] hover:bg-[#F4C430] hover:text-background"
              }`}
            >
              <Sparkles className="h-4 w-4" />
            </button>
            {track.cover && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeCover()}
                title="Remove cover"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {busy && <span className="font-body text-[10px] text-muted-foreground">Uploading…</span>}
          </>
        )}

        {/* AI generation popover: optional featured element + Go. */}
        {genOpen && !genBusy && (
          <div
            className="absolute inset-x-3 bottom-3 z-20 rounded-lg border border-[#F4C430]/40 bg-card/95 p-2.5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1.5 font-body text-[11px] text-muted-foreground">
              Optional: one featured element (e.g. violin, guitar)
            </p>
            <div className="flex gap-1.5">
              <input
                value={genHint}
                onChange={(e) => setGenHint(e.target.value)}
                maxLength={60}
                placeholder="Leave empty for auto"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void generateCover();
                  if (e.key === "Escape") setGenOpen(false);
                }}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-body text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void generateCover()}
                className="rounded-md bg-[#F4C430] px-3 py-1.5 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
              >
                Generate
              </button>
            </div>
            <p className="mt-1.5 font-body text-[10px] text-muted-foreground">
              Prompt uses this track's saved Use Case &amp; Mood.
            </p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
};

const PanelShell = ({ children, headerAction }: { children: ReactNode; headerAction?: ReactNode }) => (
  <aside className="h-fit rounded-xl border border-[#F4C430]/30 bg-card p-4 xl:sticky xl:top-24">
    <div className="mb-3 flex items-center justify-between">
      <p className="font-body text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: GOLD }}>
        Admin
      </p>
      {headerAction}
    </div>
    {children}
  </aside>
);

// ---------------------------------------------------------------------------
// Versions block (left panel): star = Main, rename, delete, + add WAV version.
// Adding/removing a version rebuilds the private WAV zip in the browser.
// ---------------------------------------------------------------------------

const uploadAudioApi = async (
  file: Blob,
  kind: "preview" | "preview128" | "master",
  filename: string,
): Promise<{ key: string; path: string | null }> => {
  const base = filename.replace(/\.[^.]+$/, "");
  const res = await fetch(`/api/admin/upload-audio?kind=${kind}&filename=${encodeURIComponent(base)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type || (kind === "master" ? "audio/wav" : "audio/mpeg") },
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

/** Same rules as Bulk Upload: …_stem(s)_… = a stem, anything else = a version. */
const isStemName = (filename: string) =>
  /(^|[_\s(-])stems?([_\s).-]|$)/i.test(filename.replace(/\.[a-z0-9]+$/i, "").trim());
const isMp3Name = (filename: string) => /\.mp3$/i.test(filename);
const isAudioName = (filename: string) => /\.(wav|mp3)$/i.test(filename);

interface StemFile {
  key: string;
  name: string;
  size: number;
}

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const VersionsBlock = ({
  track,
  run,
  onTracksChanged,
}: {
  track: CatalogTrack;
  run: (payload: RunPayload) => Promise<boolean>;
  onTracksChanged: () => void;
}) => {
  const { activePlayer, isPlaying, playVersion } = usePlayer();
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const versions = track.audioVersions;

  // The track's stem files + WAV masters (the masters only power the duplicate
  // check — a re-picked file is refused before any encoding happens).
  const [stems, setStems] = useState<StemFile[]>([]);
  const [masters, setMasters] = useState<StemFile[]>([]);
  const loadStems = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/stems?track=${encodeURIComponent(track.id)}`, {
        credentials: "include",
      });
      if (!r.ok) return;
      const d = (await r.json()) as { stems?: StemFile[]; masters?: StemFile[] };
      setStems(d.stems ?? []);
      setMasters(d.masters ?? []);
    } catch {
      // keep whatever we had
    }
  }, [track.id]);
  useEffect(() => {
    void loadStems();
  }, [loadStems]);

  // Add files (v2 storage): a WAV/MP3 becomes a new VERSION, a …_stem_… file
  // becomes a STEM. WAV versions upload their master too, so the customer's
  // download zip contains exactly what the track has.
  const addFiles = async (files: File[]) => {
    const audio = files.filter((f) => isAudioName(f.name));
    if (audio.length === 0) {
      toast.error("Pick a WAV or MP3 file");
      return;
    }
    const knownNames = new Set([...stems, ...masters].map((f) => f.name.toLowerCase()));
    const knownLabels = new Set(
      versions.map((v) => (cleanVersionLabel(v.label, track.title) || v.label).toLowerCase()),
    );
    let touched = false;
    try {
      for (const file of audio) {
        if (knownNames.has(file.name.toLowerCase())) {
          toast.error(`"${file.name}" is already on this track — skipped`);
          continue;
        }
        const base = file.name.replace(/\.[a-z0-9]+$/i, "");
        const label = cleanVersionLabel(base, track.title) || `Version ${versions.length + 1}`;

        if (isStemName(file.name)) {
          setBusy(`Uploading stem ${file.name}…`);
          const crc = await crc32File(file);
          const up = await uploadAudioApi(file, "master", file.name);
          const ok = await run({
            action: "add_stems",
            id: track.id,
            stems: [{ key: up.key, name: file.name, size: file.size, crc }],
          });
          if (ok) {
            toast.success(`Stem "${file.name}" added`);
            knownNames.add(file.name.toLowerCase());
            touched = true;
          }
          continue;
        }

        if (knownLabels.has(label.toLowerCase())) {
          toast.error(`This track already has a version called "${label}" — skipped`);
          continue;
        }

        setBusy(`Encoding ${file.name}…`);
        let mp3_320: Blob;
        let mp3_128: Blob;
        let duration: number;
        if (isMp3Name(file.name)) {
          const buffer = await decodeAudio(file);
          mp3_320 = file;
          mp3_128 = encodeMp3(buffer, 128);
          duration = buffer.duration;
        } else {
          const pair = await wavToMp3Pair(file);
          mp3_320 = pair.mp3_320;
          mp3_128 = pair.mp3_128;
          duration = pair.duration;
        }
        setBusy("Uploading previews…");
        const p320 = await uploadAudioApi(mp3_320, "preview", file.name);
        const p128 = await uploadAudioApi(mp3_128, "preview128", file.name).catch(() => null);

        let masterEntry: { key: string; name: string; size: number; crc: number } | undefined;
        if (!isMp3Name(file.name)) {
          setBusy(`Uploading master ${file.name}…`);
          const crc = await crc32File(file);
          const up = await uploadAudioApi(file, "master", file.name);
          masterEntry = { key: up.key, name: file.name, size: file.size, crc };
        }

        const ok = await run({
          action: "add_version",
          id: track.id,
          label,
          previewSrc: p320.path,
          preview128: p128?.path ?? undefined,
          duration: formatDuration(duration),
          masterEntry,
        });
        if (ok) {
          toast.success(`Version "${label}" added`);
          knownNames.add(file.name.toLowerCase());
          knownLabels.add(label.toLowerCase());
          touched = true;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (touched) {
        await loadStems();
        onTracksChanged();
      }
    }
  };

  // The server drops the version's WAV master from the download bundle with it,
  // so what the customer downloads always mirrors what the track has.
  const deleteVersion = async (v: TrackAudioVersion) => {
    if (!window.confirm(`Delete version "${v.label}"?`)) return;
    setPendingId(v.id);
    try {
      const ok = await run({ action: "delete_version", id: track.id, versionId: v.id });
      if (ok) {
        toast.success("Version deleted");
        await loadStems();
        onTracksChanged();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setPendingId(null);
    }
  };

  const deleteStem = async (stem: StemFile) => {
    if (!window.confirm(`Delete stem "${stem.name}"?`)) return;
    setPendingId(stem.key);
    try {
      const ok = await run({ action: "delete_stem", id: track.id, key: stem.key });
      if (ok) {
        toast.success("Stem deleted");
        await loadStems();
        onTracksChanged();
      }
    } finally {
      setPendingId(null);
    }
  };

  const setMain = async (v: TrackAudioVersion) => {
    setPendingId(v.id);
    const ok = await run({ action: "set_main_version", id: track.id, versionId: v.id });
    setPendingId(null);
    if (ok) {
      toast.success(`"${v.label}" is now the Main version`);
      onTracksChanged();
    }
  };

  const rename = async (v: TrackAudioVersion) => {
    const t = draft.trim();
    setRenamingId(null);
    if (!t || t === v.label) return;
    setPendingId(v.id);
    try {
      const ok = await run({ action: "rename_version", id: track.id, versionId: v.id, label: t });
      if (ok) onTracksChanged();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="border-b border-border/50 py-3">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm font-semibold text-foreground">Versions ({versions.length})</p>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => fileRef.current?.click()}
          title="Add a WAV/MP3 — a file named …_stem(s)_… is added as a stem"
          className="inline-flex items-center gap-1 rounded-md border border-[#F4C430]/50 px-2 py-0.5 font-body text-[11px] font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430]/10 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      {busy && (
        <p className="mt-1 font-body text-[11px]" style={{ color: GOLD }}>
          {busy}
        </p>
      )}
      <div className="mt-1.5 flex flex-col gap-0.5">
        {versions.map((v, i) => {
          const isMain = i === 0;
          const active = activePlayer?.trackId === track.id && activePlayer.versionId === v.id;
          const rowBusy = pendingId === v.id;
          return (
            <div
              key={v.id}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/5 ${rowBusy ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                disabled={isMain || rowBusy || !!busy}
                onClick={() => void setMain(v)}
                title={isMain ? "Main version" : "Make this the Main version"}
                aria-label={isMain ? "Main version" : `Make ${v.label} the main version`}
                className="shrink-0 disabled:cursor-default"
              >
                <Star className="h-3 w-3" style={isMain ? { color: GOLD, fill: GOLD } : { color: "#666" }} />
              </button>
              <button
                type="button"
                onClick={() => playVersion(track, v)}
                aria-label={active && isPlaying ? `Pause ${v.label}` : `Play ${v.label}`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430]"
              >
                {active && isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </button>
              {renamingId === v.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void rename(v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void rename(v);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-[#F4C430]/60 bg-background px-1 py-0.5 font-body text-xs text-foreground focus:outline-none"
                />
              ) : (
                <span
                  className={`min-w-0 flex-1 truncate font-body text-xs ${active ? "text-[#F4C430]" : "text-foreground"}`}
                  title={v.label}
                >
                  {v.label}
                </span>
              )}
              <span className="shrink-0 font-body text-[10px] tabular-nums text-muted-foreground">{v.duration}</span>
              <button
                type="button"
                onClick={() => {
                  setDraft(v.label);
                  setRenamingId(v.id);
                }}
                aria-label={`Rename ${v.label}`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430]"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={isMain || versions.length <= 1 || rowBusy || !!busy}
                onClick={() => void deleteVersion(v)}
                title={isMain ? "Main can't be deleted — star another version first" : "Delete version"}
                aria-label={`Delete ${v.label}`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-30"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Stems: the actual files, deletable one by one (the STEMS zip is built
          at download time — nothing is pre-packed). */}
      {stems.length > 0 && (
        <div className="mt-2 border-t border-border/40 pt-2">
          <p className="flex items-center gap-1.5 font-body text-[11px] font-semibold text-foreground">
            <span className="rounded border border-[#F4C430]/60 bg-[#F4C430]/10 px-1 py-px font-body text-[9px] font-bold uppercase tracking-wide text-[#F4C430]">
              Stems
            </span>
            {stems.length} file{stems.length > 1 ? "s" : ""}
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {stems.map((sf) => (
              <div
                key={sf.key}
                className={`flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/5 ${
                  pendingId === sf.key ? "opacity-50" : ""
                }`}
              >
                <Music2 className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                <span className="min-w-0 flex-1 truncate font-body text-xs text-foreground" title={sf.name}>
                  {sf.name}
                </span>
                <span className="shrink-0 font-body text-[10px] tabular-nums text-muted-foreground">
                  {fmtSize(sf.size)}
                </span>
                <button
                  type="button"
                  disabled={pendingId === sf.key || !!busy}
                  onClick={() => void deleteStem(sf)}
                  title="Delete this stem"
                  aria-label={`Delete stem ${sf.name}`}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-30"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) void addFiles(files);
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// LEFT: tags (Use Case / Genre / Mood) + Trending box
// ---------------------------------------------------------------------------

const FACETS: { key: "useCase" | "genre" | "mood"; label: string }[] = [
  { key: "useCase", label: "Use Case" },
  { key: "genre", label: "Genre" },
  { key: "mood", label: "Mood" },
];

export const AdminTrackTagsPanel = ({
  track,
  data,
  setData,
  run,
  tracks,
  onTracksChanged,
}: {
  track: CatalogTrack;
  data: AdminContentData | null;
  setData: Dispatch<SetStateAction<AdminContentData | null>>;
  run: (payload: RunPayload) => Promise<boolean>;
  /** Full catalog — used to show titles for the trending id list. */
  tracks: CatalogTrack[];
  /** Called after a facet change so the page refetches the track's tags. */
  onTracksChanged: () => void;
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({ useCase: true });
  const [pending, setPending] = useState<string | null>(null);
  const { activePlayer, isPlaying, progress, playVersion } = usePlayer();

  if (!data) {
    return (
      <PanelShell>
        <p className="font-body text-xs text-muted-foreground">Loading admin data…</p>
      </PanelShell>
    );
  }

  const trackFacetValues = (key: "useCase" | "genre" | "mood") =>
    new Set(splitFilterValues(track[key] ?? "").map((v) => v.toLowerCase()));

  const toggleFacet = async (key: "useCase" | "genre" | "mood", value: string) => {
    const has = trackFacetValues(key).has(value.toLowerCase());
    const id = `${key}:${value}`;
    setPending(id);
    const ok = await run({
      action: "bulk_update_tracks",
      trackIds: [track.id],
      facets: { [key]: has ? { remove: [value] } : { add: [value] } },
    });
    setPending(null);
    if (ok) onTracksChanged();
  };

  // ---- Trending helpers (optimistic local list; server = set_trending) ----
  const saveTrending = async (next: string[]) => {
    const prev = data.trending;
    setData((d) => (d ? { ...d, trending: next } : d));
    const ok = await run({ action: "set_trending", trackIds: next });
    if (!ok) setData((d) => (d ? { ...d, trending: prev } : d));
    // Repaint the homepage Trending block without a manual reload.
    else refreshContent();
  };
  const trendingIndex = data.trending.indexOf(track.id);
  const move = (i: number, dir: -1 | 1) => {
    const next = [...data.trending];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    void saveTrending(next);
  };
  const titleOf = (id: string) => tracks.find((t) => t.id === id)?.title ?? id;

  return (
    <PanelShell>
      {FACETS.map(({ key, label }) => {
        const values = trackFacetValues(key);
        const isOpen = !!open[key];
        return (
          <div key={key} className="border-b border-border/50 py-2 last:border-b-0">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
              className="flex w-full items-center justify-between py-1 font-body text-sm font-semibold text-foreground"
            >
              {label}
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="mt-1 flex flex-col">
                {(data.vocabularies[key] ?? []).map((value) => {
                  const active = values.has(value.toLowerCase());
                  const busy = pending === `${key}:${value}`;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleFacet(key, value)}
                      className={`flex items-center gap-2 rounded px-1.5 py-1 text-left font-body text-xs transition-colors hover:bg-white/5 ${
                        busy ? "opacity-50" : ""
                      } ${active ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                          active ? "border-[#F4C430] bg-[#F4C430]" : "border-border"
                        }`}
                      >
                        {active && <Check className="h-2.5 w-2.5 text-background" />}
                      </span>
                      {value}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Versions: star = Main, rename, delete, + add a WAV version. */}
      <VersionsBlock track={track} run={run} onTracksChanged={onTracksChanged} />

      {/* Trending — same admin-picked list as the homepage block. */}
      <div className="pt-3">
        <p className="font-body text-sm font-semibold text-foreground">Trending tracks</p>
        <div className="mt-2 flex flex-col gap-1">
          {data.trending.length === 0 && (
            <p className="font-body text-xs text-muted-foreground">Empty — add tracks below.</p>
          )}
          {data.trending.map((id, i) => {
            const isCurrent = id === track.id;
            const trendTrack = tracks.find((t) => t.id === id);
            const version = trendTrack?.audioVersions[0];
            const isActive =
              !!version && activePlayer?.trackId === id && activePlayer.versionId === version.id;
            return (
              <div
                key={id}
                className={`rounded px-1.5 py-1 ${isCurrent ? "bg-[#F4C430]/10" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-4 shrink-0 font-body text-[10px] text-muted-foreground">{i + 1}</span>
                  {trendTrack && version && (
                    <button
                      type="button"
                      onClick={() => playVersion(trendTrack, version)}
                      aria-label={isActive && isPlaying ? `Pause ${titleOf(id)}` : `Play ${titleOf(id)}`}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430]"
                    >
                      {isActive && isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </button>
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate font-body text-xs ${
                      isCurrent ? "font-semibold text-[#F4C430]" : "text-foreground"
                    }`}
                    title={titleOf(id)}
                  >
                    {titleOf(id)}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === data.trending.length - 1}
                    aria-label="Move down"
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveTrending(data.trending.filter((x) => x !== id))}
                    aria-label="Remove from trending"
                    className="text-muted-foreground transition-colors hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {trendTrack && version && (
                  <div className="mt-1 pl-4">
                    <WaveformPreview
                      active={isActive && isPlaying}
                      onSeek={(p) => playVersion(trendTrack, version, p)}
                      progress={isActive ? progress : 0}
                      src={version.src}
                      className="h-5"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {trendingIndex === -1 ? (
          <button
            type="button"
            onClick={() => void saveTrending([...data.trending, track.id])}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#F4C430]/50 py-1.5 font-body text-xs font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430]/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Add this track
          </button>
        ) : (
          <p className="mt-2 text-center font-body text-[11px] text-muted-foreground">
            This track is in Trending — position #{trendingIndex + 1}
          </p>
        )}
      </div>
    </PanelShell>
  );
};

// ---------------------------------------------------------------------------
// RIGHT: Collections & Playlists membership
// ---------------------------------------------------------------------------

const MembershipList = ({
  heading,
  items,
  trackId,
  onToggle,
  pendingId,
  linkBase,
}: {
  heading: string;
  items: AdminContentItem[];
  trackId: string;
  onToggle: (item: AdminContentItem, isMember: boolean) => void;
  pendingId: string | null;
  /** Public page prefix, e.g. "/collection" — titles link there (slug = id). */
  linkBase: string;
}) => (
  <div className="border-b border-border/50 pb-3 pt-2 last:border-b-0 last:pb-0">
    <p className="font-body text-sm font-semibold text-foreground">{heading}</p>
    <div className="mt-2 flex flex-col gap-1">
      {items.length === 0 && <p className="font-body text-xs text-muted-foreground">None yet.</p>}
      {items.map((item) => {
        const isMember = item.trackIds.includes(trackId);
        const busy = pendingId === item.id;
        return (
          <div key={item.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-white/5">
            {/* No cover on the item = a plain music-note tile. It used to fall
                back to a real cover from the catalogue, which read as "this
                playlist HAS that picture" — it doesn't. */}
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-background/60">
              <Music2 className="absolute h-3.5 w-3.5 text-muted-foreground" />
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  className="relative h-8 w-8 object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </span>
            <Link
              to={`${linkBase}/${item.id}`}
              className="min-w-0 flex-1 truncate font-body text-xs text-foreground transition-colors hover:text-[#F4C430]"
              title={item.title}
            >
              {item.title}
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggle(item, isMember)}
              aria-label={isMember ? `Remove from ${item.title}` : `Add to ${item.title}`}
              title={isMember ? "In it — click to remove" : "Click to add"}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                busy
                  ? "opacity-40"
                  : isMember
                    ? "border-green-500/60 bg-green-500/15 text-green-400 hover:border-red-400 hover:text-red-400"
                    : "border-border text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
              }`}
            >
              {isMember ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>
        );
      })}
    </div>
  </div>
);

export const AdminTrackCollectionsPanel = ({
  track,
  data,
  setData,
  run,
}: {
  track: CatalogTrack;
  data: AdminContentData | null;
  setData: Dispatch<SetStateAction<AdminContentData | null>>;
  run: (payload: RunPayload) => Promise<boolean>;
}) => {
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!data) {
    return (
      <PanelShell>
        <p className="font-body text-xs text-muted-foreground">Loading admin data…</p>
      </PanelShell>
    );
  }

  const toggle = async (kind: "collections" | "playlists", item: AdminContentItem, isMember: boolean) => {
    setPendingId(item.id);
    const changeKey = kind === "collections" ? "collectionChanges" : "playlistChanges";
    const ok = await run({
      action: "bulk_update_tracks",
      trackIds: [track.id],
      [changeKey]: isMember ? { remove: [item.id] } : { add: [item.id] },
    });
    setPendingId(null);
    if (!ok) return;
    setData((d) => {
      if (!d) return d;
      const list = d[kind].map((x) =>
        x.id === item.id
          ? {
              ...x,
              trackIds: isMember ? x.trackIds.filter((id) => id !== track.id) : [...x.trackIds, track.id],
            }
          : x,
      );
      return { ...d, [kind]: list };
    });
    // Drop the public /api/content cache so opening the playlist/collection
    // right after shows the change without a manual reload (F5).
    refreshContent();
  };

  return (
    <PanelShell>
      <MembershipList
        heading="Collections"
        items={data.collections}
        trackId={track.id}
        pendingId={pendingId}
        linkBase="/collection"
        onToggle={(item, isMember) => void toggle("collections", item, isMember)}
      />
      <MembershipList
        heading="Playlists"
        items={data.playlists}
        trackId={track.id}
        pendingId={pendingId}
        linkBase="/playlist"
        onToggle={(item, isMember) => void toggle("playlists", item, isMember)}
      />
    </PanelShell>
  );
};
