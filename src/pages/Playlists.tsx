import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { usePlaylists, type LivePlaylist } from "@/hooks/useContent";
import {
  AdminAddItem,
  AdminItemBar,
  useAdminDragReorder,
  useContentAdmin,
} from "@/components/AdminInlineContent";

// Parallelogram playlist cards (same skew language as the catalog collections
// strip), grouped into THEME sections ("Featured", "Podcast", …) the owner
// assigns from the admin bar's Tags button. Themeless playlists come first.

const PlaylistCard = ({ playlist }: { playlist: LivePlaylist }) => (
  <Link to={`/playlist/${playlist.slug}`} className="group block">
    <div
      style={{ transform: "skewX(-9deg)" }}
      className="relative h-64 w-full overflow-hidden rounded-lg border border-white/15 bg-white/[0.04] shadow-[inset_0_0_16px_-8px_rgba(255,255,255,0.3)] transition-[border-color] duration-300 group-hover:border-[#F4C430]/60"
    >
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
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
      <div style={{ transform: "skewX(9deg)" }} className="absolute inset-x-0 bottom-0 p-4">
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

const Playlists = () => {
  const playlists = usePlaylists();
  // Inline admin editing (rename/theme/delete/add + drag to reorder).
  const admin = useContentAdmin();
  const { dragProps, dragClass } = useAdminDragReorder("playlist", admin);

  // Group by theme, keeping the global (drag-sorted) order: themeless first,
  // then each theme section in order of first appearance.
  const sections: { theme: string; items: LivePlaylist[] }[] = [];
  for (const p of playlists) {
    const theme = p.theme.trim();
    const existing = sections.find((s) => s.theme === theme);
    if (existing) existing.items.push(p);
    else sections.push({ theme, items: [p] });
  }
  sections.sort((a, b) => (a.theme === "" ? -1 : b.theme === "" ? 1 : 0));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
          Discover
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Playlists
          </h1>
          <AdminAddItem kind="playlist" admin={admin} />
        </div>
        <p className="mt-3 max-w-lg font-body text-sm leading-6 text-white/55">
          Handpicked playlists for your exact use case.
        </p>

        {sections.map((section) => (
          <section key={section.theme || "__general"} className="mt-12">
            {section.theme && (
              <h2 className="mb-6 font-display text-2xl font-semibold text-white">
                {section.theme}
              </h2>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {section.items.map((p) => (
                <div key={p.id} {...dragProps(p.id)} className={dragClass(p.id)}>
                  <PlaylistCard playlist={p} />
                  <AdminItemBar kind="playlist" id={p.id} admin={admin} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
};

export default Playlists;
