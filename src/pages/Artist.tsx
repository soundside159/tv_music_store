import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList, TrackRowSkeletonList } from "@/components/TrackRowPlayer";
import { useTracks } from "@/hooks/useTracks";
import { interleaveByComposerRecency } from "@/lib/catalogSort";
import { useComposers, useContentReady } from "@/hooks/useContent";

/**
 * Public composer page: /artist/<slug>. The nick (composers.display_name) and
 * the "about" text (composers.bio) come from Admin -> Users; the track list is
 * every live catalog track whose artist is this composer — clicking "by <nick>"
 * under any track title lands here.
 */
const Artist = () => {
  const { slug } = useParams();
  const composers = useComposers();
  const ready = useContentReady();
  const { tracks, isLoading } = useTracks();

  const composer = composers.find((c) => c.slug === slug);
  // Newest → oldest by this composer's import_no (bigger = newer); tracks with no
  // index fall to the bottom by upload date. The list used to render in raw API
  // order, which looked random (e.g. #7 above #345). One composer here, so the
  // chess-board interleave collapses to a plain newest-first sort.
  const artistTracks = interleaveByComposerRecency(tracks.filter((t) => t.artistSlug === slug));

  if (!ready) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
          <div className="h-9 w-64 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded bg-white/[0.04]" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!composer) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
          <h1 className="text-2xl text-foreground">Artist not found</h1>
          <Link to="/" className="mt-4 font-body text-sm text-[#F4C430] hover:underline">
            Back to home
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-24 sm:px-6 md:pt-28">
        {/* Nick + about text only — no avatar, no stats (owner request). */}
        <header className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {composer.displayName}
          </h1>
          {composer.bio && (
            <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
              {composer.bio}
            </p>
          )}
        </header>

        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-foreground md:text-2xl">Tracks</h2>
            <Link
              to="/catalog"
              className="inline-flex items-center gap-1 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
            >
              Open full catalog <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <TrackRowSkeletonList count={6} />
            ) : artistTracks.length > 0 ? (
              <TrackRowList tracks={artistTracks} />
            ) : (
              <p className="rounded-lg border border-border/40 bg-card/25 p-8 text-center font-body text-sm text-muted-foreground">
                No published tracks yet.
              </p>
            )}
          </div>
        </section>

        {/* Held back until the tracks are in: the plaque used to pop in above a
            skeleton list and then get pushed down when the rows arrived. */}
        {!isLoading && (
        <section className="mt-14 animate-fade-in rounded-xl border border-border bg-card p-6 md:flex md:items-center md:justify-between md:p-8">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              License {composer.displayName}'s music
            </h2>
            <p className="mt-2 max-w-lg font-body text-sm text-muted-foreground">
              Every track is covered by our plans — start free with 3 downloads a month. Need
              something written just for your project?
            </p>
          </div>
          <div className="mt-4 flex shrink-0 gap-3 md:mt-0">
            <Link
              to="/pricing"
              className="rounded-lg bg-[#F4C430] px-5 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
            >
              See plans
            </Link>
            <Link
              to="/custom"
              className="rounded-lg border border-[#F4C430]/70 px-5 py-2.5 font-body text-sm font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background"
            >
              Custom music
            </Link>
          </div>
        </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Artist;
