import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Minus, Music, Pause, Play, Search, X } from "lucide-react";
import WaveformPreview from "@/components/WaveformPreview";
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
  uploadStems,
  onApplyOverrides,
  onSelectionChange,
  selectionResetKey,
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
  /** Uploads a stems .zip for one track (stores key + flips has_stems on). */
  uploadStems?: (file: File, trackId: string) => Promise<boolean>;
  onApplyOverrides: (overrides: Record<string, Partial<CatalogTrack>>) => void;
  onSelectionChange?: (ids: string[]) => void;
  selectionResetKey?: number;
}) => {
  const player = usePlayer();

  // --- toolbar / table state ---
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("all");
  const [sort, setSort] = useState<SortMode>("default");
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

  const composers = useMemo(
    () => [...new Set(tracks.map((t) => t.artist).filter(Boolean))].sort(),
    [tracks],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tracks.filter(
      (t) =>
        (composer === "all" || t.artist === composer) &&
        (!q || t.title.toLowerCase().includes(q)),
    );
    if (sort === "trending") {
      const set = new Set(trending);
      list = [...list].sort((a, b) => (set.has(b.id) ? 1 : 0) - (set.has(a.id) ? 1 : 0));
    }
    return list;
  }, [tracks, search, composer, sort, trending]);

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
    <div className="border-t border-border/60 pt-4">
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

  return (
    <div className="mt-5 items-start gap-6 xl:grid xl:grid-cols-[minmax(44rem,1fr)_minmax(32rem,1fr)]">
      {/* ===== Left: toolbar + table + pagination ===== */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {disabled && (
          <p className="mt-3 font-body text-sm text-amber-400/90">
            The catalog is still served from bundled mock data — load the demo catalog into the
            database first, then edits here will stick.
          </p>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-border/60">
          <div className="min-w-[44rem]">
            <div className="grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_8rem_4.5rem_5rem] items-center gap-2 border-b border-border/60 bg-secondary/40 px-3 py-2.5">
              <span className="flex justify-center">
                <RowCheckbox state={pageState} onToggle={togglePage} label="Select all visible" />
              </span>
              <span />
              <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">Track</span>
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
              return (
                <div
                  key={t.id}
                  className={`grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_8rem_4.5rem_5rem] items-center gap-2 border-b border-border/40 px-3 py-2 transition-colors last:border-b-0 ${
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
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-secondary">
                      {t.cover ? (
                        <img src={t.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <Music className="h-4 w-4 text-muted-foreground/70" />
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
                        {t.status === "draft" && (
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

      {/* ===== Right: permanent edit panel (sticky column, no overlay) ===== */}
      <aside className="mt-6 flex flex-col rounded-xl border border-border bg-background/40 xl:sticky xl:top-24 xl:mt-0 xl:max-h-[calc(100vh-7rem)]">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3.5">
          <h3 className="font-body text-sm font-semibold text-foreground">
            {!hasSelection
              ? "Edit Tracks"
              : selTracks.length === 1
                ? `Edit: ${selTracks[0].title}`
                : `Edit ${selTracks.length} Tracks`}
          </h3>
          {hasSelection && (
            <button
              type="button"
              aria-label="Clear selection"
              onClick={() => setSelected([])}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!hasSelection ? (
          <p className="px-4 py-6 font-body text-sm text-muted-foreground">
            Select one or more tracks in the table — tags, playlists, collections, categories and
            trending become editable here. A gold dash means the selected tracks have mixed values.
          </p>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {fields && selTracks.length === 1 && (
                <div className="mb-4 flex flex-col gap-2.5">
                  <input
                    placeholder="Title"
                    value={fields.title}
                    onChange={(e) => setFields({ ...fields, title: e.target.value })}
                    className={inputCls}
                  />
                  <div className="flex gap-2.5">
                    <input
                      placeholder="BPM"
                      inputMode="numeric"
                      value={fields.bpm}
                      onChange={(e) => setFields({ ...fields, bpm: e.target.value.replace(/[^0-9]/g, "") })}
                      className={`${inputCls} w-20`}
                    />
                    <input
                      placeholder="Extra tags, comma separated"
                      value={fields.tags}
                      onChange={(e) => setFields({ ...fields, tags: e.target.value })}
                      className={`${inputCls} min-w-0 flex-1`}
                    />
                  </div>
                  <textarea
                    placeholder="Description"
                    rows={5}
                    value={fields.description}
                    onChange={(e) => setFields({ ...fields, description: e.target.value })}
                    className={inputCls}
                  />
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
                  <TriCheckbox
                    label="Includes stems (shown on the track page, Max-plan download)"
                    state={fields.hasStems ? "all" : "none"}
                    onToggle={() => setFields({ ...fields, hasStems: !fields.hasStems })}
                  />
                  {uploadStems && (
                    <label className="flex cursor-pointer items-center gap-2">
                      <span className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]">
                        {uploading ? "Uploading…" : "Upload stems ZIP"}
                      </span>
                      <span className="font-body text-[11px] text-muted-foreground">
                        {selTracks[0].hasStems
                          ? "Stems on — uploading replaces the bundle"
                          : "One .zip with the separated layers"}
                      </span>
                      <input
                        type="file"
                        accept=".zip,application/zip,application/x-zip-compressed"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            void uploadStems(f, selTracks[0].id).then((ok) => {
                              if (ok) setFields((prev) => (prev ? { ...prev, hasStems: true } : prev));
                            });
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              )}

              {FACETS.map(({ key, label }) => (
                <div key={key} className="mb-4 border-t border-border/60 pt-4 first:mt-0 first:border-t-0 first:pt-0">
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

              {membershipSection("Categories", categories, categoryDelta, setCategoryDelta)}
              <div className="mt-4">
                {membershipSection("Playlists", playlists, playlistDelta, setPlaylistDelta, playlistSearch, setPlaylistSearch)}
              </div>
              <div className="mt-4">
                {membershipSection("Collections", collections, collectionDelta, setCollectionDelta)}
              </div>

            </div>

            <div className="flex gap-2 border-t border-border/60 px-4 py-3.5">
              <button type="button" disabled={!dirty || busy} onClick={resetChanges} className={btnCls}>
                Reset
              </button>
              <button
                type="button"
                disabled={!dirty || busy || disabled}
                onClick={() => void applyChanges()}
                className={`${goldBtnCls} flex-1`}
              >
                {busy ? "Applying..." : "Apply Changes"}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};

export default AdminTracksEdit;
