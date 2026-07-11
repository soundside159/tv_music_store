import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Pause, Play, Plus, X } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import CardCarousel from "@/components/CardCarousel";
import { usePlayer } from "@/components/playerContext";
import { useTracks } from "@/hooks/useTracks";
import type { CatalogTrack } from "@/data/catalogTracks";
import { refreshContent, useContentReady, usePlaylists, type LivePlaylist } from "@/hooks/useContent";
import {
  AdminItemBar,
  useAdminDragReorder,
  useContentAdmin,
  type ContentAdmin,
} from "@/components/AdminInlineContent";

// Parallelogram playlist cards (same skew language as the catalog collections
// strip), grouped into THEME sections the owner manages inline: every section
// ends with a ghost "+" card that creates a playlist in that theme, and the
// page ends with "+ New theme". Visitors see none of the admin controls.

const PlaylistCard = ({ playlist, tracks }: { playlist: LivePlaylist; tracks: CatalogTrack[] }) => {
  const { activePlayer, isPlaying, playVersion, progress, playedProgress } = usePlayer();
  // First playable track of the playlist — powers the hover preview play.
  const firstTrack = playlist.trackIds
    .map((id) => tracks.find((t) => t.id === id))
    .find((t) => t && t.audioVersions.length > 0);
  const version = firstTrack?.audioVersions[0];
  const active =
    !!firstTrack && !!version &&
    activePlayer?.trackId === firstTrack.id &&
    activePlayer.versionId === version.id;
  // Progress of THIS playlist's preview track — drawn as a stroke that travels
  // around the card while it plays (same language as the catalog cover ring).
  const trackProgress = active
    ? progress
    : firstTrack && version
      ? playedProgress[`${firstTrack.id}:${version.id}`] ?? 0
      : 0;

  return (
    <Link to={`/playlist/${playlist.slug}`} className="group block">
      <div
        style={{ transform: "skewX(-9deg)" }}
        className="relative h-64 w-full overflow-hidden rounded-lg border border-white/15 bg-white/[0.04] shadow-[inset_0_0_16px_-8px_rgba(255,255,255,0.3)]"
      >
        {playlist.image && (
          <img
            src={playlist.image}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={(event) => {
              event.currentTarget.style.opacity = "1";
            }}
            style={{
              transform: "skewX(9deg) scale(1.32) translateZ(0)",
              backfaceVisibility: "hidden",
              opacity: 0,
              transition: "opacity 0.5s ease",
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        {/* Hover preview: soft darkening + centered play (first track of the list). */}
        {firstTrack && version && (
          <div
            className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity duration-300 ${
              active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playVersion(firstTrack, version);
              }}
              aria-label={active && isPlaying ? `Pause ${playlist.title}` : `Preview ${playlist.title}`}
              style={{ transform: "skewX(9deg)" }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F4C430] text-background shadow-xl transition-transform duration-200 hover:scale-110"
            >
              {active && isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="ml-0.5 h-5 w-5" />
              )}
            </button>
          </div>
        )}
        {/* Progress stroke travelling around the card while its preview plays. */}
        {active && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          >
            <rect
              x="0.6"
              y="0.6"
              width="98.8"
              height="98.8"
              rx="4"
              pathLength={100}
              stroke="#F4C430"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="100"
              strokeDashoffset={100 - Math.max(0, Math.min(100, trackProgress * 100))}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        <div style={{ transform: "skewX(9deg)" }} className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          <h3 className="font-display text-lg font-semibold leading-tight text-white transition-colors group-hover:text-[#F4C430]">
            {playlist.title}
          </h3>
          <p className="mt-1 font-body text-xs text-white/60">{playlist.trackIds.length} tracks</p>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="block h-px w-[70px] bg-gradient-to-r from-[#F4C430]/80 to-[#F4C430]/0" />
            <span className="font-body text-white/50 transition-colors group-hover:text-[#F4C430]">→</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

/** Pulsing parallelogram placeholder shown while /api/content loads. */
const SkeletonCard = () => (
  <div
    style={{ transform: "skewX(-9deg)" }}
    className="h-64 w-full animate-pulse rounded-lg border border-white/10 bg-white/[0.05]"
  />
);

/** Admin ghost card: "+" → title input → creates a playlist in this theme. */
const GhostCreateCard = ({ theme, admin }: { theme: string; admin: ContentAdmin }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  if (!admin.enabled) return null;

  const create = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const res = await admin.call({ action: "upsert_playlist", title: t, theme });
    if (!res || typeof res.id !== "string") {
      setBusy(false);
      return;
    }
    toast.success(`Playlist "${t}" created — add a cover and tracks`);
    // Stay on THIS page (owner request) — the new card pops into its theme.
    await refreshContent();
    await admin.reload();
    setBusy(false);
    setTitle("");
    setOpen(false);
  };

  return (
    <div
      style={{ transform: "skewX(-9deg)" }}
      className="flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-[#F4C430]/40 bg-[#F4C430]/[0.03] transition-colors hover:border-[#F4C430]/70"
    >
      <div style={{ transform: "skewX(9deg)" }} className="w-full px-4 text-center">
        {open ? (
          <div className="flex flex-col items-center gap-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Playlist title"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                aria-label="Create playlist"
                className="text-[#F4C430] transition-colors hover:opacity-80 disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cancel"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {busy && <span className="font-body text-[10px] text-muted-foreground">Creating…</span>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full flex-col items-center gap-2 py-8 text-[#F4C430]/70 transition-colors hover:text-[#F4C430]"
          >
            <Plus className="h-8 w-8" />
            <span className="font-body text-xs font-semibold">
              New playlist{theme ? ` in ${theme}` : ""}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

/** Admin: "+ New theme" — adds an empty section (saved once a playlist joins it). */
const NewThemeButton = ({
  admin,
  onCreate,
}: {
  admin: ContentAdmin;
  onCreate: (theme: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!admin.enabled) return null;

  const create = () => {
    const t = name.trim();
    if (!t) return;
    onCreate(t);
    setName("");
    setOpen(false);
  };

  return (
    <div className="mt-14 flex justify-center">
      {open ? (
        <span className="inline-flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Theme name (e.g. Podcast)"
            className="w-56 rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
          />
          <button type="button" onClick={create} aria-label="Add theme" className="text-[#F4C430]">
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cancel"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#F4C430]/40 px-6 py-3 font-body text-sm font-semibold text-[#F4C430]/80 transition-colors hover:border-[#F4C430]/70 hover:text-[#F4C430]"
        >
          <Plus className="h-4 w-4" />
          New theme
        </button>
      )}
    </div>
  );
};

const Playlists = () => {
  const playlists = usePlaylists();
  const ready = useContentReady();
  const { tracks } = useTracks();
  const admin = useContentAdmin();
  const { dragProps, dragClass } = useAdminDragReorder("playlist", admin);
  // Freshly created (still empty) theme sections — they live in the DB only
  // once a playlist is created inside them.
  const [draftThemes, setDraftThemes] = useState<string[]>([]);

  // Group by theme, keeping the global (drag-sorted) order: themeless first,
  // then each theme section in order of first appearance, then empty drafts.
  const sections: { theme: string; items: LivePlaylist[] }[] = [];
  for (const p of playlists) {
    const theme = p.theme.trim();
    const existing = sections.find((s) => s.theme === theme);
    if (existing) existing.items.push(p);
    else sections.push({ theme, items: [p] });
  }
  sections.sort((a, b) => (a.theme === "" ? -1 : b.theme === "" ? 1 : 0));
  // Persisted theme names (admin; survive F5 even while empty) + local drafts.
  for (const t of [...(admin.data?.playlistThemes ?? []), ...draftThemes]) {
    if (!sections.some((s) => s.theme.toLowerCase() === t.toLowerCase())) {
      sections.push({ theme: t, items: [] });
    }
  }
  if (sections.length === 0) sections.push({ theme: "", items: [] });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
          Discover
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Playlists
        </h1>
        <p className="mt-3 max-w-lg font-body text-sm leading-6 text-white/55">
          Handpicked playlists for your exact use case.
        </p>

        {!ready ? (
          <div className="mt-10">
            <CardCarousel>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </CardCarousel>
          </div>
        ) : (
          <>
            {sections
              .filter((section) => section.theme || section.items.length > 0)
              .map((section) => (
              <section key={section.theme || "__general"} className="mt-12">
                {section.theme && (
                  <h2 className="mb-6 font-display text-2xl font-semibold text-white">
                    {section.theme}
                  </h2>
                )}
                <CardCarousel>
                  {section.items.map((p) => (
                    <div key={p.id} {...dragProps(p.id)} className={dragClass(p.id)}>
                      <PlaylistCard playlist={p} tracks={tracks} />
                      <AdminItemBar kind="playlist" id={p.id} admin={admin} />
                    </div>
                  ))}
                  {/* Playlists are created INSIDE a theme only (owner rule). */}
                  {section.theme && <GhostCreateCard key="__ghost" theme={section.theme} admin={admin} />}
                </CardCarousel>
              </section>
            ))}
            <NewThemeButton
              admin={admin}
              onCreate={(theme) => {
                setDraftThemes((prev) => [...prev, theme]);
                // Persist the name so the empty theme survives a refresh.
                const stored = admin.data?.playlistThemes ?? [];
                if (!stored.some((x) => x.toLowerCase() === theme.toLowerCase())) {
                  void admin
                    .run({ action: "set_playlist_themes", values: [...stored, theme] })
                    .then((ok) => {
                      if (ok) void admin.reload();
                    });
                }
              }}
            />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Playlists;
