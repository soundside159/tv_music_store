import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Minus } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { usePlans, useSubscription } from "@/hooks/useMockData";
import { useAuthSession } from "@/hooks/useAuth";
import { BILLING_ENABLED, openBillingPortal, startCheckout } from "@/lib/billing";
import { useSeo } from "@/hooks/useSeo";
import type { BillingInterval, PlanConfig, PlanId } from "@/types/domain";

const GOLD = "#F4C430";

const faq: { q: string; a: string }[] = [
  {
    q: "What's the difference between Personal and Commercial license?",
    a: "Free and Pro cover personal and small-team use: social media, YouTube, podcasts, websites. Max adds commercial use: paid ads, sponsored content, client work, and brands of any size.",
  },
  {
    q: "Can I keep using tracks after I cancel?",
    a: "Yes. Tracks you downloaded and used in projects during an active subscription stay licensed for those projects forever. New downloads or new projects need an active subscription or a one-time sync license.",
  },
  {
    q: "How does channel whitelisting work?",
    a: "Add your YouTube channel in your account and it gets protected within 24 hours: Content ID claims on our tracks are cleared for that channel. Pro covers 3 channels, Max covers 10.",
  },
  {
    q: "What if I get a copyright claim?",
    a: "Every track in the catalog is Content ID registered by its composer. Send us the video link and the claim is removed within 24 hours — on any plan, including Free.",
  },
  {
    q: "What formats do I get?",
    a: "MP3 on every plan. Lossless WAV and isolated stems (where available) are included with Max.",
  },
  {
    q: "Do I need a subscription for TV, film or game projects?",
    a: "Broadcast, film, trailers and in-game use are covered by one-time Sync licenses ($199–399 per track), not by subscriptions. See Sync licensing below.",
  },
];

type CompareRow = {
  label: string;
  values: Record<PlanId, string | boolean>;
};

const compareRows: CompareRow[] = [
  { label: "Music downloads", values: { free: "3 / month", pro: "Unlimited", max: "Unlimited" } },
  { label: "WAV format + stems", values: { free: false, pro: false, max: true } },
  { label: "Personal projects & social media", values: { free: true, pro: true, max: true } },
  { label: "Small teams (up to 5 people)", values: { free: false, pro: true, max: true } },
  { label: "Paid ads & sponsored content", values: { free: false, pro: false, max: true } },
  { label: "Client & commercial work", values: { free: false, pro: false, max: true } },
  { label: "Whitelisted YouTube channels", values: { free: "—", pro: "3", max: "10" } },
  { label: "Claim removal within 24h", values: { free: true, pro: true, max: true } },
  { label: "Priority support", values: { free: false, pro: false, max: true } },
];

const CellValue = ({ v }: { v: string | boolean }) => {
  if (typeof v === "string") return <span className="text-sm text-foreground">{v}</span>;
  return v ? (
    <Check className="mx-auto h-4 w-4" style={{ color: GOLD }} />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />
  );
};

const PlanCard = ({
  plan,
  interval,
  isCurrent,
  isAuthed,
}: {
  plan: PlanConfig;
  interval: BillingInterval;
  isCurrent: boolean;
  isAuthed: boolean;
}) => {
  const [busy, setBusy] = useState(false);
  const isPro = plan.id === "pro";
  const price = interval === "annual" ? plan.priceAnnualPerMonth : plan.priceMonthly;
  const cta =
    plan.id === "free"
      ? isAuthed
        ? "Browse catalog"
        : "Start free"
      : !BILLING_ENABLED
        ? "Coming soon"
        : isCurrent
          ? "Manage subscription"
          : busy
            ? "Redirecting..."
            : "Select plan";

  const onSelect = async () => {
    if (plan.id === "free" || busy || !BILLING_ENABLED) return;
    setBusy(true);
    try {
      if (isCurrent) await openBillingPortal();
      else await startCheckout(plan.id, interval);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`relative flex flex-col rounded-xl border bg-card p-6 ${
        isPro ? "border-[#F4C430]/60" : "border-border"
      }`}
    >
      {isPro && (
        <span
          className="absolute -top-3 left-6 rounded-full px-3 py-0.5 font-body text-xs font-semibold uppercase tracking-wider text-background"
          style={{ backgroundColor: GOLD }}
        >
          Most popular
        </span>
      )}
      <h3 className="font-body text-lg font-semibold text-foreground">{plan.name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-body text-4xl font-semibold text-foreground">${price}</span>
        <span className="font-body text-sm text-muted-foreground">/month</span>
      </div>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        {plan.id === "free"
          ? "No credit card required"
          : interval === "annual"
            ? `Billed yearly · $${plan.priceMonthly}/mo if monthly`
            : "Billed monthly"}
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 font-body text-sm text-foreground/90">
            <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} />
            {h}
          </li>
        ))}
      </ul>
      {plan.id === "free" ? (
        <Link
          to={isAuthed ? "/catalog" : "/login"}
          className="mt-8 rounded-lg border border-border py-2.5 text-center font-body text-sm font-semibold text-foreground transition-colors duration-300 hover:border-[#F4C430] hover:text-[#F4C430]"
        >
          {cta}
        </Link>
      ) : (
        <button
          type="button"
          disabled={busy || !BILLING_ENABLED}
          onClick={() => void onSelect()}
          className={`mt-8 rounded-lg py-2.5 text-center font-body text-sm font-semibold transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
            isPro
              ? "bg-[#F4C430] text-background hover:bg-[#F4C430]/85"
              : "border border-border text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
          }`}
        >
          {cta}
        </button>
      )}
    </div>
  );
};

const Pricing = () => {
  const plans = usePlans();
  const subscription = useSubscription();
  const { status } = useAuthSession();
  const [interval, setInterval] = useState<BillingInterval>("annual");

  useSeo({
    title: "Plans & Pricing — Royalty-Free Music Subscription | TV Music Store",
    description:
      "Simple royalty-free music pricing: Pro $7/mo and Max $15/mo (billed annually) with unlimited downloads, WAV + stems, commercial licensing and YouTube channel whitelisting. Plus one-time track licenses from $15.",
    path: "/pricing",
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
        <header className="text-center">
          <h1 className="text-3xl text-foreground md:text-4xl">Plans &amp; pricing</h1>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground">
            Unlimited royalty-free cinematic music for your videos — YouTube monetization-safe, with
            commercial licensing and lossless WAV when you need it.
          </p>
          <div className="mt-8 inline-flex items-center rounded-full border border-border bg-card p-1">
            {(["annual", "monthly"] as BillingInterval[]).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                className={`rounded-full px-4 py-1.5 font-body text-sm transition-colors duration-200 ${
                  interval === i
                    ? "bg-[#F4C430] font-semibold text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {i === "annual" ? "Annual · save up to 48%" : "Monthly"}
              </button>
            ))}
          </div>
        </header>

        <section className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              interval={interval}
              isCurrent={
                status === "authed" &&
                subscription?.plan === p.id &&
                subscription?.status === "active"
              }
              isAuthed={status === "authed"}
            />
          ))}
        </section>

        <section className="mt-20">
          <h2 className="text-center text-2xl text-foreground">Compare plans</h2>
          <div className="mt-8 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse font-body">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="p-4 text-left text-sm font-semibold text-foreground">Features</th>
                  {plans.map((p) => (
                    <th key={p.id} className="p-4 text-center text-sm font-semibold text-foreground">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/60 last:border-0">
                    <td className="p-4 text-sm text-muted-foreground">{row.label}</td>
                    {plans.map((p) => (
                      <td key={p.id} className="p-4 text-center">
                        <CellValue v={row.values[p.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16 rounded-xl border border-border bg-card p-6 md:flex md:items-center md:justify-between md:p-8">
          <div>
            <h2 className="text-xl text-foreground">Need a license for one track only?</h2>
            <p className="mt-2 max-w-lg font-body text-sm text-muted-foreground">
              TV, film, trailers and games are covered by one-time Sync licenses — $199 Standard,
              $399 Broadcast with stems included. Pay once, licensed forever.
            </p>
          </div>
          <Link
            to="/sync"
            className="mt-4 inline-block rounded-lg border border-[#F4C430]/70 px-5 py-2.5 font-body text-sm font-semibold text-[#F4C430] transition-colors duration-300 hover:bg-[#F4C430] hover:text-background md:mt-0"
          >
            Sync licensing
          </Link>
        </section>

        <section className="mx-auto mt-20 max-w-2xl">
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
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Pricing;
