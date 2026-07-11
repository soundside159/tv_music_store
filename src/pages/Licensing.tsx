import { Link } from "react-router-dom";
import { Check, Minus } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useSeo } from "@/hooks/useSeo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const GOLD = "#F4C430";

type Row = { label: string; free: string | boolean; pro: string | boolean; max: string | boolean; sync: string | boolean };

const rows: Row[] = [
  { label: "Personal projects & social media", free: true, pro: true, max: true, sync: true },
  { label: "YouTube monetized videos", free: true, pro: true, max: true, sync: true },
  { label: "Podcasts & livestreams", free: true, pro: true, max: true, sync: true },
  { label: "Small teams (≤5 people)", free: false, pro: true, max: true, sync: true },
  { label: "Paid ads & sponsored content", free: false, pro: false, max: true, sync: true },
  { label: "Client & commercial work", free: false, pro: false, max: true, sync: true },
  { label: "TV & streaming broadcast", free: false, pro: false, max: false, sync: true },
  { label: "Film & movie trailers", free: false, pro: false, max: false, sync: true },
  { label: "Games & apps (embedded)", free: false, pro: false, max: false, sync: true },
  { label: "Downloads", free: "3 / month", pro: "Unlimited", max: "Unlimited", sync: "Per track" },
  { label: "WAV + stems", free: false, pro: false, max: true, sync: true },
  { label: "Channel whitelisting", free: "—", pro: "3", max: "10", sync: "—" },
];

const faq = [
  {
    q: "Do I keep my license if I cancel the subscription?",
    a: "Yes. Everything you downloaded and used in published projects during an active subscription stays licensed for those projects forever. New projects need an active plan or a sync license.",
  },
  {
    q: "What happens if I get a Content ID claim?",
    a: "All tracks are registered in Content ID by their composers. On a paid plan, whitelist your channel(s) and we clear Content ID claims on them while your subscription is active (usually within 24 hours). For a one-off, send the video link and your License Number and we'll release that specific claim.",
  },
  {
    q: "Can I use one subscription for multiple clients?",
    a: "Client work requires the Max plan. Each delivered project is covered; reselling or redistributing the music itself is never allowed.",
  },
  {
    q: "What exactly does a sync license cover?",
    a: "One track in one production (film, series, trailer, game, campaign), worldwide and perpetual. Standard covers indie/online productions; Broadcast covers TV, streaming, trailers and AAA.",
  },
  {
    q: "Can I remix or edit the tracks?",
    a: "You can cut, loop, fade and layer tracks to fit your video. Creating derivative musical works for distribution (e.g. releasing a remix) is not allowed.",
  },
  {
    q: "Is attribution required?",
    a: "No attribution is required on any paid plan or sync license. We always appreciate a credit, but it's optional.",
  },
];

const Cell = ({ v }: { v: string | boolean }) => {
  if (typeof v === "string") return <span className="font-body text-xs text-foreground">{v}</span>;
  return v ? (
    <Check className="mx-auto h-4 w-4" style={{ color: GOLD }} />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />
  );
};

const Licensing = () => {
  // The FAQ below is also emitted as FAQPage schema: this is the block Google's
  // AI Overviews and ChatGPT/Perplexity lift verbatim when someone asks "can I
  // use royalty-free music for client work / on YouTube / in an ad".
  useSeo({
    title: "Music Licensing — What Every Plan Covers | TV Music Store",
    description:
      "What each TV Music Store license covers: YouTube monetization and Content ID whitelisting, client and commercial work, paid ads, TV and streaming broadcast, WAV and stems.",
    path: "/licensing",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  });

  return (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
      <header className="text-center">
        <h1 className="text-3xl text-foreground md:text-4xl">Licensing, explained simply</h1>
        <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground">
          One clear table, no legal maze. If your use case isn't here —{" "}
          <Link to="/sync" className="text-[#F4C430] hover:underline">ask us</Link>.
        </p>
      </header>

      <section className="mt-12 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] border-collapse font-body">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="p-4 text-left text-sm font-semibold text-foreground">Use case</th>
              <th className="p-4 text-center text-sm font-semibold text-foreground">Free</th>
              <th className="p-4 text-center text-sm font-semibold text-foreground">Pro</th>
              <th className="p-4 text-center text-sm font-semibold text-foreground">Max</th>
              <th className="p-4 text-center text-sm font-semibold" style={{ color: GOLD }}>Sync</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/60 last:border-0">
                <td className="p-4 text-sm text-muted-foreground">{r.label}</td>
                <td className="p-4 text-center"><Cell v={r.free} /></td>
                <td className="p-4 text-center"><Cell v={r.pro} /></td>
                <td className="p-4 text-center"><Cell v={r.max} /></td>
                <td className="p-4 text-center"><Cell v={r.sync} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          to="/pricing"
          className="rounded-lg bg-[#F4C430] px-5 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
        >
          Compare plans
        </Link>
        <Link
          to="/sync"
          className="rounded-lg border border-[#F4C430]/70 px-5 py-2.5 font-body text-sm font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background"
        >
          Sync licensing
        </Link>
      </div>

      <section className="mx-auto mt-16 max-w-2xl">
        <h2 className="text-center text-2xl text-foreground">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="mt-6">
          {faq.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger className="text-left font-body text-sm text-foreground hover:text-[#F4C430] hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="font-body text-sm text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-8 text-center font-body text-sm text-muted-foreground">
          Longer answers, worked examples and delivery checklists live in the{" "}
          <Link to="/guides" className="text-[#F4C430] hover:underline">
            licensing guides
          </Link>
          .
        </p>
      </section>
    </main>
    <Footer />
  </div>
  );
};

export default Licensing;
