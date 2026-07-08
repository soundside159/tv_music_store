import { TrackRowList } from "@/components/TrackRowPlayer";
import { useTracks } from "@/hooks/useTracks";
import { useFavourites } from "@/lib/favourites";

// Account -> Favourites. The tracks the user hearted, with full playback.
const FavouritesSection = () => {
  const favIds = useFavourites();
  const { tracks } = useTracks();
  const favTracks = tracks.filter((t) => favIds.has(t.id));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Favourites</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Tracks you've hearted — play, download or license them anytime.
        </p>
      </div>

      {favTracks.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">
          No favourites yet — tap the heart on any track and it'll show up here.
        </p>
      ) : (
        <TrackRowList tracks={favTracks} />
      )}
    </div>
  );
};

export default FavouritesSection;
