import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, ExternalLink, GripVertical, Loader2, Minus, Music, Pause, Play, Search, Sparkles, Star, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import WaveformPreview from "@/components/WaveformPreview";
import { generateDescriptionApi } from "@/lib/coverArt";
import { renameWavInBundle } from "@/lib/wavBundle";
import { decodeAudio, encodeMp3, formatDuration, wavToMp3Pair } from "@/lib/audioEncoding";
import { crc32File } from "@/lib/crc32";
import { cleanVersionLabel } from "@/lib/downloadTrack";
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
  /** Playlists only: the /playlists page section ("Featured", "Podcast"…). */
  theme?: string;
}

/** One stem master file of a track (from tracks.stems_manifest). */
interface StemFile {
  key: string;
  name: string;
  size: number;
}
interface StemsInfo {
  files: StemFile[];
  /** Legacy track: one pre-packed stems zip, no per-file list to show. */
  legacyZip: boolean;
  /** WAV masters already on the track — used to spot re-dropped duplicates. */
  masters: StemFile[];
}

/** "Epic Battle_Stems_Drums.wav" is a STEM, not a version (same rule as Bulk Upload). */
const isStemFile = (filename: string) =>
  /(^|[_\s(-])stems?([_\s).-]|$)/i.test(filename.replace(/\.[a-z0-9]+$/i, "").trim());
const isMp3File = (filename: string) => /\.mp3$/i.test(filename);
const isAudioFile = (filename: string) => /\.(wav|mp3)$/i.test(filename);

/** POST one audio file to the admin upload endpoint. */
const uploadAudioApi = async (
  file: Blob,
  kind: "preview" | "preview128" | "master",
  filename: string,
): Promise<{ key: string; path: string | null }> => {
  const base = filename.replace(/\.[^.]+$/, "");
  const res = await fetch(`/api/admin/upload-audio?kind=${kind}&filename=${encodeURIComponent(base)}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": file.type || (kind === "master" ? "audio/wav" : "audio/mpeg"),
    },
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

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type TriState = "all" | "none" | "mixed";
type FacetKey = "useCase" | "genre" | "mood";
type SortMode = "default" | "trending" | "id";

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

// The .xlsx readers below understand ONE sheet layout: the one Dred Studio sends
// (# / Title / BPM / Lengths / Alternative Title / Style / Description / Tags).
// Other composers deliver other shapes, and reading them with these rules writes
// the wrong data into the wrong columns — so the buttons only appear when his
// catalogue is the one being filtered. Add a composer here when his format is
// supported too.
const XLSX_SHEET_COMPOSERS = ["Dred Studio"];

// "Vicate Import xlsx" understands a DIFFERENT sheet layout: the mapped one
// (# / title / bpm / genres / moods / usage / categories / playlists /
// description) where every cell holds comma-separated SITE values. It ticks
// the checkbox facets / categories / playlists of the selected tracks —
// nothing else — so it gets its own composer gate, like the Dred buttons.
const VICATE_SHEET_COMPOSERS = ["Vicate"];

const facetValue = (track: CatalogTrack, key: FacetKey) =>
  key === "useCase" ? track.useCase : key === "genre" ? track.genre : track.mood;

/** Checkbox that can render a "mixed" (dash) state, like the OS ones.
 *  `count` = how many tracks in the whole catalogue carry this tag / sit in this
 *  playlist — admin-only bookkeeping, so the owner sees what is empty.
 *  `onShow` adds a little SHOW button (visible on row hover, or always while
 *  active) that filters the track table down to this tag's tracks — the owner
 *  listens through e.g. every "Epic" track and prunes the ones that don't fit. */
const TriCheckbox = ({
  label,
  state,
  onToggle,
  count,
  onShow,
  showActive = false,
  toggleDisabled = false,
}: {
  label: string;
  state: TriState;
  onToggle: () => void;
  count?: number;
  onShow?: () => void;
  showActive?: boolean;
  /** No tracks selected: the tick can't apply to anything, so only IT goes
   *  inert — the row (and its SHOW button) stays alive. */
  toggleDisabled?: boolean;
}) => (
  <div className="group/tri flex min-w-0 items-center">
    <button
      type="button"
      onClick={onToggle}
      disabled={toggleDisabled}
      title={toggleDisabled ? "Select tracks in the table first" : undefined}
      className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-foreground/[0.04] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
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
      {count !== undefined && (
        <span
          className={`shrink-0 font-body text-[10px] tabular-nums ${
            count === 0 ? "text-muted-foreground/50" : "text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
    {onShow && (
      <button
        type="button"
        onClick={onShow}
        title={
          showActive
            ? "Stop filtering the table by this"
            : "Show only this tag's tracks in the table"
        }
        className={`ml-1 shrink-0 rounded px-1 py-0.5 font-body text-[9px] font-bold uppercase tracking-wide transition-all ${
          showActive
            ? "bg-[#F4C430] text-background opacity-100"
            : "text-muted-foreground/80 opacity-0 hover:text-[#F4C430] group-hover/tri:opacity-100"
        }`}
      >
        Show
      </button>
    )}
  </div>
);

/** Same checkbox in a DIFFERENT colour — used for the "own Description as the
 *  prompt" switch, which changes where the AI reads from (not what it writes). */
const BLUE = "#5BA8FF";
const AltCheckbox = ({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-foreground/[0.04]"
  >
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
      style={
        checked
          ? { borderColor: BLUE, backgroundColor: `${BLUE}26` }
          : { borderColor: "hsl(var(--border))" }
      }
    >
      {checked && <Check className="h-3 w-3" style={{ color: BLUE }} />}
    </span>
    <span className="truncate font-body text-xs" style={checked ? { color: BLUE } : undefined}>
      {label}
    </span>
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
  onContentReload,
  onApplyOverrides,
  onSelectionChange,
  selectionResetKey,
  aiTrackIds = [],
  aiTextIds = [],
  fieldsPatch,
  onGenerateCover,
  aiModel = "standard",
  onAiModelChange,
  allComposers = [],
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
  /** Refetch the CONTENT data (collections/playlists/categories memberships) —
   *  needed after a batch AI run, which writes membership straight to the DB. */
  onContentReload?: () => void;
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
  /** EVERY composer profile name (Admin -> Users), tracks or not — the filter
   *  dropdown lists them all, so a fresh composer shows up with (0). */
  allComposers?: string[];
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

  // ---- "Read # Only" — write ONLY the sheet's "#" into the ID column of the
  // selected tracks. Deliberately separate from "Read .xlsx": that one rewrites
  // BPM / Description / Tags, and the owner often wants just the numbers (they
  // will drive the release-date ordering later). Nothing else is touched.
  const [numBusy, setNumBusy] = useState(false);

  const readNumbersOnly = async (file: File) => {
    const keep = [...selected]; // the selection must survive the whole run
    const selectedTracks = tracks.filter((t) => keep.includes(t.id));
    if (selectedTracks.length === 0) {
      toast.error("Select the tracks to number first");
      return;
    }
    setNumBusy(true);
    try {
      const grid = await parseXlsx(file);
      if (grid.length < 2) throw new Error("The sheet needs a header row and data rows");
      const header = grid[0].map((h) => h.trim().toLowerCase());
      // The "#" column is usually the first one (A); a header match wins over it.
      const cNum = (() => {
        const i = header.findIndex((h) => /^(#|№|no\.?|num(ber)?|id)$/.test(h));
        return i >= 0 ? i : 0;
      })();
      const cTitle = (() => {
        const i = header.findIndex((h) => /^title|^track|^name/.test(h));
        return i >= 0 ? i : 1;
      })();
      const cAlt = (() => {
        const i = header.findIndex((h) => /alternative/.test(h));
        return i >= 0 ? i : 4;
      })();

      const byName = new Map<string, string[]>();
      for (const row of grid.slice(1)) {
        for (const key of [normTitle(row[cTitle] ?? ""), normTitle(row[cAlt] ?? "")]) {
          if (key && !byName.has(key)) byName.set(key, row);
        }
      }
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
        .map((t) => ({ t, no: (findRow(t.title)?.[cNum] ?? "").toString().trim() }))
        .filter((m) => m.no);
      const missed = selectedTracks.length - matches.length;
      if (matches.length === 0) {
        throw new Error(`No selected track matched a row with a number (column ${cNum + 1})`);
      }
      if (
        !window.confirm(
          `Write the # to ${matches.length} selected track(s) from "${file.name}"?` +
            (missed > 0 ? `\n${missed} selected track(s) had no number and stay untouched.` : "") +
            `\nOnly the ID is written — BPM, description and tags are NOT touched.`,
        )
      )
        return;

      let done = 0;
      const overrides: Record<string, Partial<CatalogTrack>> = {};
      for (const { t, no } of matches) {
        const res = await fetch("/api/admin/content", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "bulk_update_tracks",
            trackIds: [t.id],
            fields: { importNo: no },
          }),
        });
        const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !d.ok) {
          toast.error(`${t.title}: ${d.error ?? "failed"}`);
          continue;
        }
        overrides[t.id] = { importNo: no };
        done += 1;
      }
      // The rows are patched locally with the new numbers — NO tracks refetch.
      // A refetch re-sorts the table under the owner (and, with the ID sort on,
      // moves his rows away), which reads as "my checkboxes got cleared".
      // The selection is also restored explicitly, so nothing can drop it.
      if (Object.keys(overrides).length > 0) onApplyOverrides(overrides);
      setSelected(keep);
      toast.success(`${done} track(s) numbered${missed > 0 ? ` · ${missed} without a match` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the sheet");
    } finally {
      setNumBusy(false);
    }
  };

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

  // ---- "Vicate Import xlsx" — tick Genres / Moods / Usage / Categories /
  // Playlists of the SELECTED tracks from Vicate's mapped sheet. Rows are
  // matched by title (same normalizer as the other readers); cell values are
  // comma-separated and matched case-insensitively against the LIVE
  // vocabularies and the playlist / category titles — anything unknown is
  // skipped and reported, never written. ADD-only: a re-import can't untick
  // what was set by hand. BPM / description are NOT touched.
  const [vicateBusy, setVicateBusy] = useState(false);

  const vicateImport = async (file: File) => {
    const keep = [...selected]; // the selection must survive the whole run
    const selectedTracks = tracks.filter((t) => keep.includes(t.id));
    if (selectedTracks.length === 0) {
      toast.error("Select the tracks to import first");
      return;
    }
    setVicateBusy(true);
    try {
      const grid = await parseXlsx(file);
      if (grid.length < 2) throw new Error("The sheet needs a header row and data rows");
      const header = grid[0].map((h) => h.trim().toLowerCase());
      const col = (re: RegExp, fallback: number) => {
        const i = header.findIndex((h) => re.test(h));
        return i >= 0 ? i : fallback;
      };
      const cTitle = col(/^title/, 1);
      const cGenres = col(/^genre/, 3);
      const cMoods = col(/^mood/, 4);
      const cUsage = col(/^usage|^use.?case/, 5);
      const cCats = col(/^categor/, 6);
      const cPls = col(/^playlist/, 7);

      const byName = new Map<string, string[]>();
      for (const row of grid.slice(1)) {
        const key = normTitle(row[cTitle] ?? "");
        if (key && !byName.has(key)) byName.set(key, row);
      }
      const sheetKeys = [...byName.keys()];
      const findRow = (title: string): string[] | undefined => {
        const n = normTitle(title);
        if (!n) return undefined;
        const exact = byName.get(n);
        if (exact) return exact;
        const fuzzy = sheetKeys.find((k) => k.includes(n) || n.includes(k));
        return fuzzy ? byName.get(fuzzy) : undefined;
      };

      // Case-insensitive canonicalizers: the sheet says "hip hop", the site
      // writes "Hip hop" — always the LIVE spelling wins.
      const canon = (options: string[]) => {
        const m = new Map(options.map((o) => [o.trim().toLowerCase(), o]));
        return (v: string) => m.get(v.toLowerCase());
      };
      const canonGenre = canon(vocabularies.genre);
      const canonMood = canon(vocabularies.mood);
      const canonUsage = canon(vocabularies.useCase);
      const itemByTitle = (items: ContentItemLite[]) => {
        const m = new Map(items.map((i) => [i.title.trim().toLowerCase(), i.id]));
        return (v: string) => m.get(v.toLowerCase());
      };
      const playlistIdOf = itemByTitle(playlists);
      const categoryIdOf = itemByTitle(categories);

      const cells = (row: string[], c: number) =>
        (row[c] ?? "").split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);
      const unknown = new Set<string>();
      const pick = (vals: string[], f: (v: string) => string | undefined): string[] => {
        const out: string[] = [];
        for (const v of vals) {
          const c = f(v);
          if (c === undefined) unknown.add(v);
          else if (!out.includes(c)) out.push(c);
        }
        return out;
      };

      const plan = selectedTracks.flatMap((t) => {
        const row = findRow(t.title);
        if (!row) return [];
        return [
          {
            t,
            genres: pick(cells(row, cGenres), canonGenre),
            moods: pick(cells(row, cMoods), canonMood),
            usage: pick(cells(row, cUsage), canonUsage),
            catIds: pick(cells(row, cCats), categoryIdOf),
            plIds: pick(cells(row, cPls), playlistIdOf),
          },
        ];
      });
      const missed = selectedTracks.length - plan.length;
      if (plan.length === 0) throw new Error("No selected track matched a title in the sheet");
      if (
        !window.confirm(
          `Tick Genres / Moods / Usage / Categories / Playlists for ${plan.length} selected track(s) from "${file.name}"?` +
            (missed > 0 ? `\n${missed} selected track(s) had no matching row and stay untouched.` : "") +
            (unknown.size > 0
              ? `\nUnknown values (skipped): ${[...unknown].slice(0, 8).join(", ")}${unknown.size > 8 ? "…" : ""}`
              : "") +
            `\nADD-only — existing ticks are never removed. BPM / description are not touched.`,
        )
      )
        return;

      let done = 0;
      const overrides: Record<string, Partial<CatalogTrack>> = {};
      for (const p of plan) {
        const facets: Partial<Record<FacetKey, { add: string[] }>> = {};
        if (p.usage.length > 0) facets.useCase = { add: p.usage };
        if (p.genres.length > 0) facets.genre = { add: p.genres };
        if (p.moods.length > 0) facets.mood = { add: p.moods };
        const body: Record<string, unknown> = { action: "bulk_update_tracks", trackIds: [p.t.id] };
        if (Object.keys(facets).length > 0) body.facets = facets;
        if (p.plIds.length > 0) body.playlistChanges = { add: p.plIds };
        if (p.catIds.length > 0) body.categoryChanges = { add: p.catIds };
        if (!body.facets && !body.playlistChanges && !body.categoryChanges) continue;
        const res = await fetch("/api/admin/content", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !d.ok) {
          toast.error(`${p.t.title}: ${d.error ?? "failed"}`);
          continue;
        }
        // Mirror the facets onto the row so the table (and the tri-state boxes)
        // are right without a tracks refetch; memberships live in the CONTENT
        // data and are reloaded once below.
        const merge = (cur: string, add: string[]) => {
          const vals = splitFilterValues(cur);
          for (const a of add) if (!vals.some((v) => v.toLowerCase() === a.toLowerCase())) vals.push(a);
          return vals.join(" / ");
        };
        overrides[p.t.id] = {
          ...(p.usage.length > 0 ? { useCase: merge(p.t.useCase, p.usage) } : {}),
          ...(p.genres.length > 0 ? { genre: merge(p.t.genre, p.genres) } : {}),
          ...(p.moods.length > 0 ? { mood: merge(p.t.mood, p.moods) } : {}),
        };
        done += 1;
      }
      if (Object.keys(overrides).length > 0) onApplyOverrides(overrides);
      if (done > 0) onContentReload?.();
      setSelected(keep);
      toast.success(
        `Checkboxes set for ${done} track(s)` +
          (missed > 0 ? ` · ${missed} unmatched` : "") +
          (unknown.size > 0 ? ` · ${unknown.size} unknown value(s) skipped` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the .xlsx");
    } finally {
      setVicateBusy(false);
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
  // "Use each track's own Description as the prompt": the prompt box disappears
  // and every selected track is tagged from ITS OWN description text.
  const [aiUseTrackDesc, setAiUseTrackDesc] = useState(false);
  const [aiBatch, setAiBatch] = useState<{ done: number; total: number } | null>(null);

  interface AiResult {
    ok?: boolean;
    error?: string;
    useCase?: string[];
    genre?: string[];
    mood?: string[];
    collectionIds?: string[];
    playlistIds?: string[];
    categoryIds?: string[];
    extraTags?: string[];
  }

  const askAi = async (prompt: string, trackTitle?: string): Promise<AiResult> => {
    const res = await fetch("/api/admin/suggest-tags", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      // Variation salt: the same prompt on different tracks must not yield
      // carbon-copy picks — the model varies borderline calls by the title.
      body: JSON.stringify({ prompt, include: aiInclude, trackTitle }),
    });
    const d = (await res.json().catch(() => ({}))) as AiResult;
    if (!res.ok || !d.ok) throw new Error(d.error ?? "AI suggestion failed");
    return d;
  };

  /** Vocab options the AI picked, in the vocabulary's own casing. */
  const matchVocab = (key: FacetKey, vals?: string[]) => {
    const picked = new Set((vals ?? []).map((v) => v.toLowerCase()));
    return vocabularies[key].filter((o) => picked.has(o.toLowerCase()));
  };
  /** Authoritative membership delta: what the AI picked in, everything else out. */
  const membershipDelta = (ids: string[] | undefined, items: ContentItemLite[]) => {
    const picked = new Set(ids ?? []);
    return {
      add: items.filter((i) => picked.has(i.id)).map((i) => i.id),
      remove: items.filter((i) => !picked.has(i.id)).map((i) => i.id),
    };
  };

  // MANY tracks: there is no shared panel state that could hold a different
  // answer per track, so each track is tagged AND SAVED on its own. The AI part
  // is ONE request: the server reads the vocabularies / playlists / tags base
  // once and runs the tracks through the model in parallel (the old version
  // paid a full round trip per track, one after the other — that was the wait).
  const runAiSuggestBatch = async () => {
    const targets = selTracks;
    const asks = targets
      .map((t) => ({
        id: t.id,
        title: t.title,
        prompt: (aiUseTrackDesc ? (t.description ?? "") : aiPrompt).trim(),
      }))
      .filter((a) => a.prompt);
    const skipped = targets.length - asks.length;
    if (asks.length === 0) {
      toast.error("Nothing to work with — those tracks have no description");
      return;
    }

    setAiPromptBusy(true);
    setAiBatch({ done: 0, total: asks.length });
    let okCount = 0;
    try {
      const res = await fetch("/api/admin/suggest-tags", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracks: asks, include: aiInclude }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        results?: (AiResult & { id: string })[];
      };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "AI suggestion failed");

      const results = d.results ?? [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const t = targets.find((x) => x.id === r.id);
        if (!t) continue;
        if (r.error) {
          toast.error(`${t.title}: ${r.error}`);
          setAiBatch({ done: i + 1, total: results.length });
          continue;
        }
        try {
          const payload: Record<string, unknown> = {
            action: "bulk_update_tracks",
            trackIds: [t.id],
          };
          if (aiInclude.tags) {
            const facets: Record<string, { add: string[]; remove: string[] }> = {};
            for (const key of ["useCase", "genre", "mood"] as FacetKey[]) {
              const add = matchVocab(key, r[key]);
              const addSet = new Set(add.map((v) => v.toLowerCase()));
              facets[key] = {
                add,
                remove: vocabularies[key].filter((o) => !addSet.has(o.toLowerCase())),
              };
            }
            payload.facets = facets;
          }
          if (aiInclude.collections) payload.collectionChanges = membershipDelta(r.collectionIds, collections);
          if (aiInclude.playlists) payload.playlistChanges = membershipDelta(r.playlistIds, playlists);
          if (aiInclude.categories) payload.categoryChanges = membershipDelta(r.categoryIds, categories);

          const fieldsPatch: Record<string, unknown> = {};
          if (aiInclude.extraTags && r.extraTags && r.extraTags.length > 0) {
            fieldsPatch.tags = r.extraTags;
          }
          // Never rewrite the description when it IS the prompt source.
          if (aiInclude.description && !aiUseTrackDesc) {
            try {
              fieldsPatch.description = await generateDescriptionApi({
                useCase: [...new Set([...splitFilterValues(t.useCase), ...(r.useCase ?? [])])],
                genre: [...new Set([...splitFilterValues(t.genre), ...(r.genre ?? [])])],
                mood: [...new Set([...splitFilterValues(t.mood), ...(r.mood ?? [])])],
              });
            } catch {
              // description is a bonus — tagging still lands
            }
          }
          if (Object.keys(fieldsPatch).length > 0) payload.fields = fieldsPatch;

          const saveRes = await fetch("/api/admin/content", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          const saved = (await saveRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!saveRes.ok || !saved.ok) throw new Error(saved.error ?? "Save failed");
          okCount += 1;
        } catch (e) {
          toast.error(`${t.title}: ${e instanceof Error ? e.message : "Save failed"}`);
        }
        setAiBatch({ done: i + 1, total: results.length });
      }

      const bits = [`${okCount} track${okCount === 1 ? "" : "s"} tagged & saved`];
      if (skipped > 0) bits.push(`${skipped} skipped (no description)`);
      toast.success(`AI: ${bits.join(" · ")}`);
      if (okCount > 0) {
        // Playlist / collection / category membership lives in the CONTENT data,
        // not in the tracks list — without this reload the panels on the right
        // still showed the old (empty) ticks after a batch run.
        onContentReload?.();
        onTracksReload?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI suggestion failed");
    } finally {
      setAiPromptBusy(false);
      setAiBatch(null);
    }
  };

  const runAiSuggest = async () => {
    setAiPromptBusy(true);
    try {
      // Single track: the answer is STAGED in the panel for review (Apply saves).
      const promptText = (
        aiUseTrackDesc && selTracks.length === 1 ? (selTracks[0].description ?? "") : aiPrompt
      ).trim();
      const res = await fetch("/api/admin/suggest-tags", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          include: aiInclude,
          // Variation salt: same description on different tracks should not
          // yield carbon-copy picks — the model varies borderline calls by it.
          trackTitle: selTracks.length === 1 ? selTracks[0].title : undefined,
        }),
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
        body: JSON.stringify({
          prompt: promptText,
          include: { tags: false, extraTags: true },
          trackTitle: selTracks.length === 1 ? selTracks[0].title : undefined,
        }),
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

  // Composer filter: the names + how many tracks each one has in the WHOLE
  // catalogue (not just the current tab/filter) — the owner wants to see the
  // size of a composer's catalogue right in the dropdown. Profiles WITHOUT
  // tracks are listed too (with 0) — the owner filters by a fresh composer
  // before his first upload lands (case-insensitive merge, the track spelling
  // wins when both exist).
  const composers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) {
      if (!t.artist) continue;
      counts.set(t.artist, (counts.get(t.artist) ?? 0) + 1);
    }
    const have = new Set([...counts.keys()].map((n) => n.toLowerCase()));
    for (const name of allComposers) {
      const n = name.trim();
      if (n && !have.has(n.toLowerCase())) {
        have.add(n.toLowerCase());
        counts.set(n, 0);
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks, allComposers]);
  const totalWithComposer = useMemo(
    () => composers.reduce((n, c) => n + c.count, 0),
    [composers],
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

  // ---- "Show" tag filter: a SHOW button next to any checkbox narrows the
  // table to that tag's / playlist's tracks, so the owner can audit them by
  // ear. While it is on, every row grows an X ("Remove from selected") that
  // takes the track OUT of the filtered tag — see removeFromTagFilter.
  const [tagFilter, setTagFilter] = useState<
    | { kind: "facet"; key: FacetKey; option: string }
    | { kind: "playlist" | "collection" | "category"; id: string; title: string }
    | null
  >(null);
  const tagFilterLabel = tagFilter
    ? tagFilter.kind === "facet"
      ? tagFilter.option
      : tagFilter.title
    : "";
  useEffect(() => {
    setPage(1);
  }, [tagFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inTagFilter = (t: CatalogTrack): boolean => {
      if (!tagFilter) return true;
      if (tagFilter.kind === "facet") {
        return splitFilterValues(facetValue(t, tagFilter.key)).some(
          (v) => v.toLowerCase() === tagFilter.option.toLowerCase(),
        );
      }
      const pool =
        tagFilter.kind === "playlist" ? playlists : tagFilter.kind === "collection" ? collections : categories;
      const item = pool.find((i) => i.id === tagFilter.id);
      // The item vanished (deleted in another tab) — don't silently hide everything.
      return item ? item.trackIds.includes(t.id) : true;
    };
    let list = tracks.filter(
      (t) =>
        bucketOf(t) === statusTab &&
        (composer === "all" || t.artist === composer) &&
        (!q || t.title.toLowerCase().includes(q)) &&
        inTagFilter(t),
    );
    if (sort === "trending") {
      const set = new Set(trending);
      list = [...list].sort((a, b) => (set.has(b.id) ? 1 : 0) - (set.has(a.id) ? 1 : 0));
    }
    if (sort === "id") {
      // The spreadsheet "#" — numeric when it can be, text otherwise; tracks
      // without a number sink to the bottom instead of pretending to be 0.
      const num = (t: CatalogTrack) => {
        const raw = (t.importNo ?? "").trim();
        if (!raw) return Number.POSITIVE_INFINITY;
        const n = Number(raw);
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
      };
      list = [...list].sort((a, b) => {
        const d = num(a) - num(b);
        return d !== 0 ? d : a.title.localeCompare(b.title);
      });
    }
    return list;
  }, [tracks, search, composer, sort, trending, statusTab, tagFilter, playlists, collections, categories]);

  // The X on a row while the Show filter is on: pull the track out of the
  // filtered tag / playlist — the row then drops out of the list by itself.
  const removeFromTagFilter = async (t: CatalogTrack) => {
    if (!tagFilter || disabled || busy) return;
    if (tagFilter.kind === "facet") {
      const ok = await run(
        {
          action: "bulk_update_tracks",
          trackIds: [t.id],
          facets: { [tagFilter.key]: { remove: [tagFilter.option] } },
        },
        `"${tagFilter.option}" removed from "${t.title}"`,
      );
      if (!ok) return;
      const vals = splitFilterValues(facetValue(t, tagFilter.key)).filter(
        (v) => v.toLowerCase() !== tagFilter.option.toLowerCase(),
      );
      const joined = vals.join(" / ");
      onApplyOverrides({
        [t.id]:
          tagFilter.key === "useCase"
            ? { useCase: joined }
            : tagFilter.key === "genre"
              ? { genre: joined }
              : { mood: joined },
      });
    } else {
      const change = { remove: [tagFilter.id] };
      const ok = await run(
        {
          action: "bulk_update_tracks",
          trackIds: [t.id],
          ...(tagFilter.kind === "playlist"
            ? { playlistChanges: change }
            : tagFilter.kind === "collection"
              ? { collectionChanges: change }
              : { categoryChanges: change }),
        },
        `"${t.title}" removed from "${tagFilter.title}"`,
      );
      if (!ok) return;
      // Membership lives in the CONTENT data — refresh it so the row drops out.
      onContentReload?.();
    }
  };

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

  // TICKING A BOX SAVES IT (owner: no Apply for checkboxes). The click is applied
  // optimistically, the request follows, and a failure puts the box back where it
  // was. Apply is now ONLY for the text fields (description, tags, title, BPM…),
  // where you want to finish typing before anything is written.
  const toggleFacet = async (key: FacetKey, option: string) => {
    if (disabled || busy || selected.length === 0) return;
    const to = nextState(facetDisplay(key, option));
    setFacetChanges((prev) => ({ ...prev, [key]: { ...prev[key], [option]: to } }));

    const ok = await run(
      {
        action: "bulk_update_tracks",
        trackIds: selected,
        facets: { [key]: to === "all" ? { add: [option] } : { remove: [option] } },
      },
      to === "all" ? `"${option}" added` : `"${option}" removed`,
    );
    if (!ok) {
      // Put the box back — the server said no.
      setFacetChanges((prev) => {
        const m = { ...prev[key] };
        delete m[option];
        return { ...prev, [key]: m };
      });
      return;
    }
    // Mirror it onto the rows so the table is right without refetching, then drop
    // the pending mark (the tracks themselves now carry the value).
    const overrides: Record<string, Partial<CatalogTrack>> = {};
    for (const t of selTracks) {
      let vals = splitFilterValues(facetValue(t, key));
      if (to === "all") {
        if (!vals.includes(option)) vals = [...vals, option];
      } else {
        vals = vals.filter((v) => v !== option);
      }
      const joined = vals.join(" / ");
      overrides[t.id] =
        key === "useCase" ? { useCase: joined } : key === "genre" ? { genre: joined } : { mood: joined };
    }
    onApplyOverrides(overrides);
    setFacetChanges((prev) => {
      const m = { ...prev[key] };
      delete m[option];
      return { ...prev, [key]: m };
    });
  };

  /** Same instant save for collection / playlist / category membership. */
  const toggleMembership = async (
    kind: "collection" | "playlist" | "category",
    item: ContentItemLite,
    delta: Record<string, "all" | "none">,
    setDelta: (fn: (prev: Record<string, "all" | "none">) => Record<string, "all" | "none">) => void,
  ) => {
    if (disabled || busy || selected.length === 0) return;
    const to = nextState(delta[item.id] ?? memberBase(item));
    setDelta((prev) => ({ ...prev, [item.id]: to }));

    const change = to === "all" ? { add: [item.id] } : { remove: [item.id] };
    const ok = await run(
      {
        action: "bulk_update_tracks",
        trackIds: selected,
        ...(kind === "collection"
          ? { collectionChanges: change }
          : kind === "playlist"
            ? { playlistChanges: change }
            : { categoryChanges: change }),
      },
      to === "all" ? `Added to "${item.title}"` : `Removed from "${item.title}"`,
    );
    if (!ok) {
      setDelta((prev) => {
        const m = { ...prev };
        delete m[item.id];
        return m;
      });
      return;
    }
    // Membership lives in the CONTENT data (item.trackIds) — refresh it so the
    // box keeps reading right when the selection changes.
    onContentReload?.();
  };

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

  // Checkboxes save themselves now, so Apply/Reset only ever deal with the
  // typed fields (title, BPM, description, tags, cover, stems flag).
  const dirty = fieldsDirty;

  const resetChanges = () => {
    if (selTracks.length === 1) setFields(fieldsOf(selTracks[0]));
  };

  // Apply now saves ONLY the typed fields of the single selected track — every
  // checkbox (tags, collections, playlists, categories, trending) writes itself
  // the moment it is clicked.
  const applyChanges = async () => {
    if (!fields || selTracks.length !== 1 || !fieldsDirty) return;
    const singleFields = {
      title: fields.title,
      bpm: fields.bpm ? Number(fields.bpm) : undefined,
      description: fields.description,
      cover: fields.cover,
      tags: fields.tags.split(",").map((s) => s.trim()).filter(Boolean),
      hasStems: fields.hasStems,
    };

    const ok = await run(
      { action: "bulk_update_tracks", trackIds: selected, fields: singleFields },
      "Track updated",
    );
    if (!ok) return;

    // Mirror it onto the row so the table updates without refetching /api/tracks.
    const t = selTracks[0];
    const o: Partial<CatalogTrack> = {
      description: singleFields.description,
      tags: singleFields.tags,
      cover: singleFields.cover || undefined,
      hasStems: singleFields.hasStems,
    };
    if (singleFields.title.trim()) o.title = singleFields.title.trim();
    if (singleFields.bpm !== undefined) o.bpm = singleFields.bpm;
    onApplyOverrides({ [t.id]: o });
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
    if (!window.confirm(`Remove ALL stems from "${t.title}"? The STEMS download option disappears.`)) return;
    setVersionBusy(`${t.id}:stems`);
    const ok = await run(
      { action: "bulk_update_tracks", trackIds: [t.id], fields: { clearStems: true } },
      "Stems removed",
    );
    setVersionBusy(null);
    if (ok) {
      setStems((s) => ({ ...s, [t.id]: { files: [], legacyZip: false, masters: s[t.id]?.masters ?? [] } }));
      onApplyOverrides({ [t.id]: { hasStems: false } });
      onTracksReload?.();
    }
  };

  // --- stems of the open row: individual master files, deletable one by one.
  // Nothing is pre-packed any more — the STEMS .zip is built at download time,
  // so the editor lists the actual files under the STEMS plaque. ---
  const [stems, setStems] = useState<Record<string, StemsInfo>>({});
  const [stemsLoading, setStemsLoading] = useState<string | null>(null);

  useEffect(() => {
    const id = versionsOpenId;
    if (!id || stems[id]) return;
    let cancelled = false;
    setStemsLoading(id);
    fetch(`/api/admin/stems?track=${encodeURIComponent(id)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("stems"))))
      .then((d: { stems?: StemFile[]; legacyZip?: boolean; masters?: StemFile[] }) => {
        if (cancelled) return;
        setStems((s) => ({
          ...s,
          [id]: { files: d.stems ?? [], legacyZip: !!d.legacyZip, masters: d.masters ?? [] },
        }));
      })
      .catch(() => {
        // Legacy DB / network hiccup — fall back to the plain "bundle attached" row.
        if (!cancelled) {
          setStems((s) => ({ ...s, [id]: { files: [], legacyZip: true, masters: [] } }));
        }
      })
      .finally(() => {
        if (!cancelled) setStemsLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [versionsOpenId, stems]);

  const deleteStem = async (t: CatalogTrack, stem: StemFile) => {
    if (!window.confirm(`Delete stem "${stem.name}" from "${t.title}"?`)) return;
    setVersionBusy(`${t.id}:${stem.key}`);
    const ok = await run({ action: "delete_stem", id: t.id, key: stem.key }, "Stem deleted");
    setVersionBusy(null);
    if (!ok) return;
    const info = stems[t.id];
    const left = (info?.files ?? []).filter((f) => f.key !== stem.key);
    setStems((s) => ({
      ...s,
      [t.id]: { files: left, legacyZip: info?.legacyZip ?? false, masters: info?.masters ?? [] },
    }));
    // Last stem gone → the STEMS download option goes with it.
    if (left.length === 0 && !info?.legacyZip) {
      onApplyOverrides({ [t.id]: { hasStems: false } });
      onTracksReload?.();
    }
  };

  // --- Drag & drop reorder (versions AND stems) ------------------------------
  // The list the owner arranges IS the list the customer gets: the top version
  // becomes Main (same rule as the star), and the stem order is the order the
  // files land in the STEMS zip.
  const [dragItem, setDragItem] = useState<{ trackId: string; kind: "version" | "stem"; id: string } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  const reorder = <T,>(list: T[], from: number, to: number): T[] => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const dropOn = async (t: CatalogTrack, kind: "version" | "stem", targetId: string) => {
    const src = dragItem;
    setDragItem(null);
    setDragOverItem(null);
    if (!src || src.trackId !== t.id || src.kind !== kind || src.id === targetId) return;

    if (kind === "version") {
      // TrackVersion is a union of legacy literals — the live ids are plain
      // strings ("main", "v2"…), so compare as strings.
      const ids = t.audioVersions.map((v) => String(v.id));
      const from = ids.indexOf(src.id);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      setVersionBusy(`${t.id}:${src.id}`);
      const ok = await run(
        { action: "reorder_versions", id: t.id, versionIds: reorder(ids, from, to) },
        "Order saved",
      );
      setVersionBusy(null);
      if (ok) onTracksReload?.();
      return;
    }

    const files = stems[t.id]?.files ?? [];
    const keys = files.map((f) => f.key);
    const from = keys.indexOf(src.id);
    const to = keys.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = reorder(files, from, to);
    // Optimistic: the row shows the new order while the save runs.
    setStems((st) => ({
      ...st,
      [t.id]: { files: next, legacyZip: st[t.id]?.legacyZip ?? false, masters: st[t.id]?.masters ?? [] },
    }));
    setVersionBusy(`${t.id}:${src.id}`);
    const ok = await run(
      { action: "reorder_stems", id: t.id, keys: next.map((f) => f.key) },
      "Stem order saved",
    );
    setVersionBusy(null);
    if (!ok) void refreshStems(t.id);
  };

  // --- Drop files straight into an open versions row -------------------------
  // Same rules as Bulk Upload: a file named …_stem(s)_… is a STEM, anything else
  // is a new VERSION. Files that are already on the track are refused BEFORE
  // any encoding/upload happens (matched on filename, and on the version label
  // the filename would produce — a re-drop is almost always a mistake).
  const [dropBusy, setDropBusy] = useState<string | null>(null);
  const [dropNote, setDropNote] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);

  const refreshStems = async (trackId: string) => {
    try {
      const r = await fetch(`/api/admin/stems?track=${encodeURIComponent(trackId)}`, {
        credentials: "include",
      });
      if (!r.ok) return;
      const d = (await r.json()) as { stems?: StemFile[]; legacyZip?: boolean; masters?: StemFile[] };
      setStems((s) => ({
        ...s,
        [trackId]: { files: d.stems ?? [], legacyZip: !!d.legacyZip, masters: d.masters ?? [] },
      }));
    } catch {
      // the row just keeps the list it had
    }
  };

  const addFilesToTrack = async (t: CatalogTrack, files: File[]) => {
    const audio = files.filter((f) => isAudioFile(f.name));
    if (audio.length === 0) {
      toast.error("No audio files there (.wav or .mp3)");
      return;
    }
    const info = stems[t.id];
    const knownNames = new Set(
      [...(info?.files ?? []), ...(info?.masters ?? [])].map((f) => f.name.toLowerCase()),
    );
    const knownLabels = new Set(
      t.audioVersions.map((v) => (cleanVersionLabel(v.label, t.title) || v.label).toLowerCase()),
    );

    setDropBusy(t.id);
    let added = 0;
    let addedStems = 0;
    try {
      for (const file of audio) {
        const base = file.name.replace(/\.[a-z0-9]+$/i, "");
        const stem = isStemFile(file.name);

        // --- duplicate guard ---------------------------------------------
        if (knownNames.has(file.name.toLowerCase())) {
          toast.error(`"${file.name}" is already on this track — skipped`);
          continue;
        }
        const label = cleanVersionLabel(base, t.title) || `Version ${t.audioVersions.length + 1}`;
        if (!stem && knownLabels.has(label.toLowerCase())) {
          toast.error(`This track already has a version called "${label}" — skipped`);
          continue;
        }

        if (stem) {
          // A stem ships as a WAV master AND as an MP3 320 for streaming (the
          // planned mini-DAW plays the layers in the browser) — same as Bulk Upload.
          let preview: string | undefined;
          if (!isMp3File(file.name)) {
            setDropNote(`Encoding MP3 for ${file.name}…`);
            const { mp3_320 } = await wavToMp3Pair(file);
            setDropNote(`Uploading stem preview ${file.name}…`);
            preview = (await uploadAudioApi(mp3_320, "preview", file.name)).path ?? undefined;
          }
          setDropNote(`Checksumming ${file.name}…`);
          const crc = await crc32File(file);
          setDropNote(`Uploading stem ${file.name}…`);
          const up = await uploadAudioApi(file, "master", file.name);
          const ok = await run(
            {
              action: "add_stems",
              id: t.id,
              stems: [{ key: up.key, name: file.name, size: file.size, crc, preview }],
            },
            `Stem "${file.name}" added`,
          );
          if (ok) {
            addedStems += 1;
            knownNames.add(file.name.toLowerCase());
          }
          continue;
        }

        // --- new version --------------------------------------------------
        setDropNote(`Encoding ${file.name}…`);
        let previews: { mp3_320: Blob; mp3_128: Blob; duration: number };
        if (isMp3File(file.name)) {
          // An MP3 is used AS-IS for the 320 preview; only the 128 copy is made.
          const buffer = await decodeAudio(file);
          previews = { mp3_320: file, mp3_128: encodeMp3(buffer, 128), duration: buffer.duration };
        } else {
          previews = await wavToMp3Pair(file);
        }
        setDropNote(`Uploading previews for ${file.name}…`);
        const p320 = await uploadAudioApi(previews.mp3_320, "preview", file.name);
        const p128 = await uploadAudioApi(previews.mp3_128, "preview128", file.name).catch(() => null);

        // WAV versions carry a master (v2 storage) — it joins the track's WAV
        // manifest so the customer's zip contains the new version too.
        let masterEntry: { key: string; name: string; size: number; crc: number } | undefined;
        if (!isMp3File(file.name)) {
          setDropNote(`Uploading master ${file.name}…`);
          const crc = await crc32File(file);
          const up = await uploadAudioApi(file, "master", file.name);
          masterEntry = { key: up.key, name: file.name, size: file.size, crc };
        }

        const ok = await run(
          {
            action: "add_version",
            id: t.id,
            label,
            previewSrc: p320.path,
            preview128: p128?.path ?? undefined,
            duration: formatDuration(previews.duration),
            masterEntry,
          },
          `Version "${label}" added`,
        );
        if (ok) {
          added += 1;
          knownNames.add(file.name.toLowerCase());
          knownLabels.add(label.toLowerCase());
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setDropBusy(null);
      setDropNote("");
      if (added > 0 || addedStems > 0) {
        await refreshStems(t.id);
        onTracksReload?.();
      }
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
    kind: "collection" | "playlist" | "category",
    items: ContentItemLite[],
    delta: Record<string, "all" | "none">,
    setDelta: (updater: (prev: Record<string, "all" | "none">) => Record<string, "all" | "none">) => void,
    searchValue?: string,
    setSearchValue?: (v: string) => void,
  ) => {
    const visible = items.filter(
      (i) => !searchValue || i.title.toLowerCase().includes(searchValue.toLowerCase()),
    );
    // Playlists carry a THEME — group their checkboxes under small gold theme
    // headers (mirrors the /playlists page sections). Themeless items first.
    const groups: { theme: string; items: ContentItemLite[] }[] = [];
    for (const i of visible) {
      const theme = (i.theme ?? "").trim();
      const g = groups.find((x) => x.theme === theme);
      if (g) g.items.push(i);
      else groups.push({ theme, items: [i] });
    }
    groups.sort((a, b) => (a.theme === "" ? -1 : b.theme === "" ? 1 : 0));
    return (
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
        {groups.map((g) => (
          <div key={g.theme || "__none"}>
            {g.theme && (
              <p className="mb-1 mt-2.5 font-body text-[10px] font-semibold uppercase tracking-wider text-[#F4C430]/70">
                {g.theme}
              </p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,max-content))] gap-x-5 gap-y-1">
              {g.items.map((item) => {
                const showActive = tagFilter?.kind === kind && tagFilter.id === item.id;
                return (
                  <TriCheckbox
                    key={item.id}
                    label={item.title}
                    state={memberDisplay(delta, item)}
                    onToggle={() => void toggleMembership(kind, item, delta, setDelta)}
                    count={item.trackIds.length}
                    onShow={() =>
                      setTagFilter(showActive ? null : { kind, id: item.id, title: item.title })
                    }
                    showActive={showActive}
                    toggleDisabled={!hasSelection}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="font-body text-xs text-muted-foreground">None yet.</p>
        )}
      </div>
    );
  };

  // How many tracks carry each tag / sit in each playlist-collection-category.
  // Counted over the WHOLE catalogue (not the current filter) — it is a
  // bookkeeping number for the owner, shown next to every checkbox.
  const facetCounts = useMemo(() => {
    const out: Record<FacetKey, Map<string, number>> = {
      useCase: new Map(),
      genre: new Map(),
      mood: new Map(),
    };
    for (const t of tracks) {
      for (const key of ["useCase", "genre", "mood"] as FacetKey[]) {
        for (const v of splitFilterValues(facetValue(t, key))) {
          const k = v.trim().toLowerCase();
          if (!k) continue;
          out[key].set(k, (out[key].get(k) ?? 0) + 1);
        }
      }
    }
    return out;
  }, [tracks]);

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
            <option value="all">All Composers ({totalWithComposer})</option>
            {composers.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
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
              {/* The sheet readers only understand Dred Studio's layout — see
                  XLSX_SHEET_COMPOSERS. Filter by him and they appear. */}
              {XLSX_SHEET_COMPOSERS.includes(composer) && (
                <>
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
              {/* Numbers only — the "#" column (A) into the ID column. */}
              <label
                className={`${btnCls} cursor-pointer ${numBusy || busy ? "pointer-events-none opacity-50" : ""}`}
                title="Match the selected tracks by title and write ONLY the sheet's # into their ID"
              >
                {numBusy ? "Reading…" : "Read # Only"}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readNumbersOnly(f);
                    e.target.value = "";
                  }}
                />
              </label>
                </>
              )}
              {/* Vicate's mapped sheet (# / title / bpm / genres / moods / usage /
                  categories / playlists / description) — ticks the checkboxes of
                  the selected tracks. Appears only when his catalogue is filtered
                  (see VICATE_SHEET_COMPOSERS). */}
              {VICATE_SHEET_COMPOSERS.includes(composer) && (
                <label
                  className={`${btnCls} cursor-pointer ${vicateBusy || busy ? "pointer-events-none opacity-50" : ""}`}
                  title="Match the selected tracks by title and tick Genres / Moods / Usage / Categories / Playlists from the sheet (add-only)"
                >
                  {vicateBusy ? "Importing…" : "Vicate Import xlsx"}
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void vicateImport(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {/* Checkboxes save themselves — Apply/Reset are only for the typed
                  fields of a single selected track (title, BPM, description,
                  tags, cover). They stay hidden until something is actually typed. */}
              {dirty && (
                <>
                  <button type="button" disabled={busy} onClick={resetChanges} className={btnCls}>
                    Reset
                  </button>
                  <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => void applyChanges()}
                    className={goldBtnCls}
                  >
                    {busy ? "Saving…" : "Save description & tags"}
                  </button>
                </>
              )}
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
        {/* The Show filter banner — which tag the table is narrowed to + Clear. */}
        {tagFilter && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#F4C430]/40 bg-[#F4C430]/[0.06] px-3 py-1.5">
            <span className="min-w-0 truncate font-body text-xs text-foreground">
              Showing {filtered.length} track{filtered.length === 1 ? "" : "s"} in{" "}
              <span className="font-semibold text-[#F4C430]">{tagFilterLabel}</span> — the ✕ on a
              row removes the track from it
            </span>
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              className="ml-auto inline-flex shrink-0 items-center gap-1 font-body text-xs text-muted-foreground transition-colors hover:text-[#F4C430]"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <div className="min-w-[44rem]">
            <div className={`grid ${tagFilter ? "grid-cols-[2.5rem_2.5rem_3.25rem_minmax(0,1fr)_4.5rem_7rem_4.5rem_5rem_2.5rem]" : "grid-cols-[2.5rem_2.5rem_3.25rem_minmax(0,1fr)_4.5rem_7rem_4.5rem_5rem]"} items-center gap-2 border-b border-border/60 bg-secondary/40 px-3 py-2.5`}>
              <span className="flex justify-center">
                <RowCheckbox state={pageState} onToggle={togglePage} label="Select all visible" />
              </span>
              <span />
              {/* The "#" from the imported spreadsheet — NOT unique, and it will
                  drive the release dates later. Click to sort by it. */}
              <button
                type="button"
                onClick={() => setSort((s) => (s === "id" ? "default" : "id"))}
                title="Sort by the spreadsheet #"
                className={`text-left font-body text-xs uppercase tracking-wide transition-colors hover:text-[#F4C430] ${
                  sort === "id" ? "text-[#F4C430]" : "text-muted-foreground"
                }`}
              >
                ID
              </button>
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
              {tagFilter && <span aria-hidden />}
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
                  className={`grid ${tagFilter ? "grid-cols-[2.5rem_2.5rem_3.25rem_minmax(0,1fr)_4.5rem_7rem_4.5rem_5rem_2.5rem]" : "grid-cols-[2.5rem_2.5rem_3.25rem_minmax(0,1fr)_4.5rem_7rem_4.5rem_5rem]"} items-center gap-2 px-3 py-2 transition-colors ${
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

                  {/* Spreadsheet "#" — several tracks may legitimately share one. */}
                  <span
                    className={`truncate font-body text-xs tabular-nums ${
                      t.importNo ? "text-foreground/80" : "text-muted-foreground/40"
                    }`}
                    title={t.importNo ? `Spreadsheet #${t.importNo}` : "No # imported yet"}
                  >
                    {t.importNo || "—"}
                  </span>

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
                  {/* Show filter is on: ✕ pulls the track out of the filtered
                      tag / playlist and the row drops from the list. */}
                  {tagFilter && (
                    <button
                      type="button"
                      disabled={busy || disabled}
                      onClick={() => void removeFromTagFilter(t)}
                      title={`Remove from selected — take "${t.title}" out of ${tagFilterLabel}`}
                      aria-label={`Remove ${t.title} from ${tagFilterLabel}`}
                      className="flex h-6 w-6 items-center justify-center justify-self-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-red-400 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
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
                          draggable={!vBusy && !busy}
                          onDragStart={() => setDragItem({ trackId: t.id, kind: "version", id: v.id })}
                          onDragOver={(e) => {
                            if (dragItem?.trackId !== t.id || dragItem.kind !== "version") return;
                            e.preventDefault();
                            setDragOverItem(v.id);
                          }}
                          onDragLeave={() => setDragOverItem((d) => (d === v.id ? null : d))}
                          onDrop={(e) => {
                            e.preventDefault();
                            void dropOn(t, "version", v.id);
                          }}
                          onDragEnd={() => {
                            setDragItem(null);
                            setDragOverItem(null);
                          }}
                          className={`flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5 ${
                            vBusy ? "opacity-50" : ""
                          } ${dragOverItem === v.id ? "ring-1 ring-[#F4C430]/70" : ""} ${
                            dragItem?.id === v.id ? "opacity-40" : ""
                          }`}
                        >
                          <GripVertical
                            className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
                            aria-hidden
                          />
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
                      <div className="mt-1 border-t border-border/30 pt-1">
                        <div
                          className={`flex items-center gap-2 px-1 py-1 ${
                            versionBusy === `${t.id}:stems` ? "opacity-50" : ""
                          }`}
                        >
                          <span className="shrink-0 rounded border border-[#F4C430]/60 bg-[#F4C430]/10 px-1.5 py-px font-body text-[9px] font-bold uppercase tracking-wide text-[#F4C430]">
                            Stems
                          </span>
                          <span className="min-w-0 flex-1 truncate font-body text-xs text-muted-foreground">
                            {stemsLoading === t.id
                              ? "Loading stems…"
                              : (stems[t.id]?.files.length ?? 0) > 0
                                ? `${stems[t.id].files.length} stem file${stems[t.id].files.length > 1 ? "s" : ""} — zipped on download (Max / license)`
                                : "Stems bundle attached (Max / license download)"}
                          </span>
                          <button
                            type="button"
                            disabled={versionBusy === `${t.id}:stems` || busy}
                            onClick={() => void deleteStems(t)}
                            title="Remove ALL stems from this track"
                            aria-label={`Remove stems from ${t.title}`}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-30"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {(stems[t.id]?.files ?? []).map((sf) => {
                          const sBusy = versionBusy === `${t.id}:${sf.key}`;
                          return (
                            <div
                              key={sf.key}
                              draggable={!sBusy && !busy}
                              onDragStart={() => setDragItem({ trackId: t.id, kind: "stem", id: sf.key })}
                              onDragOver={(e) => {
                                if (dragItem?.trackId !== t.id || dragItem.kind !== "stem") return;
                                e.preventDefault();
                                setDragOverItem(sf.key);
                              }}
                              onDragLeave={() => setDragOverItem((d) => (d === sf.key ? null : d))}
                              onDrop={(e) => {
                                e.preventDefault();
                                void dropOn(t, "stem", sf.key);
                              }}
                              onDragEnd={() => {
                                setDragItem(null);
                                setDragOverItem(null);
                              }}
                              className={`flex items-center gap-2 rounded py-0.5 pl-2 pr-1 hover:bg-white/5 ${
                                sBusy ? "opacity-50" : ""
                              } ${dragOverItem === sf.key ? "ring-1 ring-[#F4C430]/70" : ""} ${
                                dragItem?.id === sf.key ? "opacity-40" : ""
                              }`}
                            >
                              <GripVertical
                                className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
                                aria-hidden
                              />
                              <Music className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                              <span className="min-w-0 flex-1 truncate font-body text-xs text-foreground">
                                {sf.name}
                              </span>
                              <span className="shrink-0 font-body text-[10px] tabular-nums text-muted-foreground">
                                {fmtSize(sf.size)}
                              </span>
                              <button
                                type="button"
                                disabled={sBusy || busy}
                                onClick={() => void deleteStem(t, sf)}
                                title="Delete this stem"
                                aria-label={`Delete stem ${sf.name}`}
                                className="shrink-0 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-30"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Drop new files right here: …_stem(s)_… lands as a STEM,
                        anything else as a new VERSION. Duplicates are refused. */}
                    <label
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(t.id);
                      }}
                      onDragLeave={() => setDragOver((d) => (d === t.id ? null : d))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        if (dropBusy || busy) return;
                        void addFilesToTrack(t, [...e.dataTransfer.files]);
                      }}
                      className={`mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-center transition-colors ${
                        dragOver === t.id
                          ? "border-[#F4C430] bg-[#F4C430]/10"
                          : "border-border/70 hover:border-[#F4C430]/60"
                      } ${dropBusy === t.id ? "opacity-70" : ""}`}
                    >
                      <input
                        type="file"
                        multiple
                        accept=".wav,.mp3,audio/wav,audio/mpeg"
                        disabled={dropBusy === t.id || busy}
                        className="hidden"
                        onChange={(e) => {
                          const files = [...(e.target.files ?? [])];
                          e.target.value = "";
                          if (files.length > 0) void addFilesToTrack(t, files);
                        }}
                      />
                      {dropBusy === t.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F4C430]" />
                          <span className="font-body text-[11px] text-foreground">
                            {dropNote || "Working…"}
                          </span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-body text-[11px] text-muted-foreground">
                            Drop WAV / MP3 here to add a version — files named{" "}
                            <span className="text-foreground">…_stem(s)_…</span> are added as stems.
                            Files already on the track are skipped.
                          </span>
                        </>
                      )}
                    </label>
                    <p className="mt-1 font-body text-[10px] text-muted-foreground">
                      Drag rows to reorder — the top version becomes Main. Rename versions — on the{" "}
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

      {/* ===== Track details: AI tagging (any selection) + title/BPM/description/
          tags/cover/stems (single track only) =====
          The panel stays LIVE for a multi-selection — only the single-track
          fields below are hidden. Dimming the whole panel used to kill the AI
          box with it, so batch tagging was unreachable. */}
      <aside
        className={`mt-6 flex flex-col rounded-xl border border-[#F4C430]/30 bg-card transition-opacity xl:sticky xl:top-24 xl:mt-0 xl:max-h-[calc(100vh-7rem)] ${dimIf(
          hasSelection,
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
                  {selTracks.length > 1
                    ? `${selTracks.length} tracks selected — AI tagging above works on all of them. Select exactly one track to edit its title, BPM, description, tags, cover and stems.`
                    : "Select exactly one track to edit its title, BPM, description, tags, cover and stems here."}
                </p>
              )}
              {selTracks.length > 0 && (
                <div className="mb-4 rounded-lg border border-[#F4C430]/30 bg-[#F4C430]/[0.04] p-3">
                  <p className="flex items-center gap-1.5 font-body text-xs font-semibold text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-[#F4C430]" />
                    AI tagging by prompt
                    {selTracks.length > 1 && (
                      <span className="rounded border border-[#F4C430]/50 px-1 py-px font-body text-[10px] text-[#F4C430]">
                        {selTracks.length} tracks
                      </span>
                    )}
                  </p>
                  {/* Prompt source: the box below, or each track's own Description. */}
                  <div className="mt-2">
                    <AltCheckbox
                      label="Use each track's own Description as the prompt"
                      checked={aiUseTrackDesc}
                      onToggle={() => setAiUseTrackDesc((v) => !v)}
                    />
                  </div>
                  {aiUseTrackDesc ? (
                    <p className="mt-1 rounded-lg border border-dashed border-border/70 bg-background/40 p-2 font-body text-[11px] leading-snug text-muted-foreground">
                      Each selected track is tagged from the text in ITS OWN Description field
                      (the one next to Extra tags) — one AI pass per track, so every track gets its
                      own ticks. Tracks with an empty description are skipped.
                    </p>
                  ) : (
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={3}
                      placeholder='Describe the track in your own words — e.g. "gentle guitars, warm, good for travel videos"'
                      className={`${inputCls} mt-1 w-full resize-y`}
                    />
                  )}
                  {selTracks.length > 1 && (
                    <p className="mt-1.5 font-body text-[10px] leading-tight text-muted-foreground">
                      With several tracks selected the AI runs once PER TRACK and saves each one
                      straight away (no Apply step) — same prompt, but the ticks are decided per
                      track.
                    </p>
                  )}
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
                    {!aiUseTrackDesc && (
                      <TriCheckbox
                        label="Description"
                        state={aiInclude.description ? "all" : "none"}
                        onToggle={() => setAiInclude((p) => ({ ...p, description: !p.description }))}
                      />
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={
                        aiPromptBusy ||
                        (!aiUseTrackDesc && !aiPrompt.trim()) ||
                        !(
                          aiInclude.tags ||
                          aiInclude.collections ||
                          aiInclude.playlists ||
                          aiInclude.categories ||
                          aiInclude.extraTags ||
                          aiInclude.description
                        )
                      }
                      onClick={() =>
                        void (selTracks.length > 1 ? runAiSuggestBatch() : runAiSuggest())
                      }
                      className={`${goldBtnCls} px-3 py-1.5 text-xs`}
                    >
                      {aiPromptBusy
                        ? aiBatch
                          ? `Thinking… ${aiBatch.done}/${aiBatch.total}`
                          : "Thinking…"
                        : "AI Magic"}
                    </button>
                    <span className="font-body text-[10px] leading-tight text-muted-foreground">
                      {selTracks.length > 1
                        ? "Tags and SAVES every selected track, one by one."
                        : "Sets the panels on the right (also unticks what doesn't fit) — review, then press Apply."}
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

      {/* ===== Tags: Use Case / Genre / Mood (any selection) =====
          The panel itself stays ALIVE with no selection (the SHOW buttons
          filter the table and need no tracks picked) — only the ticks go
          inert, via TriCheckbox's toggleDisabled. */}
      <aside className={panelColCls}>
        <p className="font-body text-[10px] font-bold uppercase tracking-[0.24em] text-[#F4C430]">
          Tags{selTracks.length > 1 ? ` · ${selTracks.length} tracks` : ""}
        </p>
        {FACETS.map(({ key, label }) => (
          <div key={key} className="border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
            <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,max-content))] gap-x-5 gap-y-1">
              {vocabularies[key].map((opt) => {
                const showActive =
                  tagFilter?.kind === "facet" && tagFilter.key === key && tagFilter.option === opt;
                return (
                  <TriCheckbox
                    key={opt}
                    label={opt}
                    state={facetDisplay(key, opt)}
                    onToggle={() => void toggleFacet(key, opt)}
                    count={facetCounts[key].get(opt.trim().toLowerCase()) ?? 0}
                    onShow={() => setTagFilter(showActive ? null : { kind: "facet", key, option: opt })}
                    showActive={showActive}
                    toggleDisabled={!hasSelection}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* ===== Add to: collections / playlists / categories (any selection) =====
          Alive without a selection too — same deal as the Tags panel. */}
      <aside className={panelColCls}>
        <p className="font-body text-[10px] font-bold uppercase tracking-[0.24em] text-[#F4C430]">
          Add to
        </p>
        {membershipSection("Collections", "collection", collections, collectionDelta, setCollectionDelta)}
        {membershipSection("Playlists", "playlist", playlists, playlistDelta, setPlaylistDelta, playlistSearch, setPlaylistSearch)}
        {membershipSection("Categories", "category", categories, categoryDelta, setCategoryDelta)}
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
