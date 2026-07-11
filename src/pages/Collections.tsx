import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useCollections, useContentReady } from "@/hooks/useContent";
import {
  AdminAddItem,
  AdminItemBar,
  useAdminDragReorder,
  useContentAdmin,
} from "@/components/AdminInlineContent";

const Collections = () => {
  const musicCollections = useCollections();
  const ready = useContentReady();
  // Inline admin editing (rename/delete/add + drag to reorder) — admins only.
  const admin = useContentAdmin();
  const { dragProps, dragClass } = useAdminDragReorder("collection", admin);
  return (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
      <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
        Discover
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Collections
        </h1>
        <AdminAddItem kind="collection" admin={admin} />
      </div>
      <p className="mt-3 max-w-lg font-body text-sm leading-6 text-white/55">
        Curated groups of the catalog by style and genre.
      </p>

      {!ready ? (
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] w-full animate-pulse rounded-xl border border-white/10 bg-white/[0.05]"
            />
          ))}
        </div>
      ) : (
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {musicCollections.map((c) => (
          <div key={c.id} {...dragProps(c.id)} className={dragClass(c.id)}>
            <Link
              to={`/collection/${c.id}`}
              className="group block overflow-hidden rounded-xl border border-border bg-card"
            >
              {/* transform-gpu + hidden backface + will-change kill the sub-pixel
                  "jump" at the start/end of the hover zoom. */}
              <div className="aspect-[4/3] w-full overflow-hidden">
                {c.image ? (
                  <img
                    src={c.image}
                    alt={c.shortTitle}
                    loading="lazy"
                    className="h-full w-full transform-gpu object-cover transition-transform duration-700 ease-out will-change-transform [backface-visibility:hidden] group-hover:scale-[1.06]"
                  />
                ) : (
                  <div className="h-full w-full bg-white/[0.04]" />
                )}
              </div>
              <div className="p-3">
                <p className="font-body text-sm font-semibold text-foreground transition-colors group-hover:text-[#F4C430]">
                  {c.shortTitle}
                </p>
                <p className="font-body text-xs text-muted-foreground">{c.trackCount} tracks</p>
              </div>
            </Link>
            <AdminItemBar kind="collection" id={c.id} admin={admin} />
          </div>
        ))}
      </div>
      )}
    </main>
    <Footer />
  </div>
  );
};

export default Collections;
