import { useCallback, useEffect, useState } from "react";
import { Music, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { usePlayer } from "@/components/playerContext";
import { useTracks } from "@/hooks/useTracks";
import { splitFilterValues } from "@/components/TrackRowPlayer";
import { genreOptions, moodOptions, useCaseOptions } from "@/lib/tagOptions";
import type { CatalogTrack } from "@/data/catalogTracks";

// Admin -> Content: one place to manage collections, playlists, the homepage
// Trending list AND per-track metadata (tags, cover art), with inline track
// preview (global player). Spec: docs/PAGES_SPEC.md section 4.1.

interface ContentItem {
  id: string;
  title: string;
  shortTitle?: string;
  description: string;
  image: string;
  trackIds: string[];
}

interface ContentData {
  dbTrackCount: number;
  trending: string[];
  collections: ContentItem[];
  playlists: ContentItem[];
}

type Tab = "collections" | "playlists" | "trending" | "tracks";
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

const emptyDraft = { id: "", title: "", shortTitle: "", description: "", image: "", trackIds: [] as string[] };

interface TrackDraft {
  id: string;
  title: string;
  useCase: string[];
  genre: string[];
  mood: string[];
  bpm: string;
  description: string;
  tags: string; // comma-separated in the form
  cover: string;
}

const toTrackDraft = (t: CatalogTrack): TrackDraft => ({
  id: t.id,
  title: t.title,
  useCase: splitFilterValues(t.useCase),
  genre: splitFilterValues(t.genre),
  mood: splitFilterValues(t.mood),
  bpm: t.bpm ? String(t.bpm) : "",
  description: t.description,
  tags: t.tags.join(", "),
  cover: t.cover ?? "",
});

/** Checkbox chip group for Use Case / Genre / Mood vocabularies. */
const TagChips = ({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => (
  <div>
    <p className="mb-1.5 font-body text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? selected.filter((s) => s !== opt) : [...selected, opt])}
            className={`rounded-md border px-2 py-0.5 font-body text-xs transition-colors ${
              active
                ? "border-[#F4C430]/70 bg-[#F4C430]/10 text-[#F4C430]"
                : "border-border text-muted-foreground hover:border-[#F4C430]/50 hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  </div>
);

const AdminContent = () => {
  const { tracks, source: trackSource } = useTracks();
  const [data, setData] = useState<ContentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("collections");
  const [draft, setDraft] = useState<typeof emptyDraft | null>(null);
  const [trendingDraft, setTrendingDraft] = useState<string[] | null>(null);
  const [trackDraft, setTrackDraft] = useState<TrackDraft | null>(null);
  // Saved track edits, merged over the (once-fetched) useTracks list for display.
  const [trackOverrides, setTrackOverrides] = useState<Record<string, Partial<CatalogTrack>>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadCover = async (file: File, apply: (path: string) => void) => {
    setUploading(true);
    try {
      const base = file.name.replace(/\.[^.]+$/, "");
      const res = await fetch(`/api/admin/upload?filename=${encodeURIComponent(base)}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; error?: string };
      if (!res.ok || !d.ok || !d.path) throw new Error(d.error ?? "Upload failed");
      apply(d.path);
      toast.success("Cover uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
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

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(["collections", "playlists", "trending", "tracks"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setDraft(null);
                setTrackDraft(null);
              }}
              className={`rounded-lg px-3 py-1.5 font-body text-sm capitalize transition-colors ${
                tab === t ? "bg-secondary text-[#F4C430]" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
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
      </div>

      {data.dbTrackCount === 0 && (
        <p className="mt-3 font-body text-xs text-muted-foreground">
          The database has no tracks yet — press the gold button once so collections, playlists and
          trending manage real rows (16 tracks, 7 collections).
        </p>
      )}

      {(tab === "collections" || tab === "playlists") && (
        <>
          <ul className="mt-5 divide-y divide-border/60">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-body text-sm font-semibold text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate font-body text-xs text-muted-foreground">
                    {item.trackIds.length} tracks · /{kind === "collection" ? "collections" : "playlists"}/{item.id}
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

          {!draft && (
            <button type="button" className={`mt-4 ${goldBtnCls}`} onClick={() => setDraft({ ...emptyDraft })}>
              New {kind}
            </button>
          )}

          {draft && (
            <form
              className="mt-5 flex flex-col gap-3 rounded-lg border border-border/60 p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const saved = await run(
                  {
                    action: `upsert_${kind}`,
                    id: draft.id || undefined,
                    title: draft.title,
                    shortTitle: draft.shortTitle || undefined,
                    description: draft.description,
                    image: draft.image,
                  },
                  "Saved",
                );
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
        <div className="mt-5 flex flex-col gap-4">
          {trackSource !== "api" && (
            <p className="font-body text-sm text-amber-400/90">
              The catalog is still served from bundled mock data — load the demo catalog into the
              database first, then edits here will stick.
            </p>
          )}
          <ul className="divide-y divide-border/60">
            {mergedTracks.map((t) => (
              <li key={t.id} className="flex items-center gap-4 py-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-secondary">
                  {t.cover ? (
                    <img src={t.cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Music className="h-4 w-4 text-muted-foreground/70" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-sm font-semibold text-foreground">
                    {t.title}
                  </span>
                  <span className="block truncate font-body text-xs text-muted-foreground">
                    {[t.useCase, t.genre, t.mood].filter(Boolean).join(" · ") || "No tags yet"}
                  </span>
                </span>
                <button
                  type="button"
                  className={btnCls}
                  disabled={trackSource !== "api"}
                  onClick={() => setTrackDraft(toTrackDraft(t))}
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>

          {trackDraft && (
            <form
              className="flex flex-col gap-4 rounded-lg border border-border/60 p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const payload = {
                  action: "update_track",
                  id: trackDraft.id,
                  title: trackDraft.title,
                  useCase: trackDraft.useCase.join(" / "),
                  genre: trackDraft.genre.join(" / "),
                  mood: trackDraft.mood.join(" / "),
                  bpm: trackDraft.bpm ? Number(trackDraft.bpm) : undefined,
                  description: trackDraft.description,
                  tags: trackDraft.tags.split(",").map((s) => s.trim()).filter(Boolean),
                  cover: trackDraft.cover,
                };
                const saved = await run(payload, "Track saved");
                if (saved) {
                  setTrackOverrides((prev) => ({
                    ...prev,
                    [trackDraft.id]: {
                      title: payload.title,
                      useCase: payload.useCase,
                      genre: payload.genre,
                      mood: payload.mood,
                      bpm: payload.bpm ?? 0,
                      description: payload.description,
                      tags: payload.tags,
                      cover: payload.cover || undefined,
                    },
                  }));
                  setTrackDraft(null);
                }
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  placeholder="Title"
                  value={trackDraft.title}
                  onChange={(e) => setTrackDraft({ ...trackDraft, title: e.target.value })}
                  className={inputCls}
                />
                <input
                  placeholder="BPM"
                  inputMode="numeric"
                  value={trackDraft.bpm}
                  onChange={(e) =>
                    setTrackDraft({ ...trackDraft, bpm: e.target.value.replace(/[^0-9]/g, "") })
                  }
                  className={inputCls}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-secondary">
                  {trackDraft.cover ? (
                    <img src={trackDraft.cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Music className="h-6 w-6 text-muted-foreground/70" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 gap-2">
                  <input
                    placeholder="Cover URL (1000x1000 recommended) — or press Upload"
                    value={trackDraft.cover}
                    onChange={(e) => setTrackDraft({ ...trackDraft, cover: e.target.value })}
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
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          void uploadCover(f, (path) =>
                            setTrackDraft((prev) => (prev ? { ...prev, cover: path } : prev)),
                          );
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              <TagChips
                label="Use Case"
                options={useCaseOptions}
                selected={trackDraft.useCase}
                onChange={(next) => setTrackDraft({ ...trackDraft, useCase: next })}
              />
              <TagChips
                label="Genre"
                options={genreOptions}
                selected={trackDraft.genre}
                onChange={(next) => setTrackDraft({ ...trackDraft, genre: next })}
              />
              <TagChips
                label="Mood"
                options={moodOptions}
                selected={trackDraft.mood}
                onChange={(next) => setTrackDraft({ ...trackDraft, mood: next })}
              />

              <textarea
                placeholder="Description"
                rows={2}
                value={trackDraft.description}
                onChange={(e) => setTrackDraft({ ...trackDraft, description: e.target.value })}
                className={inputCls}
              />
              <input
                placeholder="Extra tags, comma separated (e.g. Trailer, Dark, Epic)"
                value={trackDraft.tags}
                onChange={(e) => setTrackDraft({ ...trackDraft, tags: e.target.value })}
                className={inputCls}
              />

              <div className="flex gap-2">
                <button type="submit" disabled={busy} className={goldBtnCls}>
                  {busy ? "Saving..." : "Save track"}
                </button>
                <button type="button" className={btnCls} onClick={() => setTrackDraft(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminContent;
