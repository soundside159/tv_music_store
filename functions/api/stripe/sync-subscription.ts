import { getSessionUser, json, type Ctx } from "../_utils";
import {
  mapStripeStatus,
  stripeCall,
  type StripeSubscription,
  subPeriodEnd,
  unixToIso,
  upsertSubscription,
} from "./_stripe";

// POST /api/stripe/sync-subscription — re-reads the customer's subscription
// straight from Stripe and mirrors it into D1. Account -> Plan & Billing calls
// it on open, so the page heals itself when a webhook was missed or predates a
// schema change (e.g. a cancel made before cancel_at_period_end was stored).
// One cheap Stripe GET per billing-page visit; no-op for users without a
// Stripe subscription.

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  if (!key) return json({ ok: true, synced: false });

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const row = await ctx.env.DB.prepare(
    `SELECT stripe_sub_id, plan, interval FROM subscriptions
      WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ stripe_sub_id: string | null; plan: string | null; interval: string | null }>();
  if (!row?.stripe_sub_id) return json({ ok: true, synced: false });

  try {
    const sub = await stripeCall<StripeSubscription>(
      key,
      "GET",
      `/subscriptions/${row.stripe_sub_id}`,
    );
    // "canceled" from Stripe = fully ENDED (the period ran out) -> back to
    // Free. A portal cancel that still runs shows status active +
    // cancel_at_period_end true.
    const ended = sub.status === "canceled";
    await upsertSubscription(ctx.env.DB, user.id, {
      stripeSubId: sub.id,
      stripeCustomerId: sub.customer,
      plan: ended ? "free" : (sub.metadata?.plan ?? row.plan ?? "pro"),
      interval: ended ? null : (sub.metadata?.interval ?? row.interval ?? null),
      status: mapStripeStatus(sub.status),
      currentPeriodEnd: unixToIso(subPeriodEnd(sub)),
      cancelAtPeriodEnd: !ended && !!sub.cancel_at_period_end,
    });
    return json({ ok: true, synced: true });
  } catch {
    // Stripe unreachable or the sub belongs to another (old test) environment —
    // leave the local row alone rather than guessing.
    return json({ ok: true, synced: false });
  }
};
