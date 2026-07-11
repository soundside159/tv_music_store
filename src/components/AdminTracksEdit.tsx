import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Minus, Music, Pause, Play, Search, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import WaveformPreview from "@/components/WaveformPreview";
import { generateDescriptionApi } from "@/lib/coverArt";
import { renameWavInBundle } from "@/lib/wavBundle";
import { parseXlsx } from "@/lib/xlsxRead";
import { usePlayer } from "@/components/playerContext";
import { splitFilterValues } from "@/components/TrackRowPlayer";
import type { Vocabularies } from "@/lib/tagOptions";
import type { CatalogTrack } from "@/data/catalogTracks";

// Admin -> Content -> "Tracks Edit": bulk track editor (tunetank-style).
// The edit panel is a PERMANENT right column (sticky, no overlay — no dead
// gap between table and checkboxes). Select tracks with checkboxes; the panel
// shows tri-state checkboxes for Usage / Mood / Genre, playlist / collection /
// category membership and a Trending radio. Mixed values across the selection
// render as a gold dash; click cycles mixed -> off (remove from all) -> on
// (add to all). With exactly one track selected the panel adds field editing
// (title, BPM, description, tags, cover upload, stems flag).

export interface ContentItemLite {
  id: string;
  title: string;
  trackIds: string[];
}

type TriState = "all" | "none" | "mixed";
type FacetKey = "useCase" | "genre" | "mood";
type SortMode = "default" | "trending";

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";
const btnCls =
  "rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:pointer-events-none disabled:opacity-50";
const goldBtnCls =
  "rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50";

// Facet key + label; the selectable options come from the live `vocabularies`
// prop (admin-editable) so this list stays in sync with Admin -> Vocabulary.
const FACETS: Array<{ key: FacetKey; label: string }> = [
  { key: "useCase", label: "Usage" },
  { key: "mood", label: "Mood" },
  { key: "genre", label: "Genre" },
];

const facetValue = (track: CatalogTrack, key: FacetKey) =>
  key === "useCase" ? track.useCase : key === "genre" ? track.genre : track.mood;

/** Checkbox that can render a "mixed" (dash) state, like the OS ones. */
const TriCheckbox = ({
  label,
  state,
  onToggle,
}: {
  label: string;
  state: TriState;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-foreground/[0.04]"
  >
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
        state === "none" ? "border-border" : "border-[#F4C430] bg-[#F4C430]/15"
      }`}
    >
      {state === "all" && <Check className="h-3 w-3 text-[#F4C430]" />}
      {state === "mixed" && <Minus className="h-3 w-3 text-[#F4C430]" />}
    </span>
    <span className="truncate font-body text-xs text-foreground/90">{label}</span>
  </button>
);

/** Plain selection checkbox for table rows / header. */
const RowCheckbox = ({ state, onToggle, label }: { state: TriState; onToggle: () => void; label: string }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onToggle}
    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
      state === "none" ? "border-border hover:border-[#F4C430]/60" : "border-[#F4C430] bg-[#F4C430]"
    }`}
  >
    {state === "all" && <Check className="h-3 w-3 text-background" />}
    {state === "mixed" && <Minus className="h-3 w-3 text-background" />}
  </button>
);

interface SingleFields {
  title: string;
  bpm: string;
  description: string;
  cover: string;
  tags: string;
  hasStems: boolean;
}

const fieldsOf = (t: CatalogTrack): SingleFields => ({
  title: t.title,
  bpm: t.bpm ? String(t.bpm) : "",
  description: t.description,
  cover: t.cover ?? "",
  tags: t.tags.join(", "),
  hasStems: t.hasStems ?? false,
});

const AdminTracksEdit = ({
  tracks,
  vocabularies,
  categories,
  collections,
  playlists,
  trending,
  disabled,
  busy,
  uploading,
  run,
  uploadCover,
  onTracksReload,
  onApplyOverrides,
  onSelectionChange,
  selectionResetKey,
  aiTrackIds = [],
  aiTextIds = [],
  fieldsPatch,
  onGenerateCover,
  aiModel = "standard",
  onAiModelChange,
}: {
  tracks: CatalogTrack[];
  vocabularies: Vocabularies;
  categories: ContentItemLite[];
  collections: ContentItemLite[];
  playlists: ContentItemLite[];
  trending: string[];
  disabled: boolean;
  busy: boolean;
  uploading: boolean;
  run: (payload: Record<string, unknown>, okMsg: string) => Promise<boolean>;
  uploadCover: (file: File, apply: (path: string) => void) => Promise<void> | void;
  /** Refetch /api/tracks (after version set-main/delete in the table). */
  onTracksReload?: () => void;
  onApplyOverrides: (overrides: Record<string, Partial<CatalogTrack>>) => void;
  onSelectionChange?: (ids: string[]) => void;
  selectionResetKey?: number;
  /** Track ids with AI COVER generation in flight (sparkle on row thumbs). */
  aiTrackIds?: string[];
  /** Track ids with AI TEXT generation in flight (pulse on the description). */
  aiTextIds?: string[];
  /** AI-written fields to merge into the panel (never wipes manual edits). */
  fieldsPatch?: { n: number; trackId: string; patch: { cover?: string; description?: string } } | null;
  /** Generate a cover for ONE track (hover button on the row thumbnail). */
  onGenerateCover?: (trackId: string) => void;
  /** Image model for AI covers: standard (cheap) | premium (better). */
  aiModel?: "standard" | "premium";
  onAiModelChange?: (m: "standard" | "premium") => void;
}) => {
  const player = usePlayer();

  // --- toolbar / table state ---
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("all");
  const [sort, setSort] = useState<SortMode>("default");
  // Status tabs: Live / Drafts / Review (composer uploads awaiting moderation).
  const [statusTab, setStatusTab] = useState<"live" | "drafts" | "review">("live");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);

  // Report the current selection up so the parent can show a Delete button, and
  // clear it when the parent bumps the reset key (e.g. after a delete).
  useEffect(() => {
    onSelectionChange?.(selected);
  }, [selected, onSelectionChange]);
  useEffect(() => {
    setSelected([]);
  }, [selectionResetKey]);

  // --- panel pending changes ---
  const [facetChanges, setFacetChanges] = useState<Record<FacetKey, Record<string, "all" | "none">>>({
    useCase: {},
    genre: {},
    mood: {},
  });
  const [playlistDelta, setPlaylistDelta] = useState<Record<string, "all" | "none">>({});
  const [collectionDelta, setCollectionDelta] = useState<Record<string, "all" | "none">>({});
  const [categoryDelta, setCategoryDelta] = useState<Record<string, "all" | "none">>({});
  const [trendingChange, setTrendingChange] = useState<"add" | "remove" | "none">("none");
  const [fields, setFields] = useState<SingleFields | null>(null);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const aiSet = useMemo(() => new Set(aiTrackIds), [aiTrackIds]);
  const aiTextSet = useMemo(() => new Set(aiTextIds), [aiTextIds]);

  // After AI writes cover/description into a track, merge ONLY those fields
  // into the panel — unsaved manual edits in the other fields stay untouched.
  useEffect(() => {
    if (!fieldsPatch) return;
    setFields((prev) => {
      if (!prev || selected.length !== 1 || selected[0] !== fieldsPatch.trackId) return prev;
      return {
        ...prev,
        ...(fieldsPatch.patch.cover !== undefined ? { cover: fieldsPatch.patch.cover } : {}),
        ...(fieldsPatch.patch.description !== undefined
          ? { description: fieldsPatch.patch.description }
          : {}),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsPatch?.n]);

  // ---- "Read .xlsx" — fill the SELECTED tracks from the owner's spreadsheet.
  // Fixed column layout: # / Title / BPM / Lengths / Alternative Title /
  // Style / Description / Tags. Rows are matched to the selected tracks by
  // Title OR Alternative Title; BPM / Description / Tags are written in.
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const normTitle = (v: string) =>
    v
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9а-яё]+/g, " ")
      .replace(/^[\d\s]+/, "") // "1685 as light as a feather" -> "as light as a feather"
      .trim();

  const readXlsx = async (file: File) => {
    const selectedTracks = tracks.filter((t) => selected.includes(t.id));
    if (selectedTracks.length === 0) return;
    setXlsxBusy(true);
    try {
      const grid = await parseXlsx(file);
      if (grid.length < 2) throw new Error("The sheet needs a header row and data rows");
      // Column detection by header name, falling back to the fixed layout.
      const header = grid[0].map((h) => h.toLowerCase());
      const col = (re: RegExp, fallback: number) => {
        const i = header.findIndex((h) => re.test(h));
        return i >= 0 ? i : fallback;
      };
      const cTitle = col(/^title/, 1);
      const cBpm = col(/^bpm/, 2);
      const cAlt = col(/alternative/, 4);
      const cDesc = col(/^desc/, 6);
      const cTags = col(/^tags?/, 7);

      // Index the sheet by normalized Title AND Alternative Title.
      const byName = new Map<string, string[]>();
      for (const row of grid.slice(1)) {
        for (const key of [normTitle(row[cTitle] ?? ""), normTitle(row[cAlt] ?? "")]) {
          if (key && !byName.has(key)) byName.set(key, row);
        }
      }

      // Exact match first; then a "contains" pass so "Composer_Title_v2"-style
      // track names still find their sheet row (and vice versa).
      const sheetKeys = [...byName.keys()];
      const findRow = (title: string): string[] | undefined => {
        const n = normTitle(title);
        if (!n) return undefined;
        const exact = byName.get(n);
        if (exact) return exact;
        const fuzzy = sheetKeys.find((k) => k.includes(n) || n.includes(k));
        return fuzzy ? byName.get(fuzzy) : undefined;
      };
      const matches = selectedTracks
        .map((t) => ({ t, row: findRow(t.title) }))
        .filter((m): m is { t: CatalogTrack; row: string[] } => !!m.row);
      const missed = selectedTracks.length - matches.length;
      if (matches.length === 0) {
        throw new Error("No selected track matched a Title / Alternative Title in the sheet");
      }
      if (
        !window.confirm(
          `Fill ${matches.length} selected track(s) from "${file.name}"?` +
            (missed > 0 ? `\n${missed} selected track(s) had no matching row and stay untouched.` : "") +
            `\nWrites BPM, Description and Tags (extra tags).`,
        )
      )
        return;

      let done = 0;
      const overrides: Record<string, Partial<CatalogTrack>> = {};
      for (const { t, row } of matches) {
        const fields: Record<string, unknown> = {};
        const bpm = Math.round(Number((row[cBpm] ?? "").toString().replace(/[^0-9.]/g, "")));
        if (bpm >= 20 && bpm <= 400) fields.bpm = bpm;
        const desc = (row[cDesc] ?? "").trim();
        if (desc) fields.description = desc;
        const tags = (row[cTags] ?? "")
          .split(/[,;]+/)
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 12);
        if (tags.length > 0) fields.tags = tags;
        if (Object.keys(fields).length === 0) continue;
        const res = await fetch("/api/admin/content", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "bulk_update_tracks", trackIds: [t.id], fields }),
        });
        const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !d.ok) {
          toast.error(`${t.title}: ${d.error ?? "failed"}`);
          continue;
        }
        overrides[t.id] = {
          ...(fields.bpm !== undefined ? { bpm: fields.bpm as number } : {}),
          ...(fields.description !== undefined ? { description: fields.description as string } : {}),
          ...(fields.tags !== undefined ? { tags: fields.tags as string[] } : {}),
        };
        done += 1;
      }
      if (Object.keys(overrides).length > 0) onApplyOverrides(overrides);
      toast.success(`Spreadsheet applied to ${done} track(s)` + (missed > 0 ? ` · ${missed} unmatched` : ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the .xlsx");
    } finally {
      setXlsxBusy(false);
    }
  };

  // AI description for the single selected track (uses its SAVED facets).
  const [descBusy, setDescBusy] = useState(false);
  const generateDescription = async (trackId: string) => {
    setDescBusy(true);
    try {
      const text = await generateDescriptionApi({ trackId });
      setFields((f) => (f ? { ...f, description: text } : f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setDescBusy(false);
    }
  };

  // ---- AI tagging by prompt: the owner describes the track in his own words;
  // the model reads the live vocab + collection/playlist/category titles and
  // PRE-TICKS the panel checkboxes (generous human-curator matching). Nothing
  // is saved until Apply — the owner reviews the ticks first.
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPromptBusy, setAiPromptBusy] = useState(false);
  const [aiInclude, setAiInclude] = useState({
    tags: true,
    collections: false,
    playlists: false,
    categories: false,
    extraTags: false,
    description: false,
  });
  const runAiSuggest = async () => {
    setAiPromptBusy(true);
    try {
      const res = await fetch("/api/admin/suggest-tags", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, include: aiInclude }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        useCase?: string[];
        genre?: string[];
        mood?: string[];
        collectionIds?: string[];
        playlistIds?: string[];
        categoryIds?: string[];
        extraTags?: string[];
      };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "AI suggestion failed");
      // The AI answer is AUTHORITATIVE for every included section: each new
      // generation sets the FULL picture — fitting entries get ticked, the
      // rest get UNTICKED (removed on Apply). So re-running with a new prompt
      // shows a fresh result, never the tail of the previous one.
      let n = 0;
      if (aiInclude.tags) {
        setFacetChanges((prev) => {
          const nx = { ...prev };
          for (const key of ["useCase", "genre", "mood"] as FacetKey[]) {
            const picked = new Set((d[key] ?? []).map((v) => v.toLowerCase()));
            const m: Record<string, "all" | "none"> = {};
            for (const opt of vocabularies[key]) m[opt] = picked.has(opt.toLowerCase()) ? "all" : "none";
            nx[key] = m;
          }
          return nx;
        });
        n += (d.useCase?.length ?? 0) + (d.genre?.length ?? 0) + (d.mood?.length ?? 0);
      }
      const setAuthoritative = (
        ids: string[] | undefined,
        items: ContentItemLite[],
        set: (fn: (prev: Record<string, "all" | "none">) => Record<string, "all" | "none">) => void,
      ) => {
        const picked = new Set(ids ?? []);
        set(() => {
          const m: Record<string, "all" | "none"> = {};
          for (const it of items) m[it.id] = picked.has(it.id) ? "all" : "none";
          return m;
        });
        return picked.size;
      };
      if (aiInclude.collections) n += setAuthoritative(d.collectionIds, collections, setCollectionDelta);
      if (aiInclude.playlists) n += setAuthoritative(d.playlistIds, playlists, setPlaylistDelta);
      if (aiInclude.categories) n += setAuthoritative(d.categoryIds, categories, setCategoryDelta);
      // Extra tags REPLACE the field content (fresh generation, no old tail);
      // saved by the normal Apply like everything else.
      if (aiInclude.extraTags && d.extraTags && d.extraTags.length > 0) {
        setFields((prev) => (prev ? { ...prev, tags: (d.extraTags ?? []).join(", ") } : prev));
        n += d.extraTags.length;
      }
      // Description: reuses the owner's fixed SEO prompt (generate-description)
      // fed with the track's saved facets MERGED with the freshly AI-ticked
      // ones, so the text matches what the owner is about to Apply.
      let wroteDescription = false;
      if (aiInclude.description && selTracks.length === 1) {
        const t = selTracks[0];
        try {
          const text = await generateDescriptionApi({
            useCase: [...new Set([...splitFilterValues(t.useCase), ...(d.useCase ?? [])])],
            genre: [...new Set([...splitFilterValues(t.genre), ...(d.genre ?? [])])],
            mood: [...new Set([...splitFilterValues(t.mood), ...(d.mood ?? [])])],
          });
          setFields((prev) => (prev ? { ...prev, description: text } : prev));
          wroteDescription = true;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Description generation failed");
        }
      }
      const parts: string[] = [];
      if (n > 0) parts.push(`${n} box(es) ticked`);
      if (wroteDescription) parts.push("description written");
      toast.success(
        parts.length > 0
          ? `AI: ${parts.join(" + ")} — review and press Apply`
          : "AI didn't find anything fitting",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI suggestion failed");
    } finally {
      setAiPromptBusy(false);
    }
  };

  // Solo Extra-tags generation (Generate button on the Extra tags field):
  // same endpoint, extraTags ONLY — the include checkboxes above stay as-is.
  // Uses the AI-prompt text, falling back to the track's description.
  const [tagsGenBusy, setTagsGenBusy] = useState(false);
  const generateExtraTags = async () => {
    if (!fields) return;
    const promptText = aiPrompt.trim() || fields.description.trim();
    if (!promptText) {
      toast.error("Write a prompt in the AI box above (or a description) first");
      return;
    }
    setTagsGenBusy(true);
    try {
      const res = await fetch("/api/admin/suggest-tags", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: promptText, include: { tags: false, extraTags: true } }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        extraTags?: string[];
      };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Tag generation failed");
      const got = d.extraTags?.length ?? 0;
      if (got === 0) {
        toast.error("The AI picked nothing — is the Tags Base filled?");
        return;
      }
      // Replace, don't merge — a re-run shows the fresh pick, not the old tail.
      setFields((prev) => (prev ? { ...prev, tags: (d.extraTags ?? []).join(", ") } : prev));
      toast.success(`${got} extra tag(s) suggested — review and press Apply`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tag generation failed");
    } finally {
      setTagsGenBusy(false);
    }
  };

  // ---- Tags Base: global comma-separated tag list (stored in site_config) —
  // the AI prompt-tagging picks a track's Extra tags ONLY from here. The
  // button replaces the legacy "Upload stems ZIP" (stems now arrive as plain
  // audio files through Bulk Upload).
  const [tagsBaseOpen, setTagsBaseOpen] = useState(false);
  const [tagsBaseText, setTagsBaseText] = useState("");
  const [tagsBaseBusy, setTagsBaseBusy] = useState(false);
  const openTagsBase = async () => {
    setTagsBaseOpen(true);
    setTagsBaseBusy(true);
    try {
      const res = await fetch("/api/admin/content", { credentials: "include" });
      const d = (await res.json().catch(() => ({}))) as { tagsBase?: string[] };
      setTagsBaseText((d.tagsBase ?? []).join(", "));
    } catch {
      // dialog opens empty — saving overwrites
    } finally {
      setTagsBaseBusy(false);
    }
  };
  const saveTagsBase = async () => {
    setTagsBaseBusy(true);
    const values = tagsBaseText.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    const ok = await run({ action: "set_tags_base", values }, "Tags Base saved");
    setTagsBaseBusy(false);
    if (ok) setTagsBaseOpen(false);
  };

  const composers = useMemo(
    () => [...new Set(tracks.map((t) => t.artist).filter(Boolean))].sort(),
    [tracks],
  );

  // Three buckets: Review = composer uploads awaiting moderation, Drafts =
  // unpublished (bulk uploads etc.), Live = everything published & approved.
  const bucketOf = (t: CatalogTrack): "live" | "drafts" | "review" =>
    t.moderation === "pending" ? "review" : t.status === "draft" ? "drafts" : "live";
  const counts = useMemo(() => {
    const c = { live: 0, drafts: 0, review: 0 };
    for (const t of tracks) c[bucketOf(t)] += 1;
    return c;
  }, [tracks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tracks.filter(
      (t) =>
        bucketOf(t) === statusTab &&
        (composer === "all" || t.artist === composer) &&
        (!q || t.title.toLowerCase().includes(q)),
    );
    if (sort === "trending") {
      const set = new Set(trending);
      list = [...list].sort((a, b) => (set.has(b.id) ? 1 : 0) - (set.has(a.id) ? 1 : 0));
    }
    return list;
  }, [tracks, search, composer, sort, trending, statusTab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selTracks = useMemo(() => tracks.filter((t) => selectedSet.has(t.id)), [tracks, selectedSet]);

  // Reset pending changes whenever the selection itself changes.
  const selectionKey = selected.join("|");
  useEffect(() => {
    setFacetChanges({ useCase: {}, genre: {}, mood: {} });
    setPlaylistDelta({});
    setCollectionDelta({});
    setCategoryDelta({});
    setTrendingChange("none");
    if (selected.length === 1) {
      const t = tracks.find((x) => x.id === selected[0]);
      setFields(t ? fieldsOf(t) : null);
    } else {
      setFields(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  // --- tri-state helpers ---
  const facetBase = (key: FacetKey, option: string): TriState => {
    let has = 0;
    for (const t of selTracks) if (splitFilterValues(facetValue(t, key)).includes(option)) has++;
    return has === 0 ? "none" : has === selTracks.length ? "all" : "mixed";
  };
  const memberBase = (item: ContentItemLite): TriState => {
    let has = 0;
    for (const t of selTracks) if (item.trackIds.includes(t.id)) has++;
    return has === 0 ? "none" : has === selTracks.length ? "all" : "mixed";
  };
  const nextState = (display: TriState): "all" | "none" => (display === "none" ? "all" : "none");

  const facetDisplay = (key: FacetKey, option: string): TriState =>
    facetChanges[key][option] ?? facetBase(key, option);
  const toggleFacet = (key: FacetKey, option: string) =>
    setFacetChanges((prev) => ({
      ...prev,
      [key]: { ...prev[key], [option]: nextState(facetDisplay(key, option)) },
    }));

  const memberDisplay = (delta: Record<string, "all" | "none">, item: ContentItemLite): TriState =>
    delta[item.id] ?? memberBase(item);

  const fieldsDirty =
    fields !== null &&
    selTracks.length === 1 &&
    (fields.title !== selTracks[0].title ||
      fields.bpm !== (selTracks[0].bpm ? String(selTracks[0].bpm) : "") ||
      fields.description !== selTracks[0].description ||
      fields.cover !== (selTracks[0].cover ?? "") ||
      fields.tags !== selTracks[0].tags.join(", ") ||
      fields.hasStems !== (selTracks[0].hasStems ?? false));

  const dirty =
    trendingChange !== "none" ||
    Object.values(facetChanges).some((m) => Object.keys(m).length > 0) ||
    Object.keys(playlistDelta).length > 0 ||
    Object.keys(collectionDelta).length > 0 ||
    Object.keys(categoryDelta).length > 0 ||
    fieldsDirty;

  const resetChanges = () => {
    setFacetChanges({ useCase: {}, genre: {}, mood: {} });
    setPlaylistDelta({});
    setCollectionDelta({});
    setCategoryDelta({});
    setTrendingChange("none");
    if (selTracks.length === 1) setFields(fieldsOf(selTracks[0]));
  };

  const applyChanges = async () => {
    const toAddRemove = (m: Record<string, "all" | "none">) => ({
      add: Object.keys(m).filter((k) => m[k] === "all"),
      remove: Object.keys(m).filter((k) => m[k] === "none"),
    });
    const facets: Record<string, { add: string[]; remove: string[] }> = {};
    for (const { key } of FACETS) {
      const ar = toAddRemove(facetChanges[key]);
      if (ar.add.length || ar.remove.length) facets[key] = ar;
    }
    const playlistChanges = toAddRemove(playlistDelta);
    const collectionChanges = toAddRemove(collectionDelta);
    const categoryChanges = toAddRemove(categoryDelta);
    const hasChanges = (c: { add: string[]; remove: string[] }) => c.add.length || c.remove.length;

    const singleFields =
      fields && selTracks.length === 1 && fieldsDirty
        ? {
            title: fields.title,
            bpm: fields.bpm ? Number(fields.bpm) : undefined,
            description: fields.description,
            cover: fields.cover,
            tags: fields.tags.split(",").map((s) => s.trim()).filter(Boolean),
            hasStems: fields.hasStems,
          }
        : undefined;

    const ok = await run(
      {
        action: "bulk_update_tracks",
        trackIds: selected,
        facets: Object.keys(facets).length ? facets : undefined,
        playlistChanges: hasChanges(playlistChanges) ? playlistChanges : undefined,
        collectionChanges: hasChanges(collectionChanges) ? collectionChanges : undefined,
        categoryChanges: hasChanges(categoryChanges) ? categoryChanges : undefined,
        trendingChange: trendingChange === "none" ? undefined : trendingChange,
        fields: singleFields,
      },
      selected.length === 1 ? "Track updated" : `${selected.length} tracks updated`,
    );
    if (!ok) return;

    // Mirror the server result locally (facets + single fields + categories)
    // so the table updates without refetching /api/tracks. Collections /
    // playlists / trending refresh via the parent reload().
    const overrides: Record<string, Partial<CatalogTrack>> = {};
    for (const t of selTracks) {
      const o: Partial<CatalogTrack> = {};
      for (const { key } of FACETS) {
        const m = facetChanges[key];
        if (Object.keys(m).length === 0) continue;
        let vals = splitFilterValues(facetValue(t, key)).filter((v) => m[v] !== "none");
        for (const opt of Object.keys(m)) if (m[opt] === "all" && !vals.includes(opt)) vals = [...vals, opt];
        const joined = vals.join(" / ");
        if (key === "useCase") o.useCase = joined;
        else if (key === "genre") o.genre = joined;
        else o.mood = joined;
      }
      if (hasChanges(categoryChanges)) {
        const current = t.categoryIds && t.categoryIds.length > 0 ? t.categoryIds : [t.category];
        let next = current.filter((c) => !categoryChanges.remove.includes(c));
        for (const c of categoryChanges.add) if (!next.includes(c)) next = [...next, c];
        o.categoryIds = next;
      }
      if (singleFields) {
        if (singleFields.title.trim()) o.title = singleFields.title.trim();
        if (singleFields.bpm !== undefined) o.bpm = singleFields.bpm;
        o.description = singleFields.description;
        o.cover = singleFields.cover || undefined;
        o.tags = singleFields.tags;
        o.hasStems = singleFields.hasStems;
      }
      if (Object.keys(o).length > 0) overrides[t.id] = o;
    }
    if (Object.keys(overrides).length > 0) onApplyOverrides(overrides);
    setFacetChanges({ useCase: {}, genre: {}, mood: {} });
    setPlaylistDelta({});
    setCollectionDelta({});
    setCategoryDelta({});
    setTrendingChange("none");
  };

  // --- selection ---
  const toggleTrack = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // --- per-row versions expander (view / set main / rename / delete) ---
  const [versionsOpenId, setVersionsOpenId] = useState<string | null>(null);
  const [versionBusy, setVersionBusy] = useState<string | null>(null);
  const [versionRenaming, setVersionRenaming] = useState<string | null>(null); // `${trackId}:${versionId}`
  const [versionDraft, setVersionDraft] = useState("");

  const renameVersion = async (t: CatalogTrack, versionId: string, oldLabel: string) => {
    const label = versionDraft.trim();
    setVersionRenaming(null);
    if (!label || label === oldLabel) return;
    setVersionBusy(`${t.id}:${versionId}`);
    try {
      // Rename the matching WAV inside the master bundle too — customer WAV
      // downloads must carry the new name, not just the MP3 previews.
      let wavZipKey: string | undefined;
      try {
        wavZipKey = (await renameWavInBundle(t.id, t.title, oldLabel, label)) ?? undefined;
      } catch {
        toast("WAV bundle unchanged", {
          description: "Couldn't rename this version's file inside the zip.",
        });
      }
      const ok = await run(
        { action: "rename_version", id: t.id, versionId, label, wavZipKey },
        "Version renamed",
      );
      if (ok) onTracksReload?.();
    } finally {
      setVersionBusy(null);
    }
  };

  const setMainVersion = async (t: CatalogTrack, versionId: string, label: string) => {
    setVersionBusy(`${t.id}:${versionId}`);
    const ok = await run(
      { action: "set_main_version", id: t.id, versionId },
      `"${label}" is now the Main version`,
    );
    setVersionBusy(null);
    if (ok) onTracksReload?.();
  };

  const deleteVersion = async (t: CatalogTrack, versionId: string, label: string) => {
    if (!window.confirm(`Delete version "${label}" of "${t.title}"?`)) return;
    setVersionBusy(`${t.id}:${versionId}`);
    const ok = await run({ action: "delete_version", id: t.id, versionId }, "Version deleted");
    setVersionBusy(null);
    if (ok) onTracksReload?.();
  };

  const deleteStems = async (t: CatalogTrack) => {
    if (!window.confirm(`Remove the stems bundle from "${t.title}"? The STEMS download option disappears.`)) return;
    setVersionBusy(`${t.id}:stems`);
    const ok = await run(
      { action: "bulk_update_tracks", trackIds: [t.id], fields: { clearStems: true } },
      "Stems removed",
    );
    setVersionBusy(null);
    if (ok) {
      onApplyOverrides({ [t.id]: { hasStems: false } });
      onTracksReload?.();
    }
  };

  // Per-row Trending toggle — persists immediately; the parent reload refreshes
  // the `trending` list.
  const trendingSet = new Set(trending);
  const toggleTrending = (id: string) => {
    if (disabled || busy) return;
    const isOn = trendingSet.has(id);
    void run(
      { action: "bulk_update_tracks", trackIds: [id], trendingChange: isOn ? "remove" : "add" },
      isOn ? "Removed from Trending" : "Added to Trending",
    );
  };
  // Header checkbox = only the rows visible on the CURRENT page.
  const pageState: TriState = (() => {
    const n = paged.filter((t) => selectedSet.has(t.id)).length;
    return n === 0 ? "none" : n === paged.length && paged.length > 0 ? "all" : "mixed";
  })();
  const togglePage = () => {
    if (pageState === "all") {
      const pageIds = new Set(paged.map((t) => t.id));
      setSelected((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...paged.map((t) => t.id)])]);
    }
  };

  const versionProgress = (track: CatalogTrack, versionId: string) => {
    const isActive =
      player.activePlayer?.trackId === track.id && player.activePlayer.versionId === versionId;
    if (isActive) return player.progress;
    return player.playedProgress[`${track.id}:${versionId}`] ?? 0;
  };

  const membershipSection = (
    title: string,
    items: ContentItemLite[],
    delta: Record<string, "all" | "none">,
    setDelta: (updater: (prev: Record<string, "all" | "none">) => Record<string, "all" | "none">) => void,
    searchValue?: string,
    setSearchValue?: (v: string) => void,
  ) => (
    <div className="border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
      <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {setSearchValue && items.length > 6 && (
        <input
          placeholder={`Search ${title.toLowerCase()}...`}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className={`${inputCls} mb-2 w-full py-1.5 text-xs`}
        />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,max-content))] gap-x-5 gap-y-1">
        {items
          .filter((i) => !searchValue || i.title.toLowerCase().includes(searchValue.toLowerCase()))
          .map((item) => (
            <TriCheckbox
              key={item.id}
              label={item.title}
              state={memberDisplay(delta, item)}
              onToggle={() =>
                setDelta((prev) => ({ ...prev, [item.id]: nextState(memberDisplay(delta, item)) }))
              }
            />
          ))}
        {items.length === 0 && (
          <p className="col-span-full font-body text-xs text-muted-foreground">None yet.</p>
        )}
      </div>
    </div>
  );

  const hasSelection = selTracks.length > 0;
  const single = selTracks.length === 1;

  // Track-page-style layout, owner's order (left → right): table · track
  // details · Tags · Add to. Every panel is ALWAYS visible; panels that don't
  // apply to the current selection are dimmed instead of hidden.
  const panelColCls =
    "flex flex-col gap-4 rounded-xl border border-[#F4C430]/30 bg-card p-4 transition-opacity xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto";
  const dimIf = (active: boolean) => (active ? "" : "pointer-events-none opacity-40");

  return (
    <>
      {/* ===== Toolbar (above the grid so the table header row lines up with
          the top edge of the side panels) ===== */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Status tabs: Live / Drafts / Review (with totals) */}
        <div className="flex w-fit gap-1 rounded-lg border border-border/60 bg-background/40 p-1">
          {(
            [
              ["live", "Live", counts.live],
              ["drafts", "Drafts", counts.drafts],
              ["review", "Review", counts.review],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setStatusTab(id);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
                statusTab === id
                  ? "bg-secondary text-[#F4C430]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label} <span className="opacity-60">({n})</span>
            </button>
          ))}
        </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search tracks..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={`${inputCls} w-52 pl-9`}
            />
          </div>
          <select
            value={composer}
            onChange={(e) => {
              setComposer(e.target.value);
              setPage(1);
            }}
            className={inputCls}
            aria-label="Filter by composer"
          >
            <option value="all">All Composers</option>
            {composers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {onAiModelChange && (
            <select
              value={aiModel}
              onChange={(e) => onAiModelChange(e.target.value as "standard" | "premium")}
              aria-label="AI image model"
              title="Model used for AI cover generation: Standard is cheaper, Premium looks better"
              className={inputCls}
            >
              <option value="standard">AI images: Standard</option>
              <option value="premium">AI images: Premium</option>
            </select>
          )}

          {/* Selection cluster: one Apply saves the side panels + the fields panel. */}
          {hasSelection && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected([])}
                className="inline-flex items-center gap-1 font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                {selected.length} selected
              </button>
              {/* Fill the selected tracks from the owner's spreadsheet
                  (# / Title / BPM / Lengths / Alt Title / Style / Description / Tags). */}
              <label
                className={`${btnCls} cursor-pointer ${xlsxBusy || busy ? "pointer-events-none opacity-50" : ""}`}
                title="Match the selected tracks by Title / Alternative Title and write BPM, Description and Tags from the sheet"
              >
                {xlsxBusy ? "Reading…" : "Read .xlsx"}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readXlsx(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button type="button" disabled={!dirty || busy} onClick={resetChanges} className={btnCls}>
                Reset
              </button>
              <button
                type="button"
                disabled={!dirty || busy || disabled}
                onClick={() => void applyChanges()}
                className={goldBtnCls}
              >
                {busy ? "Applying..." : "Apply Changes"}
              </button>
            </div>
          )}
      </div>

      {disabled && (
        <p className="mt-3 font-body text-sm text-amber-400/90">
          The catalog is still served from bundled mock data — load the demo catalog into the
          database first, then edits here will stick.
        </p>
      )}

    <div className="mt-4 items-start gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_21rem_16rem_16rem]">
      {/* ===== Left: table + pagination ===== */}
      <div className="min-w-0">
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <div className="min-w-[44rem]">
            <div className="grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_4.5rem_7rem_4.5rem_5rem] items-center gap-2 border-b border-border/60 bg-secondary/40 px-3 py-2.5">
              <span className="flex justify-center">
                <RowCheckbox state={pageState} onToggle={togglePage} label="Select all visible" />
              </span>
              <span />
              <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">Track</span>
              <span className="text-center font-body text-xs uppercase tracking-wide text-muted-foreground">Ver.</span>
              <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">Composer</span>
              <button
                type="button"
                onClick={() => setSort((s) => (s === "trending" ? "default" : "trending"))}
                title="Sort by trending"
                className={`text-center font-body text-xs uppercase tracking-wide transition-colors hover:text-[#F4C430] ${
                  sort === "trending" ? "text-[#F4C430]" : "text-muted-foreground"
                }`}
              >
                Trending
              </button>
              <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">Duration</span>
            </div>

            {paged.map((t) => {
              const version = t.audioVersions[0];
              const active =
                player.activePlayer?.trackId === t.id &&
                player.activePlayer.versionId === version?.id &&
                player.isPlaying;
              const isSelected = selectedSet.has(t.id);
              const versionsOpen = versionsOpenId === t.id;
              return (
                <div key={t.id} className="border-b border-border/40 last:border-b-0">
                <div
                  className={`grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_4.5rem_7rem_4.5rem_5rem] items-center gap-2 px-3 py-2 transition-colors ${
                    isSelected ? "bg-[#F4C430]/[0.06]" : "hover:bg-foreground/[0.03]"
                  }`}
                >
                  <span className="flex justify-center">
                    <RowCheckbox
                      state={isSelected ? "all" : "none"}
                      onToggle={() => toggleTrack(t.id)}
                      label={`Select ${t.title}`}
                    />
                  </span>
                  <button
                    type="button"
                    aria-label={active ? `Pause ${t.title}` : `Play ${t.title}`}
                    onClick={() => version && player.playVersion(t, version)}
                    className={`flex h-8 w-8 items-center justify-center justify-self-center rounded-full border transition-colors ${
                      active
                        ? "border-[#F4C430] text-[#F4C430]"
                        : "border-border/70 text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                    }`}
                  >
                    {active ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                  </button>

                  <div className="flex min-w-0 items-center gap-3">
                    <span className="group/aithumb relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-secondary">
                      {t.cover ? (
                        <img src={t.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <Music className="h-4 w-4 text-muted-foreground/70" />
                      )}
                      {aiSet.has(t.id) ? (
                        /* AI in flight for this row — sparkle over the thumb. */
                        <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                          <Sparkles className="h-4 w-4 animate-pulse text-[#F4C430]" />
                        </span>
                      ) : (
                        onGenerateCover && (
                          <button
                            type="button"
                            onClick={() => onGenerateCover(t.id)}
                            title="Generate AI cover for this track (needs Usage, Genre & Mood)"
                            aria-label={`Generate cover for ${t.title}`}
                            className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity hover:opacity-100 group-hover/aithumb:opacity-100"
                          >
                            <Sparkles className="h-4 w-4 text-[#F4C430]" />
                          </button>
                        )
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/track/${t.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open track page in a new tab"
                        className={`group/title inline-flex max-w-full items-center gap-1 truncate font-body text-sm font-medium transition-colors hover:text-[#F4C430] ${
                          active ? "text-[#F4C430]" : "text-foreground"
                        }`}
                      >
                        <span className="truncate">{t.title}</span>
                        {t.moderation === "pending" && (
                          <span className="shrink-0 rounded border border-orange-400/60 bg-orange-400/10 px-1 py-px font-body text-[9px] font-bold uppercase tracking-wide text-orange-400">
                            Review
                          </span>
                        )}
                        {t.status === "draft" && t.moderation !== "pending" && (
                          <span className="shrink-0 rounded border border-amber-400/50 bg-amber-400/10 px-1 py-px font-body text-[9px] font-bold uppercase tracking-wide text-amber-400">
                            Draft
                          </span>
                        )}
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/title:opacity-70" />
                      </Link>
                      {version && (
                        <WaveformPreview
                          active={active}
                          bars={200}
                          durationRatio={1}
                          onSeek={(p) => player.playVersion(t, version, p)}
                          progress={versionProgress(t, version.id)}
                          src={version.src}
                          className="mt-0.5 hidden h-5 max-w-[14rem] md:block lg:max-w-[24rem]"
                        />
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setVersionsOpenId(versionsOpen ? null : t.id)}
                    title={t.hasStems ? "Versions + stems bundle" : "Show versions"}
                    aria-label={`${t.audioVersions.length} versions of ${t.title}`}
                    className={`justify-self-center whitespace-nowrap rounded-md border px-2 py-0.5 font-body text-xs tabular-nums transition-colors ${
                      versionsOpen
                        ? "border-[#F4C430] text-[#F4C430]"
                        : "border-border/60 text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                    }`}
                  >
                    ×{t.audioVersions.length}
                    {t.hasStems && <span className="ml-0.5 font-bold text-[#F4C430]">+S</span>}
                  </button>
                  <span className="truncate font-body text-xs text-muted-foreground">{t.artist}</span>
                  <span className="flex justify-center">
                    <RowCheckbox
                      state={trendingSet.has(t.id) ? "all" : "none"}
                      onToggle={() => toggleTrending(t.id)}
                      label={`Toggle trending: ${t.title}`}
                    />
                  </span>
                  <span className="font-body text-xs tabular-nums text-muted-foreground">{t.duration}</span>
                </div>

                {/* Versions expander: ★ set Main · play · delete. Add/rename +
                    WAV-bundle rebuild live on the track page's admin panel. */}
                {versionsOpen && (
                  <div className="border-t border-border/30 bg-background/40 px-4 py-2.5 pl-[5.5rem]">
                    {t.audioVersions.map((v, vi) => {
                      const vActive =
                        player.activePlayer?.trackId === t.id &&
                        player.activePlayer.versionId === v.id &&
                        player.isPlaying;
                      const vBusy = versionBusy === `${t.id}:${v.id}`;
                      return (
                        <div
                          key={v.id}
                          className={`flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5 ${vBusy ? "opacity-50" : ""}`}
                        >
                          <button
                            type="button"
                            disabled={vi === 0 || vBusy || busy}
                            onClick={() => void setMainVersion(t, v.id, v.label)}
                            title={vi === 0 ? "Main version" : "Make this the Main version"}
                            aria-label={vi === 0 ? "Main version" : `Make ${v.label} the main version`}
                            className="shrink-0 disabled:cursor-default"
                          >
                            <Star
                              className="h-3 w-3"
                              style={vi === 0 ? { color: "#F4C430", fill: "#F4C430" } : { color: "#666" }}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => player.playVersion(t, v)}
                            aria-label={vActive ? `Pause ${v.label}` : `Play ${v.label}`}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430]"
                          >
                            {vActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </button>
                          {versionRenaming === `${t.id}:${v.id}` ? (
                            <input
                              autoFocus
                              value={versionDraft}
                              onChange={(e) => setVersionDraft(e.target.value)}
                              onBlur={() => void renameVersion(t, v.id, v.label)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void renameVersion(t, v.id, v.label);
                                if (e.key === "Escape") setVersionRenaming(null);
                              }}
                              className="min-w-0 flex-1 rounded border border-[#F4C430]/60 bg-background px-1 py-0.5 font-body text-xs text-foreground focus:outline-none"
                            />
                          ) : (
                            <span
                              onDoubleClick={() => {
                                setVersionDraft(v.label);
                                setVersionRenaming(`${t.id}:${v.id}`);
                              }}
                              title="Double-click to rename"
                              className={`min-w-0 flex-1 cursor-text truncate font-body text-xs ${vActive ? "text-[#F4C430]" : "text-foreground"}`}
                            >
                              {v.label}
                            </span>
                          )}
                          <span className="shrink-0 font-body text-[10px] tabular-nums text-muted-foreground">
                            {v.duration}
                          </span>
                          <button
                            type="button"
                            disabled={vi === 0 || t.audioVersions.length <= 1 || vBusy || busy}
                            onClick={() => void deleteVersion(t, v.id, v.label)}
                            title={vi === 0 ? "Main can't be deleted — star another version first" : "Delete version"}
                            aria-label={`Delete ${v.label}`}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-30"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                    {t.hasStems && (
                      <div
                        className={`mt-1 flex items-center gap-2 rounded border-t border-border/30 px-1 py-1 ${
                          versionBusy === `${t.id}:stems` ? "opacity-50" : ""
                        }`}
                      >
                        <span className="shrink-0 rounded border border-[#F4C430]/60 bg-[#F4C430]/10 px-1.5 py-px font-body text-[9px] font-bold uppercase tracking-wide text-[#F4C430]">
                          Stems
                        </span>
                        <span className="min-w-0 flex-1 truncate font-body text-xs text-muted-foreground">
                          Stems ZIP attached (Max / license download)
                        </span>
                        <button
                          type="button"
                          disabled={versionBusy === `${t.id}:stems` || busy}
                          onClick={() => void deleteStems(t)}
                          title="Remove the stems bundle"
                          aria-label={`Remove stems from ${t.title}`}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-30"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <p className="mt-1 font-body text-[10px] text-muted-foreground">
                      Add / rename versions (and WAV-bundle rebuild) — on the{" "}
                      <Link to={`/track/${t.slug}`} target="_blank" rel="noopener noreferrer" className="text-[#F4C430] hover:underline">
                        track page
                      </Link>
                      .
                    </p>
                  </div>
                )}
                </div>
              );
            })}
            {paged.length === 0 && (
              <p className="px-4 py-6 font-body text-sm text-muted-foreground">No tracks match.</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-body text-xs text-muted-foreground">
            Show
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(1);
              }}
              className={`${inputCls} py-1.5`}
            >
              {[20, 50, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            per page
          </label>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                className={`${btnCls} px-2`}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`rounded-lg px-2.5 py-1.5 font-body text-xs transition-colors ${
                    n === safePage
                      ? "border border-[#F4C430] text-[#F4C430]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
                className={`${btnCls} px-2`}
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <span className="ml-auto font-body text-xs text-muted-foreground">
            {filtered.length === 0
              ? "0 tracks"
              : `${(safePage - 1) * perPage + 1}–${Math.min(safePage * perPage, filtered.length)} of ${filtered.length} tracks`}
          </span>
        </div>
      </div>

      {/* ===== Track details: title/BPM/description/tags/cover/stems (single) ===== */}
      <aside
        className={`mt-6 flex flex-col rounded-xl border border-[#F4C430]/30 bg-card transition-opacity xl:sticky xl:top-24 xl:mt-0 xl:max-h-[calc(100vh-7rem)] ${dimIf(
          single,
        )}`}
      >
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3.5">
            <h3 className="truncate font-body text-sm font-semibold text-foreground">
              {single ? selTracks[0].title : "Track details"}
            </h3>
            {single && (
              <Link
                to={`/track/${selTracks[0].slug}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open track page"
                className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {!(single && fields) && (
                <p className="font-body text-xs text-muted-foreground">
                  Select exactly one track to edit its title, BPM, description, tags, cover and
                  stems here.
                </p>
              )}
              {single && (
                <div className="mb-4 rounded-lg border border-[#F4C430]/30 bg-[#F4C430]/[0.04] p-3">
                  <p className="flex items-center gap-1.5 font-body text-xs font-semibold text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-[#F4C430]" />
                    AI tagging by prompt
                  </p>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={3}
                    placeholder='Describe the track in your own words — e.g. "gentle guitars, warm, good for travel videos"'
                    className={`${inputCls} mt-2 w-full resize-y`}
                  />
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <TriCheckbox
                      label="Tags (Usage/Mood/Genre)"
                      state={aiInclude.tags ? "all" : "none"}
                      onToggle={() => setAiInclude((p) => ({ ...p, tags: !p.tags }))}
                    />
                    <TriCheckbox
                      label="Collections"
                      state={aiInclude.collections ? "all" : "none"}
                      onToggle={() => setAiInclude((p) => ({ ...p, collections: !p.collections }))}
                    />
                    <TriCheckbox
                      label="Playlists"
                      state={aiInclude.playlists ? "all" : "none"}
                      onToggle={() => setAiInclude((p) => ({ ...p, playlists: !p.playlists }))}
                    />
                    <TriCheckbox
                      label="Categories"
                      state={aiInclude.categories ? "all" : "none"}
                      onToggle={() => setAiInclude((p) => ({ ...p, categories: !p.categories }))}
                    />
                    <TriCheckbox
                      label="Extra tags (from Tags Base)"
                      state={aiInclude.extraTags ? "all" : "none"}
                      onToggle={() => setAiInclude((p) => ({ ...p, extraTags: !p.extraTags }))}
                    />
                    <TriCheckbox
                      label="Description"
                      state={aiInclude.description ? "all" : "none"}
                      onToggle={() => setAiInclude((p) => ({ ...p, description: !p.description }))}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={
                        aiPromptBusy ||
                        !aiPrompt.trim() ||
                        !(
                          aiInclude.tags ||
                          aiInclude.collections ||
                          aiInclude.playlists ||
                          aiInclude.categories ||
                          aiInclude.extraTags ||
                          aiInclude.description
                        )
                      }
                      onClick={() => void runAiSuggest()}
                      className={`${goldBtnCls} px-3 py-1.5 text-xs`}
                    >
                      {aiPromptBusy ? "Thinking…" : "AI Magic"}
                    </button>
                    <span className="font-body text-[10px] leading-tight text-muted-foreground">
                      Sets the panels on the right (also unticks what doesn't fit) — review, then
                      press Apply.
                    </span>
                  </div>
                </div>
              )}
              {fields && selTracks.length === 1 && (
                <div className="flex flex-col gap-2.5">
                  <input
                    placeholder="Title"
                    value={fields.title}
                    onChange={(e) => setFields({ ...fields, title: e.target.value })}
                    className={inputCls}
                  />
                  <label className="flex items-center gap-2 font-body text-xs text-muted-foreground">
                    BPM
                    <input
                      placeholder="—"
                      inputMode="numeric"
                      value={fields.bpm}
                      onChange={(e) => setFields({ ...fields, bpm: e.target.value.replace(/[^0-9]/g, "") })}
                      className={`${inputCls} w-24`}
                    />
                  </label>
                  {(() => {
                    // Only TEXT generation animates/locks the description —
                    // cover-only generation must not touch this field.
                    const aiWriting = aiTextSet.has(selTracks[0].id);
                    return (
                      <div className="relative">
                        <textarea
                          placeholder="Description"
                          rows={5}
                          value={fields.description}
                          disabled={aiWriting}
                          onChange={(e) => setFields({ ...fields, description: e.target.value })}
                          className={`${inputCls} w-full ${
                            aiWriting ? "animate-pulse border-[#F4C430]/60" : ""
                          }`}
                        />
                        {/* AI description from the track's SAVED facets (owner's SEO prompt). */}
                        <button
                          type="button"
                          disabled={descBusy || busy || aiWriting}
                          onClick={() => void generateDescription(selTracks[0].id)}
                          title="Generate an SEO description from this track's saved Use Case / Genre / Mood"
                          className="absolute bottom-2.5 right-2 inline-flex items-center gap-1 rounded-md border border-[#F4C430]/50 bg-card px-2 py-1 font-body text-[11px] font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background disabled:opacity-40"
                        >
                          <Sparkles
                            className={`h-3 w-3 ${descBusy || aiWriting ? "animate-pulse" : ""}`}
                          />
                          {descBusy || aiWriting ? "Writing…" : "Generate"}
                        </button>
                      </div>
                    );
                  })()}
                  <div className="relative">
                    <textarea
                      placeholder="Extra tags, comma separated (epic, hybrid, rise…)"
                      rows={4}
                      value={fields.tags}
                      onChange={(e) => setFields({ ...fields, tags: e.target.value })}
                      className={`${inputCls} w-full ${tagsGenBusy ? "animate-pulse border-[#F4C430]/60" : ""}`}
                    />
                    {/* Solo AI pick from the Tags Base — ignores the include checkboxes. */}
                    <button
                      type="button"
                      disabled={tagsGenBusy || busy}
                      onClick={() => void generateExtraTags()}
                      title="Pick 30-50 tags from the Tags Base (uses the AI prompt above, or the description)"
                      className="absolute bottom-2.5 right-2 inline-flex items-center gap-1 rounded-md border border-[#F4C430]/50 bg-card px-2 py-1 font-body text-[11px] font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background disabled:opacity-40"
                    >
                      <Sparkles className={`h-3 w-3 ${tagsGenBusy ? "animate-pulse" : ""}`} />
                      {tagsGenBusy ? "Picking…" : "Generate"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-secondary">
                      {fields.cover ? (
                        <img src={fields.cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Music className="h-4 w-4 text-muted-foreground/70" />
                      )}
                    </span>
                    <input
                      placeholder="Cover URL (1000x1000)"
                      value={fields.cover}
                      onChange={(e) => setFields({ ...fields, cover: e.target.value })}
                      className={`${inputCls} min-w-0 flex-1`}
                    />
                    <label
                      className={`${btnCls} flex shrink-0 cursor-pointer items-center whitespace-nowrap ${
                        uploading ? "pointer-events-none opacity-60" : ""
                      }`}
                    >
                      {uploading ? "..." : "Upload"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            void uploadCover(f, (path) =>
                              setFields((prev) => (prev ? { ...prev, cover: path } : prev)),
                            );
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {/* The stems badge is automatic now: it follows the actual stems
                      bundle on the track (upload adds it, deleting stems removes it). */}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void openTagsBase()} className={btnCls}>
                      Tags Base…
                    </button>
                    <span className="font-body text-[11px] text-muted-foreground">
                      Global tag list the AI picks Extra tags from
                    </span>
                  </div>
                </div>
              )}

            </div>
      </aside>

      {/* ===== Tags: Use Case / Genre / Mood (any selection) ===== */}
      <aside className={`${panelColCls} ${dimIf(hasSelection)}`}>
        <p className="font-body text-[10px] font-bold uppercase tracking-[0.24em] text-[#F4C430]">
          Tags{selTracks.length > 1 ? ` · ${selTracks.length} tracks` : ""}
        </p>
        {FACETS.map(({ key, label }) => (
          <div key={key} className="border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
            <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,max-content))] gap-x-5 gap-y-1">
              {vocabularies[key].map((opt) => (
                <TriCheckbox
                  key={opt}
                  label={opt}
                  state={facetDisplay(key, opt)}
                  onToggle={() => toggleFacet(key, opt)}
                />
              ))}
            </div>
          </div>
        ))}
      </aside>

      {/* ===== Add to: collections / playlists / categories (any selection) ===== */}
      <aside className={`${panelColCls} ${dimIf(hasSelection)}`}>
        <p className="font-body text-[10px] font-bold uppercase tracking-[0.24em] text-[#F4C430]">
          Add to
        </p>
        {membershipSection("Collections", collections, collectionDelta, setCollectionDelta)}
        {membershipSection("Playlists", playlists, playlistDelta, setPlaylistDelta, playlistSearch, setPlaylistSearch)}
        {membershipSection("Categories", categories, categoryDelta, setCategoryDelta)}
      </aside>
    </div>

    {/* ===== Tags Base dialog: the global Extra-tags pool (comma list) ===== */}
    {tagsBaseOpen && (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      >
        <div className="w-full max-w-xl rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-body text-sm font-semibold text-foreground">Tags Base</h3>
            <button
              type="button"
              onClick={() => setTagsBaseOpen(false)}
              aria-label="Close"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 font-body text-xs text-muted-foreground">
            Comma-separated global tag list. "AI tagging by prompt" picks a track's Extra tags
            only from here (a track holds up to 50 tags).
          </p>
          <textarea
            value={tagsBaseText}
            onChange={(e) => setTagsBaseText(e.target.value)}
            rows={8}
            disabled={tagsBaseBusy}
            placeholder="cinematic, epic drums, uplifting, travel, drone footage, workout, …"
            className={`${inputCls} mt-3 w-full resize-y`}
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setTagsBaseOpen(false)} className={btnCls}>
              Cancel
            </button>
            <button
              type="button"
              disabled={tagsBaseBusy}
              onClick={() => void saveTagsBase()}
              className={goldBtnCls}
            >
              {tagsBaseBusy ? "…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default AdminTracksEdit;
