import { Link, useNavigate, useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList } from "@/components/TrackRowPlayer";
import { useCollections } from "@/hooks/useContent";
import { useTracks } from "@/hooks/useTracks";
import {
  AdminCoverControl,
  AdminDeleteItemButton,
  AdminEditableText,
  makeRemoveTrackHandler,
  useContentAdmin,
} from "@/components/AdminInlineContent";

const CollectionDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const musicCollections = useCollections();
  const { tracks: allTracks, reload: reloadTracks } = useTracks();
  // Inline admin editing: click title/description, hover cover, X on rows.
  const admin = useContentAdmin();
  const collection = musicCollections.find((c) => c.id === slug);
  const tracks = collection
    ? allTracks.filter((t) => t.collectionIds.includes(collection.id))
    : [];

  if (!collection) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
          <h1 className="text-2xl text-foreground">Collection not found</h1>
          <Link to="/collections" className="mt-4 font-body text-sm text-[#F4C430] hover:underline">
            All collections
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  // Collection rows come from /api/tracks (collectionIds), so refetch it too.
  const adminRemove = makeRemoveTrackHandler("collection", collection.id, admin, () =>
    void reloadTracks(),
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <AdminCoverControl
            kind="collection"
            id={collection.id}
            admin={admin}
            className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-border"
          >
            <img src={collection.image} alt={collection.shortTitle} className="h-full w-full object-cover" />
          </AdminCoverControl>
          <div className="min-w-0">
            <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
              Collection
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              <AdminEditableText
                kind="collection"
                id={collection.id}
                admin={admin}
                field="title"
                value={collection.title}
                className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl"
              />
            </h1>
            <p className="mt-2 max-w-xl font-body text-sm leading-6 text-white/55">
              <AdminEditableText
                kind="collection"
                id={collection.id}
                admin={admin}
                field="description"
                value={collection.description}
                multiline
                className="font-body text-sm leading-6 text-white/55"
                placeholder="Click to add a description…"
              />
            </p>
            <p className="mt-2 font-body text-xs text-muted-foreground">
              {tracks.length} tracks · Royalty-free · Claim-safe
            </p>
            <AdminDeleteItemButton
              kind="collection"
              id={collection.id}
              admin={admin}
              onDeleted={() => navigate("/collections")}
            />
          </div>
        </div>

        <div className="mt-8">
          {tracks.length > 0 ? (
            <TrackRowList tracks={tracks} adminRemove={adminRemove} />
          ) : (
            <p className="font-body text-sm text-muted-foreground">
              Tracks for this collection are on the way.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CollectionDetail;
