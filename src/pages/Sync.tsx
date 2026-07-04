import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

const GOLD = "#F4C430";

const tiers = [
  {
    name: "Sync Standard",
    price: 199,
    features: [
      "Indie games & apps",
      "Online films & festivals",
      "One production, worldwide, perpetual",
      "WAV master included",
      "License PDF certificate",
    ],
    highlighted: false,
  },
  {
    name: "Sync Broadcast",
    price: 399,
    features: [
      "TV & streaming platforms",
      "Film & movie trailers",
      "AAA games & advertising campaigns",
      "Stems included (where available)",
      "One production, worldwide, perpetual",
      "License PDF certificate",
    ],
    highlighted: true,
  },
];

const steps = [
  { n: "01", title: "Pick a track", text: "Find the right cue in the catalog and preview every version." },
  { n: "02", title: "Choose Standard or Broadcast", text: "One-time payment for one production. No subscription needed." },
  { n: "03", title: "Download & create", text: "WAV (and stems on Broadcast) plus your license PDF — instantly." },
];

const Sync = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
      <header className="text-center">
        <h1 className="text-3xl text-foreground md:text-4xl">Single-track sync licensing</h1>
        <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground">
          For TV, film, trailers and games — uses that subscriptions don't cover. Pay once per
          track, licensed forever for your production.
        </p>
      </header>

      <section className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-2">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`flex flex-col rounded-xl border bg-card p-6 ${
              t.highlighted ? "border-[#F4C430]/60" : "border-border"
            }`}
          >
            <h2 className="font-body text-lg font-semibold text-foreground">{t.name}</h2>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-body text-4xl font-semibold text-foreground">${t.price}</span>
              <span className="font-body text-sm text-muted-foreground">/track</span>
            </div>
            <ul className="mt-5 flex flex-col gap-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 font-body text-sm text-foreground/90">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/catalog"
              className={`mt-6 rounded-lg py-2.5 text-center font-body text-sm font-semibold transition-colors ${
                t.highlighted
                  ? "bg-[#F4C430] text-background hover:bg-[#F4C430]/85"
                  : "border border-border text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
              }`}
            >
              Browse the catalog
            </Link>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl text-foreground">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <span className="font-body text-sm font-semibold" style={{ color: GOLD }}>{s.n}</span>
              <p className="mt-2 font-body text-sm font-semibold text-foreground">{s.title}</p>
              <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-xl rounded-xl border border-border bg-card p-6 md:p-8">
        <h2 className="text-xl text-foreground">Non-standard use case?</h2>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Exclusive rights, multi-season series, theatrical release — tell us about the project and
          we'll quote it.
        </p>
        <form className="mt-5 flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Name"
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
            />
            <input
              type="email"
              placeholder="Email"
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
            />
          </div>
          <input
            placeholder="Project type (TV series, feature film, game...)"
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
          />
          <input
            placeholder="Track link (optional)"
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
          />
          <textarea
            placeholder="Usage description: where, how long, which territories"
            rows={4}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
          />
          <button
            type="submit"
            className="self-start rounded-lg bg-[#F4C430] px-6 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
          >
            Request a quote
          </button>
        </form>
      </section>
    </main>
    <Footer />
  </div>
);

export default Sync;
