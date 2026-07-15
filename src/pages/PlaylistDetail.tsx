import { Link, useNavigate, useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList, TrackRowSkeletonList } from "@/components/TrackRowPlayer";
import type { CatalogTrack } from "@/data/catalogTracks";
import { useContentReady, usePlaylists } from "@/hooks/useContent";
import { useTracks } from "@/hooks/useTracks";
import {
  AdminCoverControl,
  AdminDeleteItemButton,
  AdminEditableText,
  makeRemoveTrackHandler,
  useContentAdmin,
} from "@/components/AdminInlineContent";

/** Loading skeleton — shown until /api/content answers (no "not found" flash). */
const DetailSkeleton = () => (
  <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
    <div className="flex flex-col gap-6 md:flex-row md:items-center">
      <div
        style={{ transform: "skewX(-9deg)" }}
        className="skew-aa ml-2 h-40 w-40 shrink-0 animate-pulse rounded-xl border border-white/10 bg-white/[0.05]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="h-3 w-24 animate-pulse rounded bg-white/[0.07]" />
        <div className="h-8 w-64 animate-pulse rounded bg-white/[0.09]" />
        <div className="h-3 w-96 max-w-full animate-pulse rounded bg-white/[0.06]" />
      </div>
    </div>
    <div className="mt-8 flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg border border-white/5 bg-white/[0.04]" />
      ))}
    </div>
  </main>
);

const PlaylistDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const playlists = usePlaylists();
  const ready = useContentReady();
  const { tracks: allTracks, isLoading: tracksLoading } = useTracks();
  // Inline admin editing: click title/description, hover cover, X on rows.
  const admin = useContentAdmin();
  const playlist = playlists.find((p) => p.slug === slug || p.id === slug);
  const tracks = playlist
    ? playlist.trackIds
        .map((id) => allTracks.find((t) => t.id === id))
        .filter((t): t is CatalogTrack => Boolean(t))
    : [];

  if (!playlist) {
    // Still loading — show the skeleton, not a premature "not found".
    if (!ready) {
      return (
        <div className="min-h-screen bg-background">
          <Navigation />
          <DetailSkeleton />
          <Footer />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
          <h1 className="text-2xl text-foreground">Playlist not found</h1>
          <Link to="/playlists" className="mt-4 font-body text-sm text-[#F4C430] hover:underline">
            All playlists
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const adminRemove = makeRemoveTrackHandler("playlist", playlist.id, admin);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          {/* Parallelogram cover — same skew language as the playlist cards. */}
          <div className="ml-2 shrink-0">
            <AdminCoverControl
              kind="playlist"
              id={playlist.id}
              admin={admin}
              className="skew-aa h-40 w-40 overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] [transform:skewX(-9deg)]"
            >
              {playlist.image ? (
                <img
                  src={playlist.image}
                  alt={playlist.title}
                  onLoad={(event) => {
                    event.currentTarget.style.opacity = "1";
                  }}
                  style={{
                    transform: "skewX(9deg) scale(1.32) translateZ(0)",
                    backfaceVisibility: "hidden",
                    opacity: 0,
                    transition: "opacity 0.4s ease",
                  }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-white/[0.04]" />
              )}
            </AdminCoverControl>
          </div>
          <div className="min-w-0">
            <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
              {playlist.theme ? `Playlist · ${playlist.theme}` : "Playlist"}
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              <AdminEditableText
                kind="playlist"
                id={playlist.id}
                admin={admin}
                field="title"
                value={playlist.title}
                className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl"
              />
            </h1>
            <p className="mt-2 max-w-xl font-body text-sm leading-6 text-white/55">
              <AdminEditableText
                kind="playlist"
                id={playlist.id}
                admin={admin}
                field="description"
                value={playlist.description}
                multiline
                className="font-body text-sm leading-6 text-white/55"
                placeholder="Click to add a description…"
              />
            </p>
            <p className="mt-2 font-body text-xs text-muted-foreground">
              {tracks.length} tracks · Royalty-free · Claim-safe
            </p>
            <AdminDeleteItemButton
              kind="playlist"
              id={playlist.id}
              admin={admin}
              onDeleted={() => navigate("/playlists")}
            />
          </div>
        </div>

        <div className="mt-8">
          {tracks.length > 0 ? (
            <TrackRowList tracks={tracks} adminRemove={adminRemove} />
          ) : tracksLoading ? (
            /* The catalog is still on its way — placeholder rows the exact
               height of real ones, so nothing jumps when they land. */
            <TrackRowSkeletonList count={8} />
          ) : (
            <p className="font-body text-sm text-muted-foreground">
              Tracks for this playlist are on the way.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PlaylistDetail;
