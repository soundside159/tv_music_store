import { Link } from "react-router-dom";
import { ArrowRight, Check, Layers, Library, ListMusic, Music2, ShieldCheck, Users } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList, TrackRowSkeletonList } from "@/components/TrackRowPlayer";
import { discoverPath } from "@/lib/discovery";
import { useCategories, useTrendingTracks, useVocabularies } from "@/hooks/useContent";
import { usePlans } from "@/hooks/useMockData";

const GOLD = "#F4C430";

const trustPoints = [
  { icon: ShieldCheck, label: "Content ID handled", text: "Add your channel and we watch new uploads: every claim on our music is sent for release within one business day." },
  { icon: Users, label: "Written by humans", text: "Named composers with real PRO/IPI registration — never AI-generated filler." },
  { icon: Music2, label: "Versions included", text: "Cut-downs and alternate mixes with every track." },
  { icon: Check, label: "License instantly", text: "Clear licenses, PDF certificate right after download." },
];

/** Rows shown in "Trending tracks" — also the number of placeholders reserved. */
const TRENDING_COUNT = 8;

const Index = () => {
  const plans = usePlans();
  const { tracks: trendingTracks, isLoading: tracksLoading } = useTrendingTracks(TRENDING_COUNT);
  const categories = useCategories();
  const moods = useVocabularies().mood;

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
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/catalog?category=${c.id}`}
                className="rounded-full border border-border px-4 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
              >
                {c.title}
              </Link>
            ))}
            <span className="ml-1 font-body text-xs text-muted-foreground">
              Start free — 3 downloads every month. No credit card.
            </span>
          </div>
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

        {/* Browse by collection */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
          <h2 className="text-xl text-foreground md:text-2xl">Browse by mood</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {moods.map((m) => (
              <Link
                key={m}
                to={discoverPath("mood", m)}
                className="rounded-full border border-border px-3 py-1 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
              >
                {m}
              </Link>
            ))}
          </div>
        </section>

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

        {/* Trust — the four pillars converge into the brand */}
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
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
          {/* HONEST COPY (2026-07-12): the catalogue is NON-EXCLUSIVE — the same
              track may also be licensed elsewhere by its composer. So we promise
              what is actually true (human composers, direct licence, cue-sheet
              data, claim removal) and never imply the music is unique to us. */}
          <div className="mt-14 max-w-3xl">
            <h2 className="text-xl text-foreground">What is TV Music Store?</h2>
            <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
              TV Music Store is an independent, hand-picked music library. Every track is written by a
              named human composer we work with under agreement — no AI-generated filler — and we
              license it to you directly: we are the licensor on your licence, not a middleman passing
              you someone else's terms. Each track ships with cut-down versions, the cue-sheet data you
              need for broadcast (composer, PRO, IPI), channel monitoring, and every Content ID claim on a
              licensed use sent for release within one business day. Composers keep the copyright in their
              work and may licence it elsewhere too;
              what you buy from us is a licence to use the music, and it is valid whatever they do.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
