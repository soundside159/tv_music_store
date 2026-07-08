import { Link, useNavigate, useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList } from "@/components/TrackRowPlayer";
import type { CatalogTrack } from "@/data/catalogTracks";
import { usePlaylists } from "@/hooks/useContent";
import { useTracks } from "@/hooks/useTracks";
import {
  AdminCoverControl,
  AdminDeleteItemButton,
  AdminEditableText,
  makeRemoveTrackHandler,
  useContentAdmin,
} from "@/components/AdminInlineContent";

const PlaylistDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const playlists = usePlaylists();
  const { tracks: allTracks } = useTracks();
  // Inline admin editing: click title/description, hover cover, X on rows.
  const admin = useContentAdmin();
  const playlist = playlists.find((p) => p.slug === slug || p.id === slug);
  const tracks = playlist
    ? playlist.trackIds
        .map((id) => allTracks.find((t) => t.id === id))
        .filter((t): t is CatalogTrack => Boolean(t))
    : [];

  if (!playlist) {
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
          <AdminCoverControl
            kind="playlist"
            id={playlist.id}
            admin={admin}
            className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-border"
          >
            <img src={playlist.image} alt={playlist.title} className="h-full w-full object-cover" />
          </AdminCoverControl>
          <div className="min-w-0">
            <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
              Playlist
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
