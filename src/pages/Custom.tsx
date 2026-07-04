import { Check } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { mockComposers } from "@/mocks";

const GOLD = "#F4C430";

const services = [
  {
    name: "Track adaptation",
    price: "from $149",
    text: "An existing catalog track re-worked for your project: different length, calmer intro, hits on your cuts, alternate ending.",
    features: ["Re-cut to your timing", "Mood & intensity adjustments", "Delivered in 2–4 days", "Includes sync license for your production"],
  },
  {
    name: "Custom music",
    price: "from $499",
    text: "Original music composed from scratch for your brand, film, ad or game — by the composer whose style fits your project.",
    features: ["Brief → demo → revisions → final", "Full exclusivity available", "Stems and cut-downs included", "Direct contact with the composer"],
  },
];

const steps = [
  { n: "01", title: "Brief", text: "Tell us about the project, references and deadline." },
  { n: "02", title: "Demo", text: "The matching composer sends a first sketch." },
  { n: "03", title: "Revisions", text: "You give notes, we refine until it fits." },
  { n: "04", title: "Final", text: "Masters, stems, cut-downs and your license." },
];

const Custom = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
      <header className="text-center">
        <h1 className="text-3xl text-foreground md:text-4xl">Custom music &amp; adaptations</h1>
        <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground">
          When a catalog track is almost right — or when your project needs its own voice.
          Composed by real people, in direct contact with you.
        </p>
      </header>

      <section className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-2">
        {services.map((s) => (
          <div key={s.name} className="flex flex-col rounded-xl border border-border bg-card p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-body text-lg font-semibold text-foreground">{s.name}</h2>
              <span className="font-body text-sm font-semibold" style={{ color: GOLD }}>{s.price}</span>
            </div>
            <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {s.features.map((f) => (
                <li key={f} className="flex items-start gap-2 font-body text-sm text-foreground/90">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl text-foreground">How it works</h2>
        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n}>
              <span className="font-body text-sm font-semibold" style={{ color: GOLD }}>{s.n}</span>
              <p className="mt-2 font-body text-sm font-semibold text-foreground">{s.title}</p>
              <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl text-foreground">Who will write it</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {mockComposers.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-5">
              <p className="font-body text-sm font-semibold text-foreground">{c.displayName}</p>
              <p className="mt-1 font-body text-xs" style={{ color: GOLD }}>{c.styles.join(" · ")}</p>
              <p className="mt-2 font-body text-xs leading-relaxed text-muted-foreground">{c.bio}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="brief" className="mx-auto mt-16 max-w-xl rounded-xl border border-border bg-card p-6 md:p-8">
        <h2 className="text-xl text-foreground">Send a brief</h2>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          The more references and context, the faster the first demo lands.
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
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              defaultValue=""
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
            >
              <option value="" disabled>Service</option>
              <option value="adaptation">Track adaptation</option>
              <option value="custom">Custom music</option>
            </select>
            <select
              defaultValue=""
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
            >
              <option value="" disabled>Budget</option>
              <option>$150–300</option>
              <option>$300–500</option>
              <option>$500–1000</option>
              <option>$1000+</option>
            </select>
          </div>
          <input
            placeholder="Deadline"
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
          />
          <input
            placeholder="Reference tracks (links)"
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
          />
          <textarea
            placeholder="About your project"
            rows={4}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
          />
          <button
            type="submit"
            className="self-start rounded-lg bg-[#F4C430] px-6 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
          >
            Send brief
          </button>
        </form>
      </section>
    </main>
    <Footer />
  </div>
);

export default Custom;
