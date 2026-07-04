import { Link } from "react-router-dom";
import { ArrowRight, Check, Music2, ShieldCheck, Users } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList } from "@/components/TrackRowPlayer";
import { catalogTracks, categoryLabels } from "@/data/catalogTracks";
import type { TrackCategory } from "@/data/catalogTracks";
import { musicCollections } from "@/data/musicCollections";
import { usePlans } from "@/hooks/useMockData";

const GOLD = "#F4C430";

const categories: TrackCategory[] = ["modern-score", "thriller", "game-ost", "production"];

const moods = ["Emotional", "Powerful", "Inspiring", "Suspenseful", "Aggressive", "Tense", "Heroic", "Uplifting"];

const trustPoints = [
  { icon: ShieldCheck, label: "Content ID protected", text: "Every track is registered. Claims removed within 24 hours." },
  { icon: Users, label: "Real composers", text: "Three composers, one curated catalog. No AI-generated filler." },
  { icon: Music2, label: "Versions included", text: "Cut-downs and alternate mixes with every track." },
  { icon: Check, label: "License instantly", text: "Clear licenses, PDF certificate right after download." },
];

const Index = () => {
  const plans = usePlans();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-16 md:pt-20">
        {/* Hero: straight to the music */}
        <section className="mx-auto w-full max-w-5xl px-4 pb-12 pt-10 sm:px-6 md:pt-12">
          <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight text-foreground md:text-4xl">
            Cinematic music for your next video
          </h1>
          <p className="mt-3 max-w-xl font-body text-sm text-muted-foreground md:text-base">
            A curated catalog from three real composers. Monetization-safe, claim-free,
            licensed in one click.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <Link
                key={c}
                to={`/catalog?category=${c}`}
                className="rounded-full border border-border px-4 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
              >
                {categoryLabels[c]}
              </Link>
            ))}
            <span className="ml-1 font-body text-xs text-muted-foreground">
              Start free — 3 downloads every month. No credit card.
            </span>
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
          <div className="mt-4">
            <TrackRowList tracks={catalogTracks} />
          </div>
        </section>

        {/* Browse by collection */}
        <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl text-foreground md:text-2xl">Browse collections</h2>
            <Link
              to="/catalog"
              className="inline-flex items-center gap-1 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
            >
              All collections <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {musicCollections.slice(0, 8).map((c) => (
              <Link
                key={c.id}
                to={`/catalog?collection=${c.id}`}
                className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-[#F4C430]/60"
              >
                <div className="aspect-[4/3] w-full overflow-hidden">
                  <img
                    src={c.image}
                    alt={c.shortTitle}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <p className="font-body text-sm font-semibold text-foreground">{c.shortTitle}</p>
                  <p className="font-body text-xs text-muted-foreground">{c.trackCount} tracks</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {moods.map((m) => (
              <Link
                key={m}
                to={`/catalog?mood=${encodeURIComponent(m)}`}
                className="rounded-full border border-border px-3 py-1 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
              >
                {m}
              </Link>
            ))}
          </div>
        </section>

        {/* Plans teaser */}
        <section className="border-y border-border bg-card/50">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
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

        {/* Trust */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
            {trustPoints.map((tp) => (
              <div key={tp.label}>
                <tp.icon className="h-5 w-5" style={{ color: GOLD }} />
                <p className="mt-3 font-body text-sm font-semibold text-foreground">{tp.label}</p>
                <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{tp.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-14 max-w-3xl">
            <h2 className="text-xl text-foreground">What is TV Music Store?</h2>
            <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
              TV Music Store is a curated library of cinematic music for video creators, editors,
              agencies and game developers. Every track is written by a real composer — modern
              score, thriller, game OST and production music — and comes with cut-down versions,
              a clear license and Content ID protection. Download free tracks every month, or
              subscribe for unlimited access to the full catalog.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
