import { getSessionUser, json, readJson, type Ctx } from "../_utils";
import { ensureStripeColumns, stripeCall } from "./_stripe";

// POST { plan: "pro"|"max", interval: "monthly"|"annual" }
// -> { url } Stripe Checkout page for a subscription.
//
// Products/prices are created lazily on first checkout and their ids are
// stored in plan_config.stripe_price_monthly / stripe_price_annual, so the
// owner never has to click anything in the Stripe dashboard.

export interface PlanRow {
  id: string;
  name: string;
  price_monthly: number;
  price_annual_per_month: number;
  stripe_price_monthly: string | null;
  stripe_price_annual: string | null;
}

export const ensurePrices = async (
  key: string,
  ctx: Ctx,
  plan: PlanRow,
  interval: "monthly" | "annual",
): Promise<string> => {
  const existing = interval === "annual" ? plan.stripe_price_annual : plan.stripe_price_monthly;
  if (existing) {
    // A stored id from a PREVIOUS Stripe environment (switching sandbox, or
    // test↔live) does not resolve here — reusing it makes Checkout fail with
    // "No such price". Verify it exists AND is active in THIS environment;
    // otherwise fall through and (re)create the product + prices.
    try {
      const p = await stripeCall<{ id: string; active?: boolean }>(key, "GET", `/prices/${existing}`);
      if (p?.id && p.active !== false) return p.id;
    } catch {
      // gone / foreign id — recreate below
    }
  }

  const product = await stripeCall<{ id: string }>(key, "POST", "/products", {
    name: `TV Music Store ${plan.name}`,
    "metadata[plan]": plan.id,
  });
  const monthly = await stripeCall<{ id: string }>(key, "POST", "/prices", {
    product: product.id,
    currency: "usd",
    unit_amount: Math.round(plan.price_monthly * 100),
    "recurring[interval]": "month",
    "metadata[plan]": plan.id,
    "metadata[interval]": "monthly",
  });
  const annual = await stripeCall<{ id: string }>(key, "POST", "/prices", {
    product: product.id,
    currency: "usd",
    unit_amount: Math.round(plan.price_annual_per_month * 12 * 100),
    "recurring[interval]": "year",
    "metadata[plan]": plan.id,
    "metadata[interval]": "annual",
  });
  await ctx.env.DB.prepare(
    `UPDATE plan_config SET stripe_price_monthly = ?1, stripe_price_annual = ?2 WHERE id = ?3`,
  )
    .bind(monthly.id, annual.id, plan.id)
    .run();
  return interval === "annual" ? annual.id : monthly.id;
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Payments are not configured yet" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in to subscribe", code: "auth" }, 401);

  const body = await readJson<{ plan?: string; interval?: string }>(ctx.request);
  const planId = body?.plan;
  const interval = body?.interval === "monthly" ? "monthly" : "annual";
  if (planId !== "pro" && planId !== "max") {
    return json({ error: "plan must be 'pro' or 'max'" }, 400);
  }

  const plan = await ctx.env.DB.prepare(
    `SELECT id, name, price_monthly, price_annual_per_month,
            stripe_price_monthly, stripe_price_annual
       FROM plan_config WHERE id = ?1`,
  )
    .bind(planId)
    .first<PlanRow>();
  if (!plan) return json({ error: "Plan not found" }, 404);

  // Reuse the Stripe customer if this user already has one (upgrades/downgrades).
  await ensureStripeColumns(ctx.env.DB);
  const sub = await ctx.env.DB.prepare(
    `SELECT stripe_customer_id FROM subscriptions
      WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ stripe_customer_id: string | null }>();

  const origin = new URL(ctx.request.url).origin;
  try {
    const priceId = await ensurePrices(key, ctx, plan, interval);
    const session = await stripeCall<{ id: string; url: string }>(key, "POST", "/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      // Land on the Billing dashboard (plan + period + invoices), the subscription
      // twin of the Licenses page a one-time purchase returns to. checkout=success
      // still triggers the Welcome modal.
      success_url: `${origin}/account?section=billing&checkout=success`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      "subscription_data[metadata][user_id]": user.id,
      "subscription_data[metadata][plan]": plan.id,
      "subscription_data[metadata][interval]": interval,
      ...(sub?.stripe_customer_id
        ? { customer: sub.stripe_customer_id }
        : { customer_email: user.email }),
    });
    return json({ ok: true, url: session.url });
  } catch (e) {
    // Surface the real Stripe reason (e.g. a stale price / bad key) instead of a
    // black-box 500 that the UI shows as "Checkout is unavailable".
    const msg = e instanceof Error ? e.message : "Stripe request failed";
    return json({ error: `Stripe: ${msg}` }, 502);
  }
};
