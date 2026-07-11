import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, GripVertical, Pause, Play, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { makeThumbnail } from "@/lib/audioEncoding";
import { brandCover, generateCoverApi, generateDescriptionApi, uploadCoverImage } from "@/lib/coverArt";
import { usePlayer } from "@/components/playerContext";
import { useTracks } from "@/hooks/useTracks";
import { refreshContent } from "@/hooks/useContent";
import AdminTracksEdit from "@/components/AdminTracksEdit";
import AddTrackModal from "@/components/AddTrackModal";
import { defaultVocabularies, type Vocabularies } from "@/lib/tagOptions";
import type { CatalogTrack } from "@/data/catalogTracks";

// Admin -> Content: one place to manage collections, playlists, the homepage
// Trending list AND per-track metadata (bulk "Tracks Edit" tab: tags, cover
// art, memberships), with inline track preview (global player).
// Spec: docs/PAGES_SPEC.md section 4.1.

interface ContentItem {
  id: string;
  title: string;
  shortTitle?: string;
  description: string;
  image: string;
  /** Playlists only: section on the /playlists page ("" = no theme). */
  theme?: string;
  trackIds: string[];
}

interface CategoryItem {
  id: string;
  title: string;
  trackIds: string[];
}

interface ContentData {
  dbTrackCount: number;
  trending: string[];
  categories?: CategoryItem[];
  collections: ContentItem[];
  playlists: ContentItem[];
  vocabularies?: Vocabularies;
  /** Persisted theme names — empty themes survive F5 (site_config list). */
  playlistThemes?: string[];
  /** Composer profiles (pseudonyms) for the upload composer picker. */
  composers?: { id: string; userId: string | null; displayName: string }[];
}

type Tab = "collections" | "playlists" | "categories" | "vocabulary" | "trending" | "tracks";
type Kind = "collection" | "playlist";

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";
const btnCls =
  "rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]";
const goldBtnCls =
  "rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50";

const api = async (payload: Record<string, unknown>) => {
  const res = await fetch("/api/admin/content", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Request failed");
  return data;
};

/** Track picker with preview; order = click order (numbers shown). */
const TrackPicker = ({
  tracks,
  selected,
  onChange,
}: {
  tracks: CatalogTrack[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) => {
  const player = usePlayer();
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
      {tracks.map((t) => {
        const idx = selected.indexOf(t.id);
        const version = t.audioVersions[0];
        const active = player.activeTrack?.id === t.id && player.isPlaying;
        return (
          <div key={t.id} className="flex items-center gap-2 font-body text-sm text-foreground/90">
            <button
              type="button"
              aria-label={active ? "Pause" : "Play preview"}
              onClick={() => version && player.playVersion(t, version)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
            >
              {active ? <Pause className="h-3 w-3" /> : <Play className="ml-0.5 h-3 w-3" />}
            </button>
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={idx >= 0}
                onChange={() => toggle(t.id)}
                className="accent-[#F4C430]"
              />
              <span className="truncate">{t.title}</span>
              {idx >= 0 && <span className="ml-auto shrink-0 text-xs text-[#F4C430]">#{idx + 1}</span>}
            </label>
          </div>
        );
      })}
    </div>
  );
};

const emptyDraft = {
  id: "",
  title: "",
  shortTitle: "",
  description: "",
  image: "",
  theme: "",
  trackIds: [] as string[],
};

const tabLabels: Record<Tab, string> = {
  collections: "Collections",
  playlists: "Playlists",
  categories: "Categories",
  vocabulary: "Vocabulary",
  trending: "Trending",
  tracks: "Tracks Edit",
};

const AdminContent = ({ tab }: { tab: Tab }) => {
  // drafts:true — the admin manager must also see bulk-uploaded (unpublished) tracks.
  const { tracks, source: trackSource, reload: reloadTracks } = useTracks({ drafts: true });
  const [data, setData] = useState<ContentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof emptyDraft | null>(null);
  const [trendingDraft, setTrendingDraft] = useState<string[] | null>(null);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  // Saved track edits, merged over the (once-fetched) useTracks list for display.
  const [trackOverrides, setTrackOverrides] = useState<Record<string, Partial<CatalogTrack>>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [vocabInput, setVocabInput] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [selResetKey, setSelResetKey] = useState(0);
  // Playlists tab: id of the playlist being dragged between/within theme sections.
  const [dragPlaylistId, setDragPlaylistId] = useState<string | null>(null);
  // Playlists tab: freshly created (still empty) theme sections — they persist
  // in the DB once a playlist is saved into them (mirrors /playlists page).
  const [adminDraftThemes, setAdminDraftThemes] = useState<string[]>([]);
  const [newThemeOpen, setNewThemeOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  // Vocabulary tab: the value being dragged (per facet) and the value being
  // renamed inline (double-click).
  const [dragVocab, setDragVocab] = useState<{ facet: string; value: string } | null>(null);
  const [vocabEdit, setVocabEdit] = useState<{ facet: string; value: string; draft: string } | null>(
    null,
  );

  const deleteSelectedTracks = async () => {
    if (selectedTrackIds.length === 0) return;
    const n = selectedTrackIds.length;
    if (!window.confirm(`Delete ${n} track${n > 1 ? "s" : ""}? This removes ${n > 1 ? "them" : "it"} from the catalog, collections and playlists. This cannot be undone.`)) {
      return;
    }
    const ok = await run({ action: "delete_track", trackIds: selectedTrackIds }, `${n} track${n > 1 ? "s" : ""} deleted`);
    if (ok) {
      setSelectedTrackIds([]);
      setSelResetKey((k) => k + 1);
      reload();
      void reloadTracks();
    }
  };

  // Bulk AI: generate cover art + SEO description for every selected track
  // that has at least one saved Usage, Genre AND Mood value. Runs one by one;
  // failures don't stop the queue.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  // Track ids with COVER generation in flight (sparkle on the row thumbnails)
  // and with TEXT generation in flight (pulse on the description field) —
  // separate lists so generating a cover never touches the text field.
  const [aiTrackIds, setAiTrackIds] = useState<string[]>([]);
  const [aiTextIds, setAiTextIds] = useState<string[]>([]);
  // Image model for the Tracks Edit generations (switcher in its toolbar).
  const [aiModel, setAiModel] = useState<"standard" | "premium">("standard");
  // Targeted patch for the single-track fields panel: ONLY the AI-written
  // fields are merged in, so unsaved manual edits are never wiped.
  const [fieldsPatch, setFieldsPatch] = useState<{
    n: number;
    trackId: string;
    patch: { cover?: string; description?: string };
  } | null>(null);
  const aiStart = (id: string) => setAiTrackIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  const aiStop = (id: string) => setAiTrackIds((ids) => ids.filter((x) => x !== id));

  // Generate + brand + thumbnail for ONE track's cover (per-row hover button).
  const generateCoverForTrack = async (trackId: string) => {
    const t = mergedTracks.find((x) => x.id === trackId);
    if (!t) return;
    if (!(t.useCase.trim() && t.genre.trim() && t.mood.trim())) {
      toast.error("Set at least one Usage, Genre and Mood on this track first.");
      return;
    }
    aiStart(trackId);
    try {
      const coverPath = await generateCoverApi({ trackId, model: aiModel });
      const blob = await (await fetch(coverPath)).blob();
      const original = new File([blob], "ai-cover.png", { type: blob.type || "image/png" });
      let cover = coverPath;
      try {
        cover = await uploadCoverImage(await brandCover(original), "ai-cover-branded.jpg");
      } catch {
        // unbranded original stays
      }
      let coverThumb = "";
      try {
        coverThumb = await uploadCoverImage(await makeThumbnail(original), "ai-cover-thumb.jpg");
      } catch {
        // rows fall back to the full cover
      }
      await api({ action: "bulk_update_tracks", trackIds: [trackId], fields: { cover, coverThumb } });
      setTrackOverrides((o) => ({ ...o, [trackId]: { ...o[trackId], cover, coverThumb } }));
      // Sync ONLY the cover into the fields panel — unsaved text stays put.
      setFieldsPatch({ n: Date.now(), trackId, patch: { cover } });
      toast.success(`Cover generated — ${t.title}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      aiStop(trackId);
    }
  };

  const aiFillSelectedTracks = async () => {
    const selected = selectedTrackIds
      .map((id) => mergedTracks.find((t) => t.id === id))
      .filter((t): t is CatalogTrack => !!t);
    const eligible = selected.filter(
      (t) => t.useCase.trim() && t.genre.trim() && t.mood.trim(),
    );
    const skipped = selected.length - eligible.length;
    if (eligible.length === 0) {
      toast.error("None of the selected tracks have Usage, Genre and Mood set — tag them first.");
      return;
    }
    if (
      !window.confirm(
        `Generate AI cover + description for ${eligible.length} track(s)?` +
          (skipped > 0 ? `\n${skipped} selected track(s) without full tags will be skipped.` : ""),
      )
    )
      return;
    setAiBusy(true);
    setAiTrackIds(eligible.map((t) => t.id));
    setAiTextIds(eligible.map((t) => t.id));
    let done = 0;
    let failed = 0;
    for (const t of eligible) {
      setAiNote(`${done + failed + 1}/${eligible.length}`);
      try {
        const [coverPath, description] = await Promise.all([
          generateCoverApi({ trackId: t.id, model: aiModel }),
          generateDescriptionApi({ trackId: t.id }),
        ]);
        const blob = await (await fetch(coverPath)).blob();
        const original = new File([blob], "ai-cover.png", { type: blob.type || "image/png" });
        let cover = coverPath;
        try {
          cover = await uploadCoverImage(await brandCover(original), "ai-cover-branded.jpg");
        } catch {
          // unbranded original stays
        }
        let coverThumb = "";
        try {
          coverThumb = await uploadCoverImage(await makeThumbnail(original), "ai-cover-thumb.jpg");
        } catch {
          // rows fall back to the full cover
        }
        await api({
          action: "bulk_update_tracks",
          trackIds: [t.id],
          fields: { cover, coverThumb, description },
        });
        setTrackOverrides((o) => ({
          ...o,
          [t.id]: { ...o[t.id], cover, coverThumb, description },
        }));
        setFieldsPatch({ n: Date.now(), trackId: t.id, patch: { cover, description } });
        done += 1;
      } catch (e) {
        failed += 1;
        toast.error(`${t.title}: ${e instanceof Error ? e.message : "failed"}`);
      } finally {
        aiStop(t.id);
        setAiTextIds((ids) => ids.filter((x) => x !== t.id));
      }
    }
    setAiBusy(false);
    setAiNote("");
    setAiTrackIds([]);
    setAiTextIds([]);
    if (done > 0) {
      toast.success(
        `AI art & text ready for ${done} track(s)` + (failed > 0 ? ` · ${failed} failed` : ""),
      );
    }
  };

  const publishSelectedTracks = async () => {
    if (selectedTrackIds.length === 0) return;
    const n = selectedTrackIds.length;
    const ok = await run(
      { action: "bulk_update_tracks", trackIds: selectedTrackIds, fields: { status: "published" } },
      `${n} track${n > 1 ? "s" : ""} published`,
    );
    if (ok) {
      setSelectedTrackIds([]);
      setSelResetKey((k) => k + 1);
      void reloadTracks();
    }
  };

  // (The legacy per-track "Upload stems ZIP" flow was removed — stems arrive
  // as plain audio files through Bulk Upload; Tags Base took its button spot.)

  // Reset any open draft when the sidebar switches the active view.
  useEffect(() => {
    setDraft(null);
  }, [tab]);

  const uploadCover = async (
    file: File | Blob,
    apply: (path: string) => void,
    filename?: string,
  ) => {
    setUploading(true);
    try {
      const raw = filename ?? (file instanceof File ? file.name : "cover");
      const base = raw.replace(/\.[^.]+$/, "");
      const res = await fetch(`/api/admin/upload?filename=${encodeURIComponent(base)}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; error?: string };
      if (!res.ok || !d.ok || !d.path) throw new Error(d.error ?? "Upload failed");
      apply(d.path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const uploadAudio = async (
    file: File | Blob,
    kind: "preview" | "preview128" | "master" | "wavzip" | "stems",
    filename?: string,
  ): Promise<{ key: string; path: string | null } | null> => {
    const raw = filename ?? (file instanceof File ? file.name : kind);
    const base = raw.replace(/\.[^.]+$/, "");
    try {
      const res = await fetch(
        `/api/admin/upload-audio?kind=${kind}&filename=${encodeURIComponent(base)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": file.type || "application/octet-stream" },
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      return null;
    }
  };

  const reload = useCallback(() => {
    fetch("/api/admin/content", { credentials: "include" })
      .then(async (res) => {
        const d = (await res.json()) as ContentData & { error?: string };
        if (!res.ok) throw new Error(d.error ?? "Failed to load");
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await api(payload);
      toast.success(okMsg);
      reload();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="font-body text-sm text-red-400">{error}</p>;
  if (!data) return <p className="font-body text-sm text-muted-foreground">Loading content...</p>;

  const kind: Kind = tab === "playlists" ? "playlist" : "collection";
  const items = tab === "playlists" ? data.playlists : data.collections;
  const trending = trendingDraft ?? data.trending;
  const mergedTracks = tracks.map((t) => ({ ...t, ...trackOverrides[t.id] }));
  const vocab = data.vocabularies ?? defaultVocabularies;

  // ---- Playlists grouped by THEME (mirrors /playlists) + drag&drop ----------
  const playlistSections: { theme: string; items: ContentItem[] }[] = [];
  if (tab === "playlists") {
    for (const p of data.playlists) {
      const theme = (p.theme ?? "").trim();
      const s = playlistSections.find((x) => x.theme === theme);
      if (s) s.items.push(p);
      else playlistSections.push({ theme, items: [p] });
    }
    playlistSections.sort((a, b) => (a.theme === "" ? -1 : b.theme === "" ? 1 : 0));
    // Persisted theme names (survive F5 even while empty) + just-created ones.
    for (const t of [...(data.playlistThemes ?? []), ...adminDraftThemes]) {
      if (!playlistSections.some((s) => s.theme.toLowerCase() === t.toLowerCase())) {
        playlistSections.push({ theme: t, items: [] });
      }
    }
  }

  /** Adds a theme to the persisted list (so it survives F5 while empty). */
  const addPlaylistTheme = async (name: string) => {
    const t = name.trim();
    if (!t) return;
    setAdminDraftThemes((prev) => [...prev, t]);
    const stored = data.playlistThemes ?? [];
    if (!stored.some((x) => x.toLowerCase() === t.toLowerCase())) {
      const ok = await run({ action: "set_playlist_themes", values: [...stored, t] }, "Theme saved");
      if (ok) reload();
    }
  };

  /** Removes an EMPTY theme from the persisted list (its header X button). */
  const removePlaylistTheme = async (theme: string) => {
    setAdminDraftThemes((prev) => prev.filter((x) => x.toLowerCase() !== theme.toLowerCase()));
    const stored = data.playlistThemes ?? [];
    if (stored.some((x) => x.toLowerCase() === theme.toLowerCase())) {
      const ok = await run(
        {
          action: "set_playlist_themes",
          values: stored.filter((x) => x.toLowerCase() !== theme.toLowerCase()),
        },
        "Theme removed",
      );
      if (ok) reload();
    }
  };

  /** Persists a new section layout: optional theme move for one playlist + the
      global sort order (themes move with their playlists automatically). */
  const savePlaylistLayout = async (
    sections: { theme: string; items: ContentItem[] }[],
    moved?: ContentItem,
    newTheme?: string,
  ) => {
    setBusy(true);
    try {
      if (moved && newTheme !== undefined) {
        await api({
          action: "upsert_playlist",
          id: moved.id,
          title: moved.title,
          description: moved.description,
          image: moved.image,
          theme: newTheme,
        });
      }
      await api({
        action: "reorder_content",
        kind: "playlist",
        values: sections.flatMap((s) => s.items.map((i) => i.id)),
      });
      toast.success("Playlists updated");
      reload();
      void refreshContent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    } finally {
      setBusy(false);
    }
  };

  /** Drop the dragged playlist into `targetTheme`, before `beforeId` (null = end). */
  const dropPlaylist = (targetTheme: string, beforeId: string | null) => {
    const id = dragPlaylistId;
    setDragPlaylistId(null);
    if (!id || busy) return;
    const sections = playlistSections.map((s) => ({ ...s, items: [...s.items] }));
    let movedItem: ContentItem | undefined;
    for (const s of sections) {
      const i = s.items.findIndex((x) => x.id === id);
      if (i !== -1) {
        movedItem = s.items.splice(i, 1)[0];
        break;
      }
    }
    if (!movedItem || movedItem.id === beforeId) return;
    const target = sections.find((s) => s.theme === targetTheme);
    if (!target) return;
    let idx = beforeId ? target.items.findIndex((x) => x.id === beforeId) : target.items.length;
    if (idx < 0) idx = target.items.length;
    target.items.splice(idx, 0, movedItem);
    const themeChanged = (movedItem.theme ?? "").trim() !== targetTheme;
    void savePlaylistLayout(
      sections,
      themeChanged ? movedItem : undefined,
      themeChanged ? targetTheme : undefined,
    );
  };

  /** Move a whole theme section up/down — its playlists travel with it. */
  const moveTheme = (index: number, dir: -1 | 1) => {
    if (busy) return;
    const sections = [...playlistSections];
    const j = index + dir;
    if (j < 0 || j >= sections.length) return;
    [sections[index], sections[j]] = [sections[j], sections[index]];
    void savePlaylistLayout(sections);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-body text-lg font-semibold text-foreground">{tabLabels[tab]}</h2>
        {data.dbTrackCount === 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run({ action: "seed_catalog" }, "Catalog copied to the database")}
            className={goldBtnCls}
          >
            Load demo catalog into DB
          </button>
        )}
        {tab === "tracks" && trackSource === "api" && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedTrackIds.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={busy || aiBusy}
                  onClick={() => void aiFillSelectedTracks()}
                  title="Generate AI cover art + description for every selected track that has Usage, Genre and Mood set"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#F4C430]/60 px-4 py-2 font-body text-sm font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430]/10 disabled:opacity-50"
                >
                  <Sparkles className={`h-4 w-4 ${aiBusy ? "animate-pulse" : ""}`} />
                  {aiBusy ? `AI ${aiNote}…` : `AI Art & Text (${selectedTrackIds.length})`}
                </button>
                <button
                  type="button"
                  disabled={busy || aiBusy}
                  onClick={() => void publishSelectedTracks()}
                  className={goldBtnCls}
                >
                  Publish ({selectedTrackIds.length})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteSelectedTracks()}
                  className="rounded-lg bg-red-600 px-4 py-2 font-body text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  Delete ({selectedTrackIds.length})
                </button>
              </>
            )}
            <button type="button" onClick={() => setAddOpen(true)} className={goldBtnCls}>
              + Add Track
            </button>
          </div>
        )}
      </div>

      {data.dbTrackCount === 0 && (
        <p className="mt-3 font-body text-xs text-muted-foreground">
          The database has no tracks yet — press the gold button once so collections, playlists and
          trending manage real rows (16 tracks, 7 collections).
        </p>
      )}

      {(tab === "collections" || tab === "playlists") && (
        <>
          {tab === "playlists" ? (
            /* Grouped by theme, mirroring /playlists. Drag a playlist row to
               reorder or drop it into another theme; ↑↓ move whole themes. */
            <div className="mt-5 flex flex-col gap-4">
              {playlistSections.map((sec, si) => (
                <div
                  key={sec.theme || "__none"}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropPlaylist(sec.theme, null);
                  }}
                  className={`rounded-lg border border-border/60 ${busy ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2 border-b border-border/50 bg-secondary/30 px-3 py-2">
                    <span className="font-body text-xs font-semibold uppercase tracking-wide text-foreground">
                      {sec.theme || "No theme (top of the page)"}
                    </span>
                    <span className="font-body text-[11px] text-muted-foreground">
                      {sec.items.length} playlist{sec.items.length === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      {/* Playlists are created INSIDE a theme only (owner rule) —
                          the no-theme section can hold legacy rows but not new ones. */}
                      {sec.theme && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDraft({ ...emptyDraft, theme: sec.theme })}
                          title={`Create a playlist in ${sec.theme}`}
                          className="mr-1 rounded-md border border-[#F4C430]/50 px-2 py-0.5 font-body text-[11px] font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430]/10 disabled:opacity-40"
                        >
                          + Playlist
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={si === 0 || busy}
                        onClick={() => moveTheme(si, -1)}
                        title="Move theme up (with its playlists)"
                        aria-label={`Move ${sec.theme || "no-theme"} section up`}
                        className="text-muted-foreground transition-colors hover:text-[#F4C430] disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={si === playlistSections.length - 1 || busy}
                        onClick={() => moveTheme(si, 1)}
                        title="Move theme down (with its playlists)"
                        aria-label={`Move ${sec.theme || "no-theme"} section down`}
                        className="text-muted-foreground transition-colors hover:text-[#F4C430] disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      {/* Empty themes can be deleted (occupied ones can't). */}
                      {sec.theme && sec.items.length === 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Delete empty theme "${sec.theme}"?`)) {
                              void removePlaylistTheme(sec.theme);
                            }
                          }}
                          title="Delete this empty theme"
                          aria-label={`Delete theme ${sec.theme}`}
                          className="text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-30"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </div>
                  <ul className="divide-y divide-border/50">
                    {sec.items.map((item) => (
                      <li
                        key={item.id}
                        draggable={!busy}
                        onDragStart={(e) => {
                          setDragPlaylistId(item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragPlaylistId(null)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dropPlaylist(sec.theme, item.id);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 ${
                          dragPlaylistId === item.id ? "opacity-40" : ""
                        }`}
                      >
                        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />
                        {item.image && (
                          <img src={item.image} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-body text-sm font-semibold text-foreground">
                            {item.title}
                          </span>
                          <span className="block truncate font-body text-xs text-muted-foreground">
                            {item.trackIds.length} tracks · /playlists/{item.id}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            className={btnCls}
                            onClick={() =>
                              setDraft({
                                id: item.id,
                                title: item.title,
                                shortTitle: item.shortTitle ?? "",
                                description: item.description,
                                image: item.image,
                                theme: item.theme ?? "",
                                trackIds: item.trackIds,
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                            onClick={() => {
                              if (window.confirm(`Delete "${item.title}"?`)) {
                                void run({ action: "delete_playlist", id: item.id }, "Deleted");
                              }
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      </li>
                    ))}
                    {sec.items.length === 0 && (
                      <li className="px-3 py-3 font-body text-xs text-muted-foreground">
                        Drop playlists here.
                      </li>
                    )}
                  </ul>
                </div>
              ))}
              {playlistSections.length === 0 && (
                <p className="font-body text-sm text-muted-foreground">Nothing here yet.</p>
              )}
            </div>
          ) : (
          <ul className="mt-5 divide-y divide-border/60">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-body text-sm font-semibold text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate font-body text-xs text-muted-foreground">
                    {item.trackIds.length} tracks · /collections/{item.id}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={btnCls}
                    onClick={() =>
                      setDraft({
                        id: item.id,
                        title: item.title,
                        shortTitle: item.shortTitle ?? "",
                        description: item.description,
                        image: item.image,
                        theme: item.theme ?? "",
                        trackIds: item.trackIds,
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete "${item.title}"?`)) {
                        void run({ action: `delete_${kind}`, id: item.id }, "Deleted");
                      }
                    }}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
            {items.length === 0 && (
              <li className="py-3 font-body text-sm text-muted-foreground">Nothing here yet.</li>
            )}
          </ul>
          )}

          {!draft && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* Playlists: no theme-less creation — use "+ Playlist" inside a
                  theme section; here you only add new themes. */}
              {tab !== "playlists" && (
                <button type="button" className={goldBtnCls} onClick={() => setDraft({ ...emptyDraft })}>
                  New {kind}
                </button>
              )}
              {tab === "playlists" &&
                (newThemeOpen ? (
                  <span className="inline-flex items-center gap-2">
                    <input
                      autoFocus
                      value={newThemeName}
                      onChange={(e) => setNewThemeName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void addPlaylistTheme(newThemeName);
                          setNewThemeName("");
                          setNewThemeOpen(false);
                        }
                        if (e.key === "Escape") setNewThemeOpen(false);
                      }}
                      placeholder="Theme name (e.g. Podcast)"
                      className={`${inputCls} w-52 py-2 text-xs`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void addPlaylistTheme(newThemeName);
                        setNewThemeName("");
                        setNewThemeOpen(false);
                      }}
                      aria-label="Add theme"
                      className="text-[#F4C430] transition-colors hover:opacity-80"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewThemeOpen(false)}
                      aria-label="Cancel"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewThemeOpen(true)}
                    className="rounded-lg border border-dashed border-[#F4C430]/50 px-4 py-2 font-body text-sm font-semibold text-[#F4C430]/80 transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                  >
                    + New theme
                  </button>
                ))}
            </div>
          )}

          {draft && (
            <form
              className="mt-5 flex flex-col gap-3 rounded-lg border border-border/60 p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                // Owner rule: a NEW playlist must live inside a theme.
                if (kind === "playlist" && !draft.id && !draft.theme.trim()) {
                  toast.error("Pick a theme — playlists are created inside a theme");
                  return;
                }
                const saved = await run(
                  {
                    action: `upsert_${kind}`,
                    id: draft.id || undefined,
                    title: draft.title,
                    shortTitle: draft.shortTitle || undefined,
                    description: draft.description,
                    image: draft.image,
                    ...(kind === "playlist" ? { theme: draft.theme } : {}),
                  },
                  "Saved",
                );
                if (saved && kind === "playlist") void refreshContent();
                if (saved && draft.id) {
                  await run(
                    { action: "set_tracks", kind, id: draft.id, trackIds: draft.trackIds },
                    "Tracks updated",
                  );
                }
                if (saved && !draft.id) {
                  toast("Now open Edit to assign tracks to the new item.");
                }
                setDraft(null);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  placeholder="Title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className={inputCls}
                />
                <div className="flex min-w-0 gap-2">
                  <input
                    placeholder="Cover image URL — or press Upload"
                    value={draft.image}
                    onChange={(e) => setDraft({ ...draft, image: e.target.value })}
                    className={`${inputCls} min-w-0 flex-1`}
                  />
                  <label
                    className={`${btnCls} flex shrink-0 cursor-pointer items-center whitespace-nowrap ${
                      uploading ? "pointer-events-none opacity-60" : ""
                    }`}
                  >
                    {uploading ? "Uploading..." : "Upload"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          void uploadCover(f, (path) =>
                            setDraft((prev) => (prev ? { ...prev, image: path } : prev)),
                          );
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              {kind === "collection" && (
                <input
                  placeholder="Short title (for cards)"
                  value={draft.shortTitle}
                  onChange={(e) => setDraft({ ...draft, shortTitle: e.target.value })}
                  className={inputCls}
                />
              )}
              {kind === "playlist" && (
                <input
                  placeholder="Theme — section on the /playlists page (empty = top, no section)"
                  value={draft.theme}
                  onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
                  className={inputCls}
                />
              )}
              <textarea
                placeholder="Short description"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className={inputCls}
              />
              <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">
                Tracks (click order = display order)
              </p>
              <TrackPicker
                tracks={mergedTracks}
                selected={draft.trackIds}
                onChange={(ids) => setDraft({ ...draft, trackIds: ids })}
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className={goldBtnCls}>
                  {busy ? "Saving..." : "Save"}
                </button>
                <button type="button" className={btnCls} onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {tab === "categories" && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="font-body text-sm text-muted-foreground">
            Category chips on the homepage — each links to /catalog?category=…
            ("Best for Trailers", "Epic Openers", "Music for Drone Footage", …).
            Assign tracks to categories in the <span className="text-foreground">Tracks Edit</span> tab.
          </p>
          <ul className="divide-y divide-border/60">
            {(data.categories ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-body text-sm font-semibold text-foreground">
                    {c.title}
                  </span>
                  <span className="block truncate font-body text-xs text-muted-foreground">
                    {c.trackIds.length} tracks · /catalog?category={c.id}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy}
                    onClick={() => {
                      const title = window.prompt(`Rename "${c.title}" to:`, c.title)?.trim();
                      if (title && title !== c.title) {
                        void run({ action: "upsert_category", id: c.id, title }, "Category renamed");
                      }
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete category "${c.title}"? Tracks stay, only the chip and its list are removed.`)) {
                        void run({ action: "delete_category", id: c.id }, "Category deleted");
                      }
                    }}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
            {(data.categories ?? []).length === 0 && (
              <li className="py-3 font-body text-sm text-muted-foreground">No categories yet.</li>
            )}
          </ul>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const title = newCategoryTitle.trim();
              if (!title) return;
              const ok = await run({ action: "upsert_category", title }, "Category added");
              if (ok) setNewCategoryTitle("");
            }}
          >
            <input
              placeholder='New category title (e.g. "Best for Trailers")'
              value={newCategoryTitle}
              onChange={(e) => setNewCategoryTitle(e.target.value)}
              className={`${inputCls} w-72 max-w-full`}
            />
            <button type="submit" disabled={busy || !newCategoryTitle.trim()} className={goldBtnCls}>
              Add category
            </button>
          </form>
        </div>
      )}

      {tab === "vocabulary" && (
        <div className="mt-5 flex flex-col gap-6">
          <p className="font-body text-sm text-muted-foreground">
            The Use Case / Genre / Mood values shown in the catalog filters and the Tracks Edit
            panel — in the same order they appear on the site. Drag a row to reorder; double-click
            a value to rename it (every track using it is retagged automatically); deleting a
            value also removes it from any track that uses it.
          </p>
          {(
            [
              ["useCase", "Use Case"],
              ["genre", "Genre"],
              ["mood", "Mood"],
            ] as Array<[keyof Vocabularies, string]>
          ).map(([key, label]) => {
            const list = vocab[key];
            const saveOrder = (next: string[]) =>
              void run({ action: "set_vocab", facet: key, values: next }, "Order updated");
            /** Native DnD: drop the dragged value before `beforeValue` (null = end). */
            const dropVocab = (beforeValue: string | null) => {
              const drag = dragVocab;
              setDragVocab(null);
              if (!drag || drag.facet !== key || busy || drag.value === beforeValue) return;
              const next = list.filter((v) => v !== drag.value);
              let idx = beforeValue ? next.indexOf(beforeValue) : next.length;
              if (idx < 0) idx = next.length;
              next.splice(idx, 0, drag.value);
              saveOrder(next);
            };
            return (
              <div key={key} className="rounded-lg border border-border/60 p-4">
                <p className="mb-3 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label} <span className="text-muted-foreground/60">({list.length})</span>
                </p>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropVocab(null);
                  }}
                  className={`flex flex-col divide-y divide-border/40 overflow-hidden rounded-lg border border-border/40 ${
                    busy ? "opacity-60" : ""
                  }`}
                >
                  {list.map((value, i) => (
                    <div
                      key={value}
                      draggable={!busy}
                      onDragStart={() => setDragVocab({ facet: key, value })}
                      onDragEnd={() => setDragVocab(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropVocab(value);
                      }}
                      className={`flex cursor-grab items-center justify-between gap-3 bg-background/40 px-3 py-2 active:cursor-grabbing ${
                        dragVocab?.facet === key && dragVocab.value === value ? "opacity-40" : ""
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2 font-body text-sm text-foreground">
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        <span className="w-5 shrink-0 text-right font-body text-xs tabular-nums text-muted-foreground/60">
                          {i + 1}
                        </span>
                        {vocabEdit && vocabEdit.facet === key && vocabEdit.value === value ? (
                          /* Inline rename (double-click): Enter/blur saves —
                             every track carrying the value is retagged too. */
                          <input
                            value={vocabEdit.draft}
                            autoFocus
                            disabled={busy}
                            onChange={(e) =>
                              setVocabEdit((prev) => (prev ? { ...prev, draft: e.target.value } : prev))
                            }
                            onBlur={async () => {
                              const draft = vocabEdit.draft.trim();
                              setVocabEdit(null);
                              if (!draft || draft === value) return;
                              await run(
                                { action: "rename_vocab", facet: key, value, newValue: draft },
                                `Renamed — tracks retagged to "${draft}"`,
                              );
                              void refreshContent();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setVocabEdit(null);
                            }}
                            className={`${inputCls} min-w-0 flex-1 px-2 py-1 text-sm`}
                          />
                        ) : (
                          <span
                            className="cursor-text truncate"
                            title="Double-click to rename (tracks are retagged automatically)"
                            onDoubleClick={() => setVocabEdit({ facet: key, value, draft: value })}
                          >
                            {value}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Delete ${value}`}
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete "${value}" from ${label}? It will be removed from any track using it.`,
                              )
                            ) {
                              void run({ action: "delete_vocab", facet: key, value }, "Value deleted");
                            }
                          }}
                          className="ml-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  ))}
                  {list.length === 0 && (
                    <p className="bg-background/40 px-3 py-2 font-body text-xs text-muted-foreground">
                      No values yet.
                    </p>
                  )}
                </div>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const value = (vocabInput[key] ?? "").trim();
                    if (!value) return;
                    const ok = await run({ action: "add_vocab", facet: key, value }, "Value added");
                    if (ok) setVocabInput((prev) => ({ ...prev, [key]: "" }));
                  }}
                >
                  <input
                    placeholder={`Add a ${label.toLowerCase()} value...`}
                    value={vocabInput[key] ?? ""}
                    onChange={(e) => setVocabInput((prev) => ({ ...prev, [key]: e.target.value }))}
                    className={`${inputCls} w-64 max-w-full`}
                  />
                  <button
                    type="submit"
                    disabled={busy || !(vocabInput[key] ?? "").trim()}
                    className={btnCls}
                  >
                    <Plus className="mr-1 inline h-3 w-3" />
                    Add
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      {tab === "trending" && (
        <div className="mt-5 flex flex-col gap-3">
          <p className="font-body text-sm text-muted-foreground">
            Tracks shown in the "Trending tracks" block on the homepage. Click order = display order.
          </p>
          <TrackPicker
            tracks={mergedTracks}
            selected={trending}
            onChange={(ids) => setTrendingDraft(ids)}
          />
          <button
            type="button"
            disabled={busy || trendingDraft === null}
            className={`self-start ${goldBtnCls}`}
            onClick={async () => {
              const ok = await run({ action: "set_trending", trackIds: trending }, "Trending saved");
              if (ok) setTrendingDraft(null);
            }}
          >
            {busy ? "Saving..." : "Save trending"}
          </button>
        </div>
      )}

      {tab === "tracks" && (
        <AdminTracksEdit
          tracks={mergedTracks}
          vocabularies={vocab}
          categories={(data.categories ?? []).map((c) => ({ id: c.id, title: c.title, trackIds: c.trackIds }))}
          collections={data.collections}
          playlists={data.playlists}
          trending={data.trending}
          disabled={trackSource !== "api"}
          busy={busy}
          uploading={uploading}
          run={run}
          uploadCover={uploadCover}
          onTracksReload={() => void reloadTracks()}
          onApplyOverrides={(overrides) =>
            setTrackOverrides((prev) => {
              const next = { ...prev };
              for (const [id, o] of Object.entries(overrides)) next[id] = { ...next[id], ...o };
              return next;
            })
          }
          onSelectionChange={setSelectedTrackIds}
          selectionResetKey={selResetKey}
          aiTrackIds={aiTrackIds}
          aiTextIds={aiTextIds}
          fieldsPatch={fieldsPatch}
          onGenerateCover={(id) => void generateCoverForTrack(id)}
          aiModel={aiModel}
          onAiModelChange={setAiModel}
        />
      )}

      {addOpen && (
        <AddTrackModal
          onClose={() => setAddOpen(false)}
          run={run}
          uploadCover={uploadCover}
          uploadAudio={uploadAudio}
          onCreated={() => {
            reload();
            void reloadTracks();
          }}
          vocabularies={vocab}
          categories={(data.categories ?? []).map((c) => ({ id: c.id, title: c.title }))}
          composers={data.composers ?? []}
        />
      )}
    </div>
  );
};

export default AdminContent;
