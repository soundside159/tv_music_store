import { getSessionUser, json, readJson, type Ctx } from "../_utils";
import { paypalCall, paypalConfigured, paypalToken, validateItems } from "./_paypal";

// POST { items: [{ slug, tier }] } -> { id } PayPal order id.
// Prices are computed server-side from the tier — never trusted from the client.

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  if (!paypalConfigured(ctx.env)) return json({ error: "Payments are not configured yet" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in to buy licenses", code: "auth" }, 401);

  const body = await readJson<{ items?: unknown }>(ctx.request);
  const items = validateItems(body?.items);
  if (!items) return json({ error: "Invalid cart items" }, 400);

  // Nice item names in the PayPal receipt when the track exists in D1.
  const named = await Promise.all(
    items.map(async (it) => {
      const row = await ctx.env.DB.prepare(`SELECT title FROM tracks WHERE slug = ?1`)
        .bind(it.slug)
        .first<{ title: string }>();
      return { ...it, title: row?.title ?? it.slug };
    }),
  );

  const total = named.reduce((s, i) => s + i.price, 0);
  try {
    const token = await paypalToken(ctx.env);
    const order = await paypalCall<{ id: string }>(ctx.env, token, "POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: user.id,
          amount: {
            currency_code: "USD",
            value: total.toFixed(2),
            breakdown: {
              item_total: { currency_code: "USD", value: total.toFixed(2) },
            },
          },
          items: named.map((i) => ({
            name: `${i.title} — ${i.tier} license`.slice(0, 127),
            quantity: "1",
            unit_amount: { currency_code: "USD", value: i.price.toFixed(2) },
            sku: `${i.slug}|${i.tier}`.slice(0, 127),
          })),
        },
      ],
    });
    return json({ ok: true, id: order.id });
  } catch (e) {
    // Surface the real PayPal reason (auth failure, env mismatch, restricted
    // account, etc.) instead of a black-box 500 -> generic "Could not start".
    const msg = e instanceof Error ? e.message : "PayPal request failed";
    return json({ error: `PayPal: ${msg}`, env: ctx.env.PAYPAL_ENV === "sandbox" ? "sandbox" : "live" }, 502);
  }
};
