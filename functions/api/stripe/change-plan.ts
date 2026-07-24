import { getSessionUser, json, readJson, type Ctx } from "../_utils";
import { ensureStripeColumns, stripeCall } from "./_stripe";
import { ensurePrices, type PlanRow } from "./checkout";

// POST { plan: "pro"|"max", interval: "monthly"|"annual" }
// Switches the customer's EXISTING subscription to a different plan/interval in
// place — Stripe prorates the difference, so there's no second subscription and
// no "cancel first" dance. Upgrades bill the prorated difference immediately
// (instant access); downgrades credit toward the next invoice. The webhook
// (customer.subscription.updated) writes the final state; we also reflect the
// new plan locally right away so the UI updates without waiting.
//
// If the user has no active subscription, returns 409 { code: "nosub" } so the
// frontend falls back to a normal Checkout.

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };

interface StripeSub {
  id: string;
  status: string;
  current_period_end?: number;
  items: { data: { id: string; price: { id: string } }[] };
}

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Payments are not configured yet" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in to change your plan", code: "auth" }, 401);

  const body = await readJson<{ plan?: string; interval?: string }>(ctx.request);
  const planId = body?.plan;
  const interval = body?.interval === "monthly" ? "monthly" : "annual";
  if (planId !== "pro" && planId !== "max") {
    return json({ error: "plan must be 'pro' or 'max'" }, 400);
  }

  await ensureStripeColumns(ctx.env.DB);
  const current = await ctx.env.DB.prepare(
    `SELECT stripe_sub_id, plan, interval, status FROM subscriptions
      WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{
      stripe_sub_id: string | null;
      plan: string | null;
      interval: string | null;
      status: string | null;
    }>();

  const liveStatus = current?.status ?? "";
  const hasLive =
    current?.stripe_sub_id && ["active", "trialing", "past_due"].includes(liveStatus);
  if (!hasLive) {
    return json({ error: "No active subscription to change", code: "nosub" }, 409);
  }

  // Same rules the plan cards enforce (lib/billing.ts planCardAction) — the
  // server is the boundary, the UI is just polite:
  //  - annual -> monthly is not offered (the paid year would strand a credit);
  //  - Max -> Pro is not offered (cancel and resubscribe instead).
  if (current?.interval === "annual" && interval === "monthly") {
    return json(
      { error: "Your plan is billed annually — switching to monthly isn't available while the paid year runs" },
      400,
    );
  }
  if (PLAN_RANK[planId] < PLAN_RANK[current?.plan ?? "free"]) {
    return json(
      { error: "Moving to a smaller plan isn't available — cancel your current plan and it stays active to the end of the paid period" },
      400,
    );
  }

  const planRow = await ctx.env.DB.prepare(
    `SELECT id, name, price_monthly, price_annual_per_month,
            stripe_price_monthly, stripe_price_annual
       FROM plan_config WHERE id = ?1`,
  )
    .bind(planId)
    .first<PlanRow>();
  if (!planRow) return json({ error: "Plan not found" }, 404);

  const newPrice = await ensurePrices(key, ctx, planRow, interval);

  // Current subscription item (there is exactly one line for our plans).
  const sub = await stripeCall<StripeSub>(key, "GET", `/subscriptions/${current!.stripe_sub_id}`);
  const item = sub.items?.data?.[0];
  if (!item) return json({ error: "Subscription has no items to update" }, 502);
  if (item.price.id === newPrice) {
    return json({ ok: true, plan: planId, interval, unchanged: true });
  }

  // Bill the prorated difference right away for a bigger plan AND for a
  // monthly -> annual switch (a commitment upgrade — the customer expects to
  // pay for the year now, not on some future invoice).
  const upgrade =
    PLAN_RANK[planId] > PLAN_RANK[current?.plan ?? "pro"] ||
    (current?.interval === "monthly" && interval === "annual");
  const updated = await stripeCall<StripeSub>(key, "POST", `/subscriptions/${current!.stripe_sub_id}`, {
    "items[0][id]": item.id,
    "items[0][price]": newPrice,
    // Upgrade: charge the prorated difference now → access flips immediately.
    // Downgrade: credit toward the next invoice, no surprise charge.
    proration_behavior: upgrade ? "always_invoice" : "create_prorations",
    "metadata[plan]": planId,
    "metadata[interval]": interval,
    "metadata[user_id]": user.id,
  });

  // Reflect locally at once (webhook confirms with the authoritative state).
  await ctx.env.DB.prepare(
    `UPDATE subscriptions SET plan = ?1, interval = ?2 WHERE user_id = ?3 AND stripe_sub_id = ?4`,
  )
    .bind(planId, interval, user.id, current!.stripe_sub_id)
    .run();

  return json({ ok: true, plan: planId, interval, upgrade, status: updated.status });
};
