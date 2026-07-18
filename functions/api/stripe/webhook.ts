import { json, newId, type Ctx } from "../_utils";
import { allocateEvent, recordRevenueEvent, reverseEvent } from "../_revenue";
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


// ---------------------------------------------------------------------------
// One-time license carts paid by CARD (created by checkout-licenses.ts).
// The twin of paypal/capture.ts: writes the same sync_orders rows and books
// the same per-track ledger events, so Account/Licenses, the PDF certificate
// and Finance treat card and PayPal purchases identically.
// ---------------------------------------------------------------------------

interface LicenseCartSession {
  id?: string;
  client_reference_id?: string | null;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
  currency?: string;
  total_details?: { amount_tax?: number };
}

const fulfillLicenseCart = async (ctx: Ctx, key: string, s: LicenseCartSession): Promise<void> => {
  const sessionId = s.id;
  const userId = s.metadata?.user_id ?? s.client_reference_id ?? null;
  if (!sessionId || !userId) return;

  // A webhook can fire twice — record each cart once (same guard as PayPal).
  const existing = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM sync_orders WHERE stripe_session_id = ?1`,
  )
    .bind(sessionId)
    .first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return;

  // What was bought: slug/tier travel in each line's product metadata.
  const lines = await stripeCall<{
    data?: {
      amount_total?: number;
      price?: { product?: { metadata?: Record<string, string> } | string | null } | null;
    }[];
  }>(key, "GET", `/checkout/sessions/${sessionId}/line_items?limit=100&expand[]=data.price.product`);

  const items = (lines.data ?? [])
    .map((l) => {
      const product = l.price && typeof l.price === "object" ? l.price.product : null;
      const meta = product && typeof product === "object" ? (product.metadata ?? {}) : {};
      return { slug: meta.slug ?? "", tier: meta.tier ?? "", priceCents: l.amount_total ?? 0 };
    })
    .filter((i) => i.slug && i.tier);
  if (items.length === 0) return;

  const itemsTotal = items.reduce((sum, i) => sum + i.priceCents, 0) || 1;

  // Stripe's real fee from the charge's balance transaction; standard
  // 2.9% + 30c if the lookup fails — never wrong in the composer's favour.
  let feeTotal = -1;
  if (s.payment_intent) {
    try {
      const pi = await stripeCall<{
        latest_charge?: { balance_transaction?: { fee?: number } | string | null } | string | null;
      }>(key, "GET", `/payment_intents/${s.payment_intent}?expand[]=latest_charge.balance_transaction`);
      const charge = pi.latest_charge;
      if (charge && typeof charge === "object") {
        const bt = charge.balance_transaction;
        if (bt && typeof bt === "object" && typeof bt.fee === "number") feeTotal = bt.fee;
      }
    } catch {
      // keep the estimate
    }
  }
  if (feeTotal < 0) feeTotal = Math.round(itemsTotal * 0.029) + 30;
  const taxTotal = s.total_details?.amount_tax ?? 0;
  const currency = (s.currency ?? "usd").toLowerCase();

  for (const item of items) {
    const track = await ctx.env.DB.prepare(`SELECT id FROM tracks WHERE slug = ?1`)
      .bind(item.slug)
      .first<{ id: string }>();
    const trackId = track?.id ?? item.slug;

    // The licence row. Its id goes into the ledger event, so a refund can
    // void exactly this licence (see reverseEvent).
    const licenseId = newId("ord");
    await ctx.env.DB.prepare(
      `INSERT INTO sync_orders (id, user_id, track_id, tier, price, stripe_session_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
      .bind(licenseId, userId, trackId, item.tier, item.priceCents / 100, sessionId)
      .run();

    // One ledger event per licensed TRACK; tax and fee are shared out in
    // proportion to price, exactly like the PayPal capture path.
    const share = item.priceCents / itemsTotal;
    const eventId = await recordRevenueEvent(ctx.env.DB, {
      source: "license",
      userId,
      provider: "stripe",
      providerRef: `${s.payment_intent ?? sessionId}:${item.slug}:${item.tier}`,
      grossCents: item.priceCents,
      taxCents: Math.round(taxTotal * share),
      feeCents: Math.round(feeTotal * share),
      currency,
      trackId,
      orderId: licenseId,
    });
    // A one-off license has no cycle to wait for — split it right away.
    if (eventId) await allocateEvent(ctx.env.DB, eventId);
  }
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
        mode?: string;
        subscription?: string | null;
        client_reference_id?: string | null;
      } & LicenseCartSession;
      if (s.subscription) {
        const sub = await stripeCall<StripeSubscription>(
          key,
          "GET",
          `/subscriptions/${s.subscription}`,
        );
        await applySubscription(ctx, sub, s.client_reference_id);
      } else if (s.mode === "payment" && s.metadata?.kind === "license_cart") {
        // One-time card purchase of track licenses.
        await fulfillLicenseCart(ctx, key, s);
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
      await recordStripeInvoice(ctx, key, event.data.object as unknown as StripeInvoice);
      break;
    }
    // Money went back to the customer. The invoice drops out of the revenue
    // totals; a composer who was already paid carries the minus into his next
    // payout — we never claw money back out of his account (see _revenue.ts).
    case "charge.refunded":
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn": {
      const obj = event.data.object as {
        invoice?: string | null;
        charge?: string | null;
        payment_intent?: string | null;
      };
      // A dispute object points at the charge; a charge points at the invoice.
      let invoiceId = obj.invoice ?? null;
      let paymentIntent = obj.payment_intent ?? null;
      if (!invoiceId && obj.charge) {
        try {
          const ch = await stripeCall<{ invoice?: string | null; payment_intent?: string | null }>(
            key,
            "GET",
            `/charges/${obj.charge}`,
          );
          invoiceId = ch.invoice ?? null;
          paymentIntent = paymentIntent ?? ch.payment_intent ?? null;
        } catch {
          // charge gone — nothing to reverse
        }
      }
      if (invoiceId) {
        // Subscription invoice refunded.
        await reverseEvent(ctx.env.DB, { providerRef: invoiceId });
      } else if (paymentIntent) {
        // One-time license cart refunded: void every licence bought in that
        // payment (its ledger refs are "<payment_intent>:<slug>:<tier>").
        try {
          const rows = await ctx.env.DB.prepare(
            `SELECT id FROM revenue_events WHERE provider_ref LIKE ?1`,
          )
            .bind(`${paymentIntent}:%`)
            .all<{ id: string }>();
          for (const row of rows.results ?? []) {
            await reverseEvent(ctx.env.DB, { eventId: row.id });
          }
        } catch {
          // revenue tables not created yet — nothing to reverse
        }
      }
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
