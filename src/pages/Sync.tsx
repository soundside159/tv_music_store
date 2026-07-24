import { Link } from "react-router-dom";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLicenseTiers } from "@/lib/licenses";

// Single-track licensing page. Used to advertise legacy "Sync Standard $199 /
// Sync Broadcast $399" tiers that never existed in the checkout — it now shows
// THE REAL one-time tiers (Personal / Commercial / Professional, live prices
// from lib/licenses.ts — the same cards as every track page), so the site has
// exactly ONE price list. The custom-quote FORM is gone (owner: mailto depends
// on the visitor having a mail app configured — half of them don't) — just the
// email address with a Copy button.

const GOLD = "#F4C430";

const steps = [
  {
    n: "01",
    title: "Pick a track",
    text: "Find the right cue in the catalog and preview every version.",
  },
  {
    n: "02",
    title: "Choose Personal, Commercial or Professional",
    text: "One-time payment on the track page — no subscription needed. Professional covers TV, film, trailers and games.",
  },
  {
    n: "03",
    title: "Download & create",
    text: "MP3 — and WAV + stems on Commercial and Professional — plus your license PDF, instantly.",
  },
];

const CONTACT_EMAIL = "contact@tvmusicstore.com";

const Sync = () => {
  const tiers = useLicenseTiers();

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      toast.success("Email copied");
    } catch {
      toast.error(CONTACT_EMAIL); // clipboard blocked — at least show it
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
        <header className="text-center">
          <h1 className="text-3xl text-foreground md:text-4xl">Single-track licensing</h1>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground">
            For TV, film, trailers and games — uses that subscriptions don't cover. Pick a tier on
            any track page, pay once, and the track is licensed forever for your production.
          </p>
        </header>

        <section className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.id}
              className={`flex flex-col rounded-xl border bg-card p-6 ${
                t.id === "professional" ? "border-[#F4C430]/60" : "border-border"
              }`}
            >
              <h2 className="font-body text-lg font-semibold text-foreground">{t.name}</h2>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-body text-4xl font-semibold text-foreground">${t.price}</span>
                <span className="font-body text-sm text-muted-foreground">/track</span>
              </div>
              <p className="mt-1 font-body text-xs text-muted-foreground">{t.formats}</p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {t.usageTerms.map((f) => (
                  <li key={f} className="flex items-start gap-2 font-body text-sm text-foreground/90">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/catalog"
                className={`mt-6 rounded-lg py-2.5 text-center font-body text-sm font-semibold transition-colors ${
                  t.id === "professional"
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
                <span className="font-body text-sm font-semibold" style={{ color: GOLD }}>
                  {s.n}
                </span>
                <p className="mt-2 font-body text-sm font-semibold text-foreground">{s.title}</p>
                <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-xl rounded-xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-xl text-foreground">Non-standard use case?</h2>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            Multi-season series, theatrical release, unusual territories — tell us about the
            project (which track, where and how long it will run) and we'll quote it.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="font-body text-sm text-muted-foreground">Write us directly at</span>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-body text-sm font-semibold text-[#F4C430] hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            <button
              type="button"
              onClick={() => void copyEmail()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
            >
              <Copy className="h-3.5 w-3.5" /> Copy email
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Sync;
