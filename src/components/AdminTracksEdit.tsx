import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flame, Minus, Music, Pause, Pencil, Play, Search, X } from "lucide-react";
import WaveformPreview from "@/components/WaveformPreview";
import { usePlayer } from "@/components/playerContext";
import { splitFilterValues } from "@/components/TrackRowPlayer";
import { genreOptions, moodOptions, useCaseOptions } from "@/lib/tagOptions";
import type { CatalogTrack } from "@/data/catalogTracks";

// Admin -> Content -> "Tracks Edit": bulk track editor (tunetank-style).
// Select tracks with checkboxes -> "Edit Selected" opens a RIGHT side panel
// with tri-state checkboxes for Usage / Mood / Genre, playlist & collection
// membership and a Trending radio. Mixed values across the selection show as
// a gold dash; click cycles mixed -> off (remove from all) -> on (add to all).

export interface ContentItemLite {
  id: string;
  title: string;
  trackIds: string[];
}

type TriState = "all" | "none" | "mixed";
type FacetKey = "useCase" | "genre" | "mood";
type SortMode = "default" | "az" | "za";

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";
const btnCls =
  "rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:pointer-events-none disabled:opacity-50";
const goldBtnCls =
  "rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50";

const FACETS: Array<{ key: FacetKey; label: string; options: string[] }> = [
  { key: "useCase", label: "Usage", options: useCaseOptions },
  { key: "mood", label: "Mood", options: moodOptions },
  { key: "genre", label: "Genre", options: genreOptions },
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
    className="flex min-w-0 items-center gap-2 py-0.5 text-left"
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
}

const AdminTracksEdit = ({
  tracks,
  collections,
  playlists,
  trending,
  disabled,
  busy,
  uploading,
  run,
  uploadCover,
  onApplyOverrides,
}: {
  tracks: CatalogTrack[];
  collections: ContentItemLite[];
  playlists: ContentItemLite[];
  trending: string[];
  disabled: boolean;
  busy: boolean;
  uploading: boolean;
  run: (payload: Record<string, unknown>, okMsg: string) => Promise<boolean>;
  uploadCover: (file: File, apply: (path: string) => void) => Promise<void> | void;
  onApplyOverrides: (overrides: Record<string, Partial<CatalogTrack>>) => void;
}) => {
  const player = usePlayer();

  // --- toolbar / table state ---
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("all");
  const [sort, setSort] = useState<SortMode>("az");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  // --- panel pending changes ---
  const [facetChanges, setFacetChanges] = useState<Record<FacetKey, Record<string, "all" | "none">>>({
    useCase: {},
    genre: {},
    mood: {},
  });
  const [playlistDelta, setPlaylistDelta] = useState<Record<string, "all" | "none">>({});
  const [collectionDelta, setCollectionDelta] = useState<Record<string, "all" | "none">>({});
  const [trendingChange, setTrendingChange] = useState<"add" | "remove" | "none">("none");
  const [fields, setFields] = useState<SingleFields | null>(null);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");

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
    if (sort === "az") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "za") list = [...list].sort((a, b) => b.title.localeCompare(a.title));
    return list;
  }, [tracks, search, composer, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selTracks = useMemo(() => tracks.filter((t) => selectedSet.has(t.id)), [tracks, selectedSet]);

  const collectionCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of collections) for (const id of c.trackIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [collections]);
  const playlistCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of playlists) for (const id of p.trackIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [playlists]);

  // Reset pending changes whenever the selection itself changes.
  const selectionKey = selected.join("|");
  useEffect(() => {
    setFacetChanges({ useCase: {}, genre: {}, mood: {} });
    setPlaylistDelta({});
    setCollectionDelta({});
    setTrendingChange("none");
    if (selected.length === 1) {
      const t = tracks.find((x) => x.id === selected[0]);
      setFields(
        t
          ? {
              title: t.title,
              bpm: t.bpm ? String(t.bpm) : "",
              description: t.description,
              cover: t.cover ?? "",
              tags: t.tags.join(", "),
            }
          : null,
      );
    } else {
      setFields(null);
    }
    if (selected.length === 0) setPanelOpen(false);
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

  const dirty =
    trendingChange !== "none" ||
    Object.values(facetChanges).some((m) => Object.keys(m).length > 0) ||
    Object.keys(playlistDelta).length > 0 ||
    Object.keys(collectionDelta).length > 0 ||
    (fields !== null &&
      selTracks.length === 1 &&
      (fields.title !== selTracks[0].title ||
        fields.bpm !== (selTracks[0].bpm ? String(selTracks[0].bpm) : "") ||
        fields.description !== selTracks[0].description ||
        fields.cover !== (selTracks[0].cover ?? "") ||
        fields.tags !== selTracks[0].tags.join(", ")));

  const resetChanges = () => {
    setFacetChanges({ useCase: {}, genre: {}, mood: {} });
    setPlaylistDelta({});
    setCollectionDelta({});
    setTrendingChange("none");
    if (selTracks.length === 1) {
      const t = selTracks[0];
      setFields({
        title: t.title,
        bpm: t.bpm ? String(t.bpm) : "",
        description: t.description,
        cover: t.cover ?? "",
        tags: t.tags.join(", "),
      });
    }
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

    const singleFields =
      fields && selTracks.length === 1
        ? {
            title: fields.title,
            bpm: fields.bpm ? Number(fields.bpm) : undefined,
            description: fields.description,
            cover: fields.cover,
            tags: fields.tags.split(",").map((s) => s.trim()).filter(Boolean),
          }
        : undefined;

    const ok = await run(
      {
        action: "bulk_update_tracks",
        trackIds: selected,
        facets: Object.keys(facets).length ? facets : undefined,
        playlistChanges:
          playlistChanges.add.length || playlistChanges.remove.length ? playlistChanges : undefined,
        collectionChanges:
          collectionChanges.add.length || collectionChanges.remove.length
            ? collectionChanges
            : undefined,
        trendingChange: trendingChange === "none" ? undefined : trendingChange,
        fields: singleFields,
      },
      selected.length === 1 ? "Track updated" : `${selected.length} tracks updated`,
    );
    if (!ok) return;

    // Mirror the server result locally (facets + single fields) so the table
    // updates without refetching /api/tracks. Collections / playlists /
    // trending refresh via the parent reload().
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
      if (singleFields) {
        if (singleFields.title.trim()) o.title = singleFields.title.trim();
        if (singleFields.bpm !== undefined) o.bpm = singleFields.bpm;
        o.description = singleFields.description;
        o.cover = singleFields.cover || undefined;
        o.tags = singleFields.tags;
      }
      if (Object.keys(o).length > 0) overrides[t.id] = o;
    }
    if (Object.keys(overrides).length > 0) onApplyOverrides(overrides);
    setFacetChanges({ useCase: {}, genre: {}, mood: {} });
    setPlaylistDelta({});
    setCollectionDelta({});
    setTrendingChange("none");
  };

  // --- selection ---
  const toggleTrack = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const pageState: TriState = (() => {
    const n = paged.filter((t) => selectedSet.has(t.id)).length;
    return n === 0 ? "none" : n === paged.length ? "all" : "mixed";
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
    searchValue: string,
    setSearchValue: (v: string) => void,
  ) => (
    <div className="border-t border-border/60 pt-4">
      <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {items.length > 6 && (
        <input
          placeholder={`Search ${title.toLowerCase()}...`}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className={`${inputCls} mb-2 w-full py-1.5 text-xs`}
        />
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
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
          <p className="col-span-2 font-body text-xs text-muted-foreground">None yet.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="mt-5">
      {/* Toolbar */}
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
            className={`${inputCls} w-56 pl-9`}
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
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className={inputCls}
          aria-label="Sort tracks"
        >
          <option value="az">Sort by: Title A-Z</option>
          <option value="za">Sort by: Title Z-A</option>
          <option value="default">Sort by: Default</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          {selected.length > 0 && (
            <span className="font-body text-sm text-muted-foreground">{selected.length} selected</span>
          )}
          <button
            type="button"
            disabled={disabled || selected.length === 0}
            onClick={() => setPanelOpen(true)}
            className={`${goldBtnCls} flex items-center gap-2 disabled:pointer-events-none`}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Selected
          </button>
        </div>
      </div>

      {disabled && (
        <p className="mt-3 font-body text-sm text-amber-400/90">
          The catalog is still served from bundled mock data — load the demo catalog into the
          database first, then edits here will stick.
        </p>
      )}

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-border/60">
        <div className="min-w-[46rem]">
          <div className="grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_8rem_4.5rem_5.5rem_5rem_5rem] items-center gap-2 border-b border-border/60 bg-secondary/40 px-3 py-2.5">
            <span className="flex justify-center">
              <RowCheckbox state={pageState} onToggle={togglePage} label="Select all on page" />
            </span>
            <span />
            <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">Track</span>
            <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">Composer</span>
            <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">Duration</span>
            <span className="text-center font-body text-xs uppercase tracking-wide text-muted-foreground">Collections</span>
            <span className="text-center font-body text-xs uppercase tracking-wide text-muted-foreground">Playlists</span>
            <span className="text-center font-body text-xs uppercase tracking-wide text-muted-foreground">Trending</span>
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
                className={`grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_8rem_4.5rem_5.5rem_5rem_5rem] items-center gap-2 border-b border-border/40 px-3 py-2 transition-colors last:border-b-0 ${
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
                    <p
                      className={`truncate font-body text-sm font-medium ${
                        active ? "text-[#F4C430]" : "text-foreground"
                      }`}
                    >
                      {t.title}
                    </p>
                    {version && (
                      <WaveformPreview
                        active={active}
                        bars={200}
                        durationRatio={1}
                        onSeek={(p) => player.playVersion(t, version, p)}
                        progress={versionProgress(t, version.id)}
                        src={version.src}
                        className="mt-0.5 hidden h-5 max-w-[16rem] md:block"
                      />
                    )}
                  </div>
                </div>

                <span className="truncate font-body text-xs text-muted-foreground">{t.artist}</span>
                <span className="font-body text-xs tabular-nums text-muted-foreground">{t.duration}</span>
                <span className="text-center font-body text-xs tabular-nums text-muted-foreground">
                  {collectionCount.get(t.id) ?? 0}
                </span>
                <span className="text-center font-body text-xs tabular-nums text-muted-foreground">
                  {playlistCount.get(t.id) ?? 0}
                </span>
                <span className="flex justify-center">
                  {trending.includes(t.id) ? (
                    <Flame className="h-4 w-4 text-[#F4C430]" />
                  ) : (
                    <span className="font-body text-xs text-muted-foreground/50">—</span>
                  )}
                </span>
              </div>
            );
          })}
          {paged.length === 0 && (
            <p className="px-4 py-6 font-body text-sm text-muted-foreground">No tracks match.</p>
          )}
        </div>
      </div>

      {/* Pagination */}
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
            {[10, 20, 50].map((n) => (
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

      {/* Right side panel */}
      {panelOpen && selTracks.length > 0 && (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-[22rem] flex-col border-l border-border bg-card shadow-2xl sm:w-[24rem]">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <h3 className="font-body text-lg font-semibold text-foreground">
              {selTracks.length === 1 ? `Edit: ${selTracks[0].title}` : `Edit ${selTracks.length} Tracks`}
            </h3>
            <button
              type="button"
              aria-label="Close editor"
              onClick={() => setPanelOpen(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
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
                    className={`${inputCls} w-24`}
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
                  rows={2}
                  value={fields.description}
                  onChange={(e) => setFields({ ...fields, description: e.target.value })}
                  className={inputCls}
                />
                <div className="flex items-center gap-2.5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-secondary">
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
              </div>
            )}

            {FACETS.map(({ key, label, options }) => (
              <div key={key} className="mb-4 border-t border-border/60 pt-4 first:mt-0 first:border-t-0 first:pt-0">
                <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {options.map((opt) => (
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

            {membershipSection("Playlists", playlists, playlistDelta, setPlaylistDelta, playlistSearch, setPlaylistSearch)}
            <div className="mt-4">
              {membershipSection("Collections", collections, collectionDelta, setCollectionDelta, collectionSearch, setCollectionSearch)}
            </div>

            <div className="mt-4 border-t border-border/60 pt-4">
              <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Trending
              </p>
              {(
                [
                  ["add", "Add to Trending"],
                  ["remove", "Remove from Trending"],
                  ["none", "No Change"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTrendingChange(value)}
                  className="flex items-center gap-2 py-0.5"
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                      trendingChange === value ? "border-[#F4C430]" : "border-border"
                    }`}
                  >
                    {trendingChange === value && <span className="h-2 w-2 rounded-full bg-[#F4C430]" />}
                  </span>
                  <span className="font-body text-xs text-foreground/90">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 border-t border-border/60 px-5 py-4">
            <button type="button" disabled={!dirty || busy} onClick={resetChanges} className={btnCls}>
              Reset Changes
            </button>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => void applyChanges()}
              className={`${goldBtnCls} flex-1`}
            >
              {busy ? "Applying..." : "Apply Changes"}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};

export default AdminTracksEdit;
