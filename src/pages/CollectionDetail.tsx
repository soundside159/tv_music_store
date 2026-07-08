import { Link, useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList } from "@/components/TrackRowPlayer";
import { useCollections } from "@/hooks/useContent";
import { useTracks } from "@/hooks/useTracks";
import { AdminItemEditor, useContentAdmin } from "@/components/AdminInlineContent";

const CollectionDetail = () => {
  const { slug } = useParams();
  const musicCollections = useCollections();
  const { tracks: allTracks, reload: reloadTracks } = useTracks();
  // Inline admin editing (title/description/image, delete, remove tracks).
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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-border">
            <img src={collection.image} alt={collection.shortTitle} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
              Collection
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {collection.title}
            </h1>
            <p className="mt-2 max-w-xl font-body text-sm leading-6 text-white/55">
              {collection.description}
            </p>
            <p className="mt-2 font-body text-xs text-muted-foreground">
              {tracks.length} tracks · Royalty-free · Claim-safe
            </p>
          </div>
        </div>

        <AdminItemEditor
          kind="collection"
          id={collection.id}
          admin={admin}
          tracks={allTracks}
          backTo="/collections"
          onTracksChanged={() => void reloadTracks()}
        />

        <div className="mt-8">
          {tracks.length > 0 ? (
            <TrackRowList tracks={tracks} />
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
