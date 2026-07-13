import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Layers,
  LayoutGrid,
  Library,
  ListMusic,
  Music2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList, TrackRowSkeletonList } from "@/components/TrackRowPlayer";
import { discoverPath } from "@/lib/discovery";
import CardCarousel from "@/components/CardCarousel";
import { useCategories, usePlaylists, useTrendingTracks, useVocabularies } from "@/hooks/useContent";
import type { LivePlaylist } from "@/hooks/useContent";
import { usePlans } from "@/hooks/useMockData";

const GOLD = "#F4C430";

const trustPoints = [
  // NOTE (honesty rule): we promise the REQUEST, not YouTube's outcome — hence
  // "send claims for release", never "claims removed".
  { icon: ShieldCheck, label: "Content ID handled", text: "Add your channel and we send claims on our music for release." },
  { icon: Users, label: "Written by humans", text: "100% human-made music — never AI-generated." },
  { icon: Layers, label: "Stems included", text: "Includes separate stems for easy editing." },
  { icon: Check, label: "License instantly", text: "Clear licenses, PDF certificate right after download." },
];

/** Rows shown in "Trending tracks" — also the number of placeholders reserved. */
const TRENDING_COUNT = 8;

/** "Browse by" — one shelf, four ways in. Categories is the default: it is the
 *  owner's own curation, the other three are the raw tag families. */
type BrowseTab = "categories" | "useCase" | "genre" | "mood";
const BROWSE_TABS: { id: BrowseTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "categories", label: "Categories", icon: LayoutGrid },
  { id: "useCase", label: "Use Case", icon: Clapperboard },
  { id: "genre", label: "Genre", icon: Music2 },
  { id: "mood", label: "Mood", icon: Sparkles },
];

/** Editor Picks card: the SMALL playlist tile (the square parallelogram from the
 *  playlist page header), not the tall shelf card used on /playlists. Title and
 *  track count sit under the art, so the picture stays clean. */
const EditorPickCard = ({ playlist }: { playlist: LivePlaylist }) => (
  <Link to={`/playlist/${playlist.slug}`} className="group block">
    <div
      style={{ transform: "skewX(-9deg)" }}
      className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] transition-colors duration-300 group-hover:border-[#F4C430]/60"
    >
      {playlist.image && (
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
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
    </div>
    <p className="mt-3 truncate font-body text-sm font-semibold text-foreground transition-colors duration-200 group-hover:text-[#F4C430]">
      {playlist.title}
    </p>
    <p className="font-body text-xs text-muted-foreground">
      {playlist.trackIds.length} track{playlist.trackIds.length === 1 ? "" : "s"}
    </p>
  </Link>
);

const Index = () => {
  const plans = usePlans();
  const { tracks: trendingTracks, isLoading: tracksLoading } = useTrendingTracks(TRENDING_COUNT);
  const categories = useCategories();
  const vocab = useVocabularies();

  // Editor Picks: the first six playlists, in the order the owner arranged them
  // in the admin. Six keeps the rail to (almost) one screen — no endless scroll.
  const editorPicks = usePlaylists().slice(0, 6);

  const [browseTab, setBrowseTab] = useState<BrowseTab>("categories");
  const browseItems =
    browseTab === "categories"
      ? categories.map((c) => ({ key: c.id, label: c.title, to: `/catalog?category=${c.id}` }))
      : vocab[browseTab].map((v) => ({ key: v, label: v, to: discoverPath(browseTab, v) }));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-16 md:pt-20">
        {/* Hero: straight to the music */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-12 pt-10 sm:px-6 md:pt-12">
          <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight text-foreground md:text-4xl">
            Cinematic music for your next video
          </h1>
          <p className="mt-3 max-w-xl font-body text-sm text-muted-foreground md:text-base">
            Written by real composers, licensed to you directly.
            Monetization-safe, claims handled for you, licensed in one click.
          </p>
        </section>

        {/* Section cards: Catalog / Collections / Playlists */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { to: "/catalog", icon: Library, title: "Catalog", text: "Every track in the library", bg: "/images/panels/catalog.png" },
              { to: "/collections", icon: Layers, title: "Collections", text: "Curated by style and genre", bg: "/images/panels/collections.png" },
              { to: "/playlists", icon: ListMusic, title: "Playlists", text: "Handpicked for your use case", bg: "/images/panels/playlists.png" },
            ].map((c) => (
              <Link
                key={c.to}
                to={c.to}
                style={{ backgroundImage: `url('${c.bg}')` }}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card bg-cover bg-center p-5 transition-colors hover:border-[#F4C430]/60"
              >
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:text-[#F4C430]">
                  <c.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-sm font-semibold text-foreground transition-colors group-hover:text-[#F4C430]">
                    {c.title}
                  </span>
                  <span className="block truncate font-body text-xs text-muted-foreground">{c.text}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-[#F4C430]" />
              </Link>
            ))}
          </div>
        </section>

        {/* Trending / latest tracks */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl text-foreground md:text-2xl">Trending tracks</h2>
            <Link
              to="/catalog"
              className="inline-flex items-center gap-1 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {/* The skeleton has the exact height of the real rows, so "Browse by
              mood" and everything below it never move when the tracks land. */}
          <div className="mt-4">
            {tracksLoading ? (
              <TrackRowSkeletonList count={TRENDING_COUNT} />
            ) : (
              <TrackRowList tracks={trendingTracks} />
            )}
          </div>
        </section>

        {/* Browse by: one shelf, four ways in (Categories · Use Case · Genre · Mood) */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <h2 className="text-xl text-foreground md:text-2xl">Browse by</h2>

            {/* Segmented control: the active tab is the only lit pill. */}
            <div className="flex flex-wrap gap-1 rounded-full border border-border/70 bg-card/60 p-1">
              {BROWSE_TABS.map((t) => {
                const active = t.id === browseTab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setBrowseTab(t.id)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-body text-xs font-semibold transition-all duration-200 ${
                      active
                        ? "bg-[#F4C430] text-background shadow-[0_0_20px_-2px_rgba(244,196,48,0.55)]"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    }`}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* The list re-mounts on every tab (key), so it fades in each time. */}
          <div key={browseTab} className="mt-5 flex animate-fade-in flex-wrap gap-2">
            {browseItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className="group inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 font-body text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F4C430]/70 hover:bg-[#F4C430]/[0.07] hover:text-[#F4C430]"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 transition-colors duration-200 group-hover:bg-[#F4C430]"
                  aria-hidden
                />
                {item.label}
              </Link>
            ))}
            {browseItems.length === 0 && (
              <p className="font-body text-sm text-muted-foreground">Nothing here yet.</p>
            )}
          </div>
        </section>

        {/* Editor Picks — small playlist tiles on a rail (max 6). */}
        {editorPicks.length > 0 && (
          <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl text-foreground md:text-2xl">Editor Picks</h2>
              <Link
                to="/playlists"
                className="inline-flex items-center gap-1 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
              >
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-4">
              <CardCarousel>
                {editorPicks.map((p) => (
                  <EditorPickCard key={p.id} playlist={p} />
                ))}
              </CardCarousel>
            </div>
          </section>
        )}

        {/* Plans teaser */}
        <section className="border-y border-border bg-card/50">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-xl text-foreground md:text-2xl">
              Simple plans, clear licenses
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {plans.map((p) => (
                <Link
                  key={p.id}
                  to="/pricing"
                  className={`rounded-xl border bg-background p-5 transition-colors hover:border-[#F4C430]/70 ${
                    p.id === "pro" ? "border-[#F4C430]/60" : "border-border"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-body text-sm font-semibold text-foreground">{p.name}</span>
                    <span className="font-body text-lg font-semibold" style={{ color: GOLD }}>
                      ${p.priceAnnualPerMonth}
                      <span className="text-xs text-muted-foreground">/mo</span>
                    </span>
                  </div>
                  <p className="mt-2 font-body text-xs text-muted-foreground">{p.highlights[0]}</p>
                </Link>
              ))}
            </div>
            <p className="mt-6 text-center">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-1 font-body text-sm text-[#F4C430] hover:underline"
              >
                Compare all plans <ArrowRight className="h-4 w-4" />
              </Link>
            </p>
          </div>
        </section>

        {/* Trust — the four pillars converge into the brand.
            The "What is TV Music Store?" paragraph now HEADS this block (owner). */}
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
          <div className="mb-10 max-w-3xl">
            <h2 className="text-xl text-foreground md:text-2xl">What is TV Music Store?</h2>
            <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
              TV Music Store is a premium library of royalty-free music for videos, films, games and
              advertising. Every track is professionally produced, easy to license and ready for
              commercial use.
            </p>
          </div>

          <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_170px_minmax(0,22rem)]">
            {/* Left: the four pillars */}
            <div className="flex flex-col gap-3">
              {trustPoints.map((tp) => (
                <div
                  key={tp.label}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3.5"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#F4C430]/30 bg-[#F4C430]/10"
                    style={{ boxShadow: "0 0 18px -6px rgba(244,196,48,0.5)" }}
                  >
                    <tp.icon className="h-4 w-4" style={{ color: GOLD }} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold text-foreground">{tp.label}</p>
                    <p className="mt-0.5 font-body text-xs leading-relaxed text-muted-foreground">{tp.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Middle: converging light beams (desktop only) */}
            <svg
              className="hidden h-64 w-full lg:block"
              viewBox="0 0 170 260"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="trustBeam" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#F4C430" stopOpacity="0.05" />
                  <stop offset="60%" stopColor="#F4C430" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#F4C430" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <path d="M0 28 C 105 28, 70 130, 164 130" stroke="url(#trustBeam)" strokeWidth="1.5" />
              <path d="M0 96 C 105 96, 95 130, 164 130" stroke="url(#trustBeam)" strokeWidth="1.5" />
              <path d="M0 164 C 105 164, 95 130, 164 130" stroke="url(#trustBeam)" strokeWidth="1.5" />
              <path d="M0 232 C 105 232, 70 130, 164 130" stroke="url(#trustBeam)" strokeWidth="1.5" />
              <circle cx="164" cy="130" r="8" fill="#F4C430" opacity="0.18">
                <animate attributeName="r" values="6;11;6" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.25;0.08;0.25" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="164" cy="130" r="3.5" fill="#F4C430" />
            </svg>

            {/* Right: the brand node */}
            <div
              className="relative overflow-hidden rounded-2xl border border-[#F4C430]/25 bg-card/70 p-8 text-center"
              style={{ boxShadow: "0 0 60px -20px rgba(244,196,48,0.45)" }}
            >
              <p className="font-display text-2xl font-semibold tracking-wide text-foreground md:text-3xl">
                TV MUSIC STORE
              </p>
              <div
                className="mx-auto mt-3 h-1 w-28 rounded-full"
                style={{ background: "linear-gradient(90deg,#7c3aed,#F4C430,#22d3ee)" }}
              />
              <p className="mt-4 font-body text-xs text-muted-foreground">Real composers, licensed clean.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
