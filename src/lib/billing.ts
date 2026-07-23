import { toast } from "sonner";
import { refreshSession } from "@/hooks/useAuth";
import type { BillingInterval, PlanId } from "@/types/domain";

// Frontend helpers for Stripe subscription billing.
// Both endpoints return { url } and we redirect the whole page to Stripe.
//
// 2026-07-09: Paddle rejected the domain — we're staying on STRIPE (checkout +
// webhook were verified end-to-end in test mode earlier). Flag kept in case
// billing ever needs an emergency pause.
export const BILLING_ENABLED: boolean = true;

export interface PlanModalContext {
  /** Custom heading (default "Pick a plan"). */
  title?: string;
  /** Custom subheading under the title. */
  subtitle?: string;
}

/** Opens the global "Pick a plan" popup (PlanModal is mounted in App.tsx). */
export const openPlanModal = (context?: PlanModalContext): void => {
  window.dispatchEvent(new CustomEvent("tvms:pick-plan", { detail: context ?? {} }));
};

const post = async (path: string, body?: unknown): Promise<{ url?: string; error?: string; status: number }> => {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    return { ...data, status: res.status };
  } catch {
    return { error: "Network error. Try again.", status: 0 };
  }
};

/** Start Stripe Checkout for a paid plan. Redirects away on success. */
export const startCheckout = async (
  plan: Exclude<PlanId, "free">,
  interval: BillingInterval,
): Promise<void> => {
  if (!BILLING_ENABLED) {
    toast("Subscriptions are coming soon", {
      description: "We're setting up a new payment provider. One-time track licenses are available now.",
    });
    return;
  }
  const res = await post("/api/stripe/checkout", { plan, interval });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("tvms:open-auth"));
    toast("Sign in to subscribe", { description: "Your plan will be linked to your account." });
    return;
  }
  if (!res.url) {
    toast.error(res.error ?? "Checkout is unavailable right now");
    return;
  }
  window.location.href = res.url;
};

/** Switch an EXISTING subscription to another plan/interval in place. Stripe
 *  prorates the difference — no second subscription, no "cancel first". Falls
 *  back to a normal Checkout when there is no active subscription yet. */
export const switchPlan = async (
  plan: Exclude<PlanId, "free">,
  interval: BillingInterval,
): Promise<void> => {
  if (!BILLING_ENABLED) return;
  const res = await post("/api/stripe/change-plan", { plan, interval });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("tvms:open-auth"));
    return;
  }
  if (res.status === 409) {
    // No active subscription yet — do a fresh checkout instead.
    await startCheckout(plan, interval);
    return;
  }
  if (!(res as { ok?: boolean }).ok) {
    toast.error(res.error ?? "Could not change your plan. Try again.");
    return;
  }
  toast.success(`You're on ${plan === "max" ? "Max" : "Pro"} now`, {
    description: "Your plan changed immediately — Stripe only charges the prorated difference.",
  });
  await refreshSession(); // pull the new plan into the app session
};

/** Open the Stripe Billing Portal (manage / cancel / payment method). */
export const openBillingPortal = async (): Promise<void> => {
  if (!BILLING_ENABLED) {
    toast("Billing management is coming soon", {
      description: "We're switching payment providers — subscription management will be back shortly.",
    });
    return;
  }
  const res = await post("/api/stripe/portal");
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("tvms:open-auth"));
    return;
  }
  if (!res.url) {
    toast.error(res.error ?? "Billing portal is unavailable right now");
    return;
  }
  window.location.href = res.url;
};
