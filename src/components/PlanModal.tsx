import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { usePlans, useSubscription } from "@/hooks/useMockData";
import { useAuthSession } from "@/hooks/useAuth";
import { BILLING_ENABLED, openBillingPortal, startCheckout, switchPlan } from "@/lib/billing";
import type { BillingInterval, PlanConfig } from "@/types/domain";

// Global "Pick a plan" popup (tunetank-style). Opened via openPlanModal()
// ("tvms:pick-plan"), mounted in App.tsx. Shows the paid plans (Pro / Max) with
// a Monthly/Annual toggle and a link to the full pricing page.

const GOLD = "#F4C430";

const PlanCard = ({
  plan,
  interval,
  isCurrent,
  activePlan,
  onDone,
}: {
  plan: PlanConfig;
  interval: BillingInterval;
  isCurrent: boolean;
  /** The paid plan the customer is subscribed to right now (null if none). */
  activePlan: string | null;
  onDone: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const isMax = plan.id === "max";
  const price = interval === "annual" ? plan.priceAnnualPerMonth : plan.priceMonthly;

  // A subscriber cannot simply buy a second subscription — Stripe would bill
  // both. He has to cancel the current one first, so we say so instead of
  // sending him to checkout. Max already includes everything in Pro, so the
  // Pro card goes quiet for him.
  const includedInCurrent = activePlan === "max" && plan.id === "pro";
  const switchBlocked = !!activePlan && !isCurrent && !includedInCurrent;

  const cta = !BILLING_ENABLED
    ? "Coming soon"
    : isCurrent
      ? "Manage plan"
      : includedInCurrent
        ? "Included in your plan"
        : switchBlocked
          ? `Switch to ${plan.name}`
          : busy
            ? "Redirecting…"
            : "Get plan";

  const onClick = async () => {
    if (!BILLING_ENABLED || busy || includedInCurrent) return;
    setBusy(true);
    try {
      if (isCurrent) {
        await openBillingPortal();
      } else if (switchBlocked) {
        // In-place upgrade/downgrade: no second subscription, Stripe prorates.
        const ok = window.confirm(
          `Switch to ${plan.name} now? Your subscription changes immediately and Stripe charges only the prorated difference.`,
        );
        if (ok) {
          await switchPlan(plan.id, interval);
          onDone();
        }
      } else if (plan.id !== "free") {
        await startCheckout(plan.id, interval);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        isMax ? "border-[#F4C430]" : "border-border bg-background/40"
      }`}
    >
      {isMax && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 font-body text-[11px] font-bold uppercase tracking-wider text-background"
          style={{ backgroundColor: GOLD }}
        >
          Most popular
        </span>
      )}
      <h3 className="font-body text-xl font-semibold text-foreground">{plan.name}</h3>
      <p className="mt-1 font-body text-sm text-muted-foreground">
        {plan.id === "max" ? "For studios, brands & client work" : "For solo creators & channels"}
      </p>
      <div className="mt-4 flex items-baseline gap-2">
        {interval === "annual" && (
          <span className="font-body text-lg text-muted-foreground line-through">${plan.priceMonthly}</span>
        )}
        <span className="font-body text-4xl font-semibold text-foreground">${price}</span>
        <span className="font-body text-sm text-muted-foreground">
          /mo{interval === "annual" ? ", billed annually" : ""}
        </span>
      </div>

      <button
        type="button"
        disabled={busy || !BILLING_ENABLED || includedInCurrent}
        onClick={() => void onClick()}
        className={`mt-5 rounded-lg py-3 text-center font-body text-sm font-semibold transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
          isCurrent
            ? "border border-[#F4C430]/60 bg-[#F4C430]/10 text-[#F4C430]"
            : isMax
              ? "bg-[#F4C430] text-background hover:bg-[#F4C430]/85"
              : "border border-border text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
        }`}
      >
        {cta}
      </button>

      <ul className="mt-5 flex flex-col gap-2.5">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 font-body text-sm text-foreground/90">
            <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} />
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
};

const PlanModal = () => {
  const plans = usePlans();
  const subscription = useSubscription();
  const { status } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [heading, setHeading] = useState<{ title: string; subtitle: string }>({
    title: "Pick a plan",
    subtitle: "Unlock unlimited downloads, lossless WAV & stems, and full commercial licensing.",
  });

  useEffect(() => {
    const show = (event: Event) => {
      const ctx = (event as CustomEvent<{ title?: string; subtitle?: string }>).detail ?? {};
      setHeading({
        title: ctx.title || "Pick a plan",
        subtitle: ctx.subtitle || "Unlock unlimited downloads, lossless WAV & stems, and full commercial licensing.",
      });
      setInterval("annual");
      setOpen(true);
    };
    window.addEventListener("tvms:pick-plan", show);
    return () => window.removeEventListener("tvms:pick-plan", show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);
  const paidPlans = plans.filter((p) => p.id !== "free");
  const activePlan =
    status === "authed" &&
    subscription &&
    subscription.plan !== "free" &&
    subscription.status === "active"
      ? subscription.plan
      : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Pick a plan"
    >
      <div
        className="my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="float-right text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center">
          <h2 className="text-2xl text-foreground md:text-3xl">{heading.title}</h2>
          <p className="mx-auto mt-2 max-w-md font-body text-sm text-muted-foreground">
            {heading.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-body text-sm">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={interval === "monthly" ? "font-semibold text-foreground" : "text-muted-foreground"}
            >
              Monthly
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={interval === "annual"}
              onClick={() => setInterval((i) => (i === "annual" ? "monthly" : "annual"))}
              className="relative inline-flex h-6 w-12 shrink-0 items-center rounded-full bg-secondary transition-colors"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[#F4C430] shadow transition-transform ${
                  interval === "annual" ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setInterval("annual")}
              className={interval === "annual" ? "font-semibold text-foreground" : "text-muted-foreground"}
            >
              Annual
            </button>
            <span
              className="rounded px-2 py-0.5 font-body text-[11px] font-bold uppercase tracking-wide text-background"
              style={{ backgroundColor: GOLD }}
            >
              Up to 48% off
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {paidPlans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              interval={interval}
              isCurrent={activePlan === p.id}
              activePlan={activePlan}
              onDone={close}
            />
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/pricing"
            onClick={close}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 font-body text-sm text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
          >
            Full pricing details <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PlanModal;
