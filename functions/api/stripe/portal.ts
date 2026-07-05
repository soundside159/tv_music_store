import { getSessionUser, json, type Ctx } from "../_utils";
import { ensureStripeColumns, stripeCall } from "./_stripe";

// POST -> { url } Stripe Billing Portal (manage / cancel / change card).
// Requires the customer to exist (i.e. the user has been through checkout).

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Payments are not configured yet" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in first", code: "auth" }, 401);

  await ensureStripeColumns(ctx.env.DB);
  const sub = await ctx.env.DB.prepare(
    `SELECT stripe_customer_id FROM subscriptions
      WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ stripe_customer_id: string | null }>();

  if (!sub?.stripe_customer_id) {
    return json({ error: "No billing profile yet — subscribe first" }, 400);
  }

  const origin = new URL(ctx.request.url).origin;
  const session = await stripeCall<{ url: string }>(key, "POST", "/billing_portal/sessions", {
    customer: sub.stripe_customer_id,
    return_url: `${origin}/account`,
  });

  return json({ ok: true, url: session.url });
};
