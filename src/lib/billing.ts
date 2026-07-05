import { toast } from "sonner";
import type { BillingInterval, PlanId } from "@/types/domain";

// Frontend helpers for Stripe subscription billing.
// Both endpoints return { url } and we redirect the whole page to Stripe.

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

/** Open the Stripe Billing Portal (manage / cancel / payment method). */
export const openBillingPortal = async (): Promise<void> => {
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
