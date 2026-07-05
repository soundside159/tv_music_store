import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { usePlaylists } from "@/hooks/useContent";

const Playlists = () => {
  const mockPlaylists = usePlaylists();
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

      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {mockPlaylists.map((p) => (
          <Link
            key={p.id}
            to={`/playlist/${p.slug}`}
            className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-[#F4C430]/60"
          >
            <div className="aspect-square w-full overflow-hidden">
              <img
                src={p.image}
                alt={p.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="p-3">
              <p className="font-body text-sm font-semibold text-foreground transition-colors group-hover:text-[#F4C430]">
                {p.title}
              </p>
              <p className="font-body text-xs text-muted-foreground">{p.trackIds.length} tracks</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
    <Footer />
  </div>
  );
};

export default Playlists;
