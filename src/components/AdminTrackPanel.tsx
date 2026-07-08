import { useCallback, useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Check, ChevronDown, Music2, Pause, Play, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { CatalogTrack } from "@/data/catalogTracks";
import { splitFilterValues } from "@/components/TrackRowPlayer";
import WaveformPreview from "@/components/WaveformPreview";
import { usePlayer } from "@/components/playerContext";
import type { Vocabularies } from "@/lib/tagOptions";

// Admin-only side panels for the public track page (/track/:slug).
// LEFT: toggle the track's Use Case / Genre / Mood values + a Trending box
//       (add this track, reorder with arrows — same list as the homepage).
// RIGHT: Collections & Playlists with a plus / green check per item.
// Customers never see these — TrackDetail renders them only for role=admin,
// and every call goes through the admin-gated /api/admin/content API.

const GOLD = "#F4C430";

export interface AdminContentItem {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  image?: string;
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

  const run = useCallback(async (payload: RunPayload): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(e.error ?? "Save failed");
        return false;
      }
      return true;
    } catch {
      toast.error("Network error");
      return false;
    }
  }, []);

  return { data, setData, run, reload: load };
};

const PanelShell = ({ children }: { children: ReactNode }) => (
  <aside className="h-fit rounded-xl border border-[#F4C430]/30 bg-card p-4 xl:sticky xl:top-24">
    <p className="mb-3 font-body text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: GOLD }}>
      Admin
    </p>
    {children}
  </aside>
);

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
        {trendingIndex === -1 && (
          <button
            type="button"
            onClick={() => void saveTrending([...data.trending, track.id])}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#F4C430]/50 py-1.5 font-body text-xs font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430]/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Add this track
          </button>
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
            {item.image ? (
              <img src={item.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-background/60">
                <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            )}
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
