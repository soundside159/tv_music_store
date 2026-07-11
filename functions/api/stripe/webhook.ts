import { json, type Ctx } from "../_utils";
import { recordRevenueEvent } from "../_revenue";
import {
  mapStripeStatus,
  stripeCall,
  type StripeSubscription,
  unixToIso,
  upsertSubscription,
  verifyStripeSignature,
} from "./_stripe";

// POST /api/stripe/webhook — Stripe calls this; never call it from the frontend.
// Handled events: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, invoice.payment_failed.

const applySubscription = async (
  ctx: Ctx,
  sub: StripeSubscription,
  fallbackUserId?: string | null,
): Promise<void> => {
  const userId = sub.metadata?.user_id ?? fallbackUserId;
  if (!userId) return; // not one of ours (metadata lost) — ignore
  const plan = sub.metadata?.plan ?? "pro";
  const interval =
    sub.metadata?.interval ??
    (sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "annual" : "monthly");
  await upsertSubscription(ctx.env.DB, userId, {
    stripeSubId: sub.id,
    stripeCustomerId: sub.customer,
    plan,
    interval,
    status: mapStripeStatus(sub.status),
    currentPeriodEnd: unixToIso(sub.current_period_end),
  });
};

interface StripeInvoice {
  id: string;
  subscription?: string | null;
  customer?: string | null;
  amount_paid?: number;
  tax?: number | null;
  total_tax_amounts?: { amount: number }[];
  currency?: string;
  charge?: string | null;
  lines?: { data?: { period?: { start?: number; end?: number } }[] };
}

interface StripeCharge {
  balance_transaction?: { fee?: number } | string | null;
}

/**
 * Books one paid invoice. The split is calculated on the NET:
 *   gross (amount_paid) − VAT (Stripe Tax) − Stripe's fee.
 * The fee is read from the charge's balance transaction; if that lookup fails
 * we fall back to Stripe's standard 2.9% + 30c so the ledger is never wrong in
 * the composer's favour by accident.
 */
const recordStripeInvoice = async (ctx: Ctx, key: string, inv: StripeInvoice): Promise<void> => {
  const gross = inv.amount_paid ?? 0;
  if (!inv.id || gross <= 0 || !inv.subscription) return;

  // Which of our users is this? (subscriptions carry user_id in metadata)
  const sub = await stripeCall<StripeSubscription>(key, "GET", `/subscriptions/${inv.subscription}`);
  const userId = sub.metadata?.user_id ?? null;
  if (!userId) return;

  const tax =
    inv.tax ?? (inv.total_tax_amounts ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0);

  let fee = Math.round(gross * 0.029) + 30;
  if (inv.charge) {
    try {
      const charge = await stripeCall<StripeCharge>(
        key,
        "GET",
        `/charges/${inv.charge}?expand[]=balance_transaction`,
      );
      const bt = charge.balance_transaction;
      if (bt && typeof bt === "object" && typeof bt.fee === "number") fee = bt.fee;
    } catch {
      // keep the estimate
    }
  }

  const line = inv.lines?.data?.[0]?.period;
  const periodStart = unixToIso(line?.start) ?? unixToIso(sub.current_period_end);
  const periodEnd = unixToIso(line?.end) ?? unixToIso(sub.current_period_end);

  await recordRevenueEvent(ctx.env.DB, {
    source: "subscription",
    userId,
    provider: "stripe",
    providerRef: inv.id,
    grossCents: gross,
    taxCents: tax,
    feeCents: fee,
    currency: inv.currency ?? "usd",
    periodStart,
    periodEnd,
  });
};


export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  const whSecret = ctx.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whSecret) return json({ error: "Webhook not configured" }, 503);

  const payload = await ctx.request.text();
  const ok = await verifyStripeSignature(
    payload,
    ctx.request.headers.get("stripe-signature"),
    whSecret,
  );
  if (!ok) return json({ error: "Invalid signature" }, 400);

  const event = JSON.parse(payload) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as {
        subscription?: string | null;
        client_reference_id?: string | null;
      };
      if (s.subscription) {
        const sub = await stripeCall<StripeSubscription>(
          key,
          "GET",
          `/subscriptions/${s.subscription}`,
        );
        await applySubscription(ctx, sub, s.client_reference_id);
      }
      break;
    }
    case "customer.subscription.updated": {
      await applySubscription(ctx, event.data.object as unknown as StripeSubscription);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as StripeSubscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        // Subscription fully ended -> back to Free.
        await upsertSubscription(ctx.env.DB, userId, {
          stripeSubId: sub.id,
          stripeCustomerId: sub.customer,
          plan: "free",
          interval: null,
          status: "canceled",
          currentPeriodEnd: unixToIso(sub.current_period_end),
        });
      }
      break;
    }
    // Every PAID subscription invoice is booked into the revenue ledger: gross,
    // the VAT Stripe collected, Stripe's own fee, and the cycle the payment
    // covers. The split runs when that cycle closes (see functions/api/_revenue.ts).
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      await recordStripeInvoice(ctx, key, event.data.object as StripeInvoice);
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as { subscription?: string | null };
      if (inv.subscription) {
        const sub = await stripeCall<StripeSubscription>(
          key,
          "GET",
          `/subscriptions/${inv.subscription}`,
        );
        await applySubscription(ctx, sub);
      }
      break;
    }
    default:
      // Unhandled event type — acknowledge so Stripe stops retrying.
      break;
  }

  return json({ received: true });
};
