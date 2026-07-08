import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
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
import { formatDuration, unzipBlob, wavToMp3Pair, zipEntries } from "@/lib/audioEncoding";
import { cleanVersionLabel } from "@/lib/downloadTrack";
import type { Vocabularies } from "@/lib/tagOptions";

// Admin-only side panels for the public track page (/track/:slug).
// LEFT: toggle the track's Use Case / Genre / Mood values + a Trending box
//       (add this track, reorder with arrows — same list as the homepage).
// RIGHT: Collections & Playlists with a plus / green check per item.
// Customers never see these — TrackDetail renders them only for role=admin,
// and every call goes through the admin-gated /api/admin/content API.

const GOLD = "#F4C430";
// Same default cover the public collection/playlist pages fall back to.
const FALLBACK_COVER = "/images/collections/orchestral.jpg";

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

/** The track's current WAV bundle unpacked, or null when there is none. */
const fetchZipEntries = async (trackId: string): Promise<Record<string, Uint8Array> | null> => {
  const r = await fetch(`/api/admin/master?track=${encodeURIComponent(trackId)}`, { credentials: "include" });
  if (!r.ok) return null;
  try {
    return await unzipBlob(await r.blob());
  } catch {
    return null;
  }
};

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
  const norm = (s: string) => (cleanVersionLabel(s, track.title) || s).trim().toLowerCase();

  const addVersion = async (file: File) => {
    setBusy("Encoding MP3…");
    try {
      const { mp3_320, mp3_128, duration } = await wavToMp3Pair(file);
      setBusy("Uploading previews…");
      const p320 = await uploadAudioApi(mp3_320, "preview", file.name);
      const p128 = await uploadAudioApi(mp3_128, "preview128", file.name).catch(() => null);

      // Rebuild the WAV bundle with the new file inside (when a bundle exists).
      let wavZipKey: string | undefined;
      setBusy("Updating WAV bundle…");
      const entries = await fetchZipEntries(track.id);
      if (entries) {
        let name = file.name.replace(/[^\w.\- ]+/g, "_");
        if (!/\.wav$/i.test(name)) name += ".wav";
        let unique = name;
        let k = 2;
        while (Object.keys(entries).some((e) => e.toLowerCase() === unique.toLowerCase())) {
          unique = name.replace(/\.wav$/i, ` (${k++}).wav`);
        }
        entries[unique] = new Uint8Array(await file.arrayBuffer());
        const blob = await zipEntries(entries);
        const up = await uploadAudioApi(blob, "wavzip", track.title);
        wavZipKey = up.key;
      }

      const base = file.name.replace(/\.[a-z0-9]+$/i, "");
      const label = cleanVersionLabel(base, track.title) || `Version ${versions.length + 1}`;
      const ok = await run({
        action: "add_version",
        id: track.id,
        label,
        previewSrc: p320.path,
        preview128: p128?.path ?? undefined,
        duration: formatDuration(duration),
        wavZipKey,
      });
      if (ok) {
        toast.success(`Version "${label}" added`);
        onTracksChanged();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add version failed");
    } finally {
      setBusy(null);
    }
  };

  const deleteVersion = async (v: TrackAudioVersion) => {
    if (!window.confirm(`Delete version "${v.label}"?`)) return;
    setPendingId(v.id);
    try {
      // Try to drop the matching WAV from the bundle (matched by label).
      let wavZipKey: string | undefined;
      const entries = await fetchZipEntries(track.id);
      if (entries) {
        const match = Object.keys(entries).find(
          (name) => norm(name.replace(/\.wav$/i, "")) === norm(v.label),
        );
        if (match) {
          delete entries[match];
          const blob = await zipEntries(entries);
          const up = await uploadAudioApi(blob, "wavzip", track.title);
          wavZipKey = up.key;
        } else {
          toast("WAV bundle unchanged", {
            description: "Couldn't match this version's file inside the zip.",
          });
        }
      }
      const ok = await run({ action: "delete_version", id: track.id, versionId: v.id, wavZipKey });
      if (ok) {
        toast.success("Version deleted");
        onTracksChanged();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
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
    const ok = await run({ action: "rename_version", id: track.id, versionId: v.id, label: t });
    if (ok) onTracksChanged();
  };

  return (
    <div className="border-b border-border/50 py-3">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm font-semibold text-foreground">Versions ({versions.length})</p>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => fileRef.current?.click()}
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
      <input
        ref={fileRef}
        type="file"
        accept=".wav,audio/wav,audio/x-wav"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addVersion(f);
          e.target.value = "";
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
  const navigate = useNavigate();

  if (!data) {
    return (
      <PanelShell>
        <p className="font-body text-xs text-muted-foreground">Loading admin data…</p>
      </PanelShell>
    );
  }

  const deleteTrack = async () => {
    if (
      !window.confirm(
        `Delete "${track.title}" from the catalog? Its files, collections and playlist entries go too. This cannot be undone.`,
      )
    )
      return;
    const ok = await run({ action: "delete_track", id: track.id });
    if (ok) {
      toast.success("Track deleted");
      refreshContent();
      navigate("/catalog");
    }
  };

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
    <PanelShell
      headerAction={
        <button
          type="button"
          onClick={() => void deleteTrack()}
          title="Delete this track from the catalog"
          className="inline-flex items-center gap-1 font-body text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete track
        </button>
      }
    >
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
            {/* Same fallback image the public pages use, so the thumb never looks empty. */}
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-background/60">
              <Music2 className="absolute h-3.5 w-3.5 text-muted-foreground" />
              <img
                src={item.image || FALLBACK_COVER}
                alt=""
                className="relative h-8 w-8 object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
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
