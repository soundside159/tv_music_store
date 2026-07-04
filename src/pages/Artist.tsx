import { Link, useParams } from "react-router-dom";
import { ArrowRight, Music2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { catalogTracks } from "@/data/catalogTracks";
import { mockComposers, mockComposerTracks, mockDownloadLog } from "@/mocks";

const GOLD = "#F4C430";

const Artist = () => {
  const { slug } = useParams();
  const composer = mockComposers.find((c) => c.slug === slug);

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

  const tracks = mockComposerTracks.filter((t) => t.composerId === composer.id && t.published);
  const totalDownloads = mockDownloadLog.filter((d) => d.composerId === composer.id).length;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
        <header className="flex flex-col items-start gap-6 md:flex-row md:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-[#F4C430]/40 bg-card">
            <Music2 className="h-10 w-10" style={{ color: GOLD }} />
          </div>
          <div>
            <h1 className="text-3xl text-foreground md:text-4xl">{composer.displayName}</h1>
            <p className="mt-1 font-body text-sm" style={{ color: GOLD }}>
              {composer.styles.join(" · ")}
            </p>
            <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
              {composer.bio}
            </p>
            <p className="mt-3 font-body text-xs text-muted-foreground">
              {composer.trackCount} tracks in catalog · {totalDownloads} downloads
            </p>
          </div>
        </header>

        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xl text-foreground md:text-2xl">Tracks</h2>
            <Link
              to="/catalog"
              className="inline-flex items-center gap-1 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
            >
              Open full catalog <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 divide-y divide-border/60 rounded-xl border border-border bg-card">
            {tracks.map((t) => {
              const real = catalogTracks.find((ct) => ct.title === t.title);
              const row = (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-[#F4C430] group-hover:text-[#F4C430]">
                    <Music2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-body text-sm font-semibold text-foreground transition-colors group-hover:text-[#F4C430]">
                    {t.title}
                  </span>
                  <span className="shrink-0 font-body text-xs text-muted-foreground">
                    {mockDownloadLog.filter((d) => d.trackId === t.id).length} downloads
                  </span>
                </>
              );
              return real ? (
                <Link key={t.id} to={`/track/${real.slug}`} className="group flex items-center gap-4 p-4 transition-colors hover:bg-secondary/40">
                  {row}
                </Link>
              ) : (
                <div key={t.id} className="group flex items-center gap-4 p-4">
                  {row}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-14 rounded-xl border border-border bg-card p-6 md:flex md:items-center md:justify-between md:p-8">
          <div>
            <h2 className="text-xl text-foreground">License {composer.displayName}'s music</h2>
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
      </main>
      <Footer />
    </div>
  );
};

export default Artist;
