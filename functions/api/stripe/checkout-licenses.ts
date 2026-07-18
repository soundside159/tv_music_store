import { getLicensePrices, getSessionUser, json, readJson, type Ctx } from "../_utils";
import { validateItems } from "../paypal/_paypal";
import { stripeCall } from "./_stripe";

// POST { items: [{ slug, tier }] } -> { url } Stripe Checkout page for a
// ONE-TIME card payment of track licenses (the card twin of /api/paypal/order).
// Prices are computed server-side from site_config — never trusted from the
// client — exactly like the PayPal path. Each Checkout line carries slug/tier
// in its product metadata; fulfilment happens in webhook.ts when Stripe sends
// checkout.session.completed for this mode=payment session.

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Card payments are not configured yet" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in to buy licenses", code: "auth" }, 401);

  const body = await readJson<{ items?: unknown }>(ctx.request);
  // Live prices from the admin-editable site_config (fallback = defaults).
  const prices = await getLicensePrices(ctx.env.DB);
  const items = validateItems(body?.items, prices);
  if (!items) return json({ error: "Invalid cart items" }, 400);

  // Nice item names in the Stripe receipt when the track exists in D1.
  const named = await Promise.all(
    items.map(async (it) => {
      const row = await ctx.env.DB.prepare(`SELECT title FROM tracks WHERE slug = ?1`)
        .bind(it.slug)
        .first<{ title: string }>();
      return { ...it, title: row?.title ?? it.slug };
    }),
  );

  const origin = new URL(ctx.request.url).origin;
  const params: Record<string, string | number> = {
    mode: "payment",
    client_reference_id: user.id,
    customer_email: user.email,
    // Cart clears itself and forwards to /account when it sees checkout=success.
    success_url: `${origin}/cart?checkout=success`,
    cancel_url: `${origin}/cart?checkout=canceled`,
    "metadata[kind]": "license_cart",
    "metadata[user_id]": user.id,
    "payment_intent_data[metadata][kind]": "license_cart",
    "payment_intent_data[metadata][user_id]": user.id,
  };
  named.forEach((it, i) => {
    params[`line_items[${i}][quantity]`] = 1;
    params[`line_items[${i}][price_data][currency]`] = "usd";
    params[`line_items[${i}][price_data][unit_amount]`] = Math.round(it.price * 100);
    params[`line_items[${i}][price_data][product_data][name]`] =
      `${it.title} — ${it.tier} license`.slice(0, 250);
    params[`line_items[${i}][price_data][product_data][metadata][slug]`] = it.slug;
    params[`line_items[${i}][price_data][product_data][metadata][tier]`] = it.tier;
  });

  try {
    const session = await stripeCall<{ id: string; url: string }>(
      key,
      "POST",
      "/checkout/sessions",
      params,
    );
    return json({ ok: true, url: session.url });
  } catch (e) {
    // Surface the real Stripe reason instead of a black-box 500.
    const msg = e instanceof Error ? e.message : "Stripe request failed";
    return json({ error: `Stripe: ${msg}` }, 502);
  }
};
