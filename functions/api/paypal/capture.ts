import { getSessionUser, json, newId, readJson, type Ctx } from "../_utils";
import { LICENSE_PRICES, paypalCall, paypalConfigured, paypalToken } from "./_paypal";

// POST { orderId } -> captures the PayPal order and records the purchased
// licenses in sync_orders (tier column holds personal|commercial|professional,
// stripe_session_id column holds the PayPal order id).

interface PayPalOrder {
  id: string;
  status: string;
  purchase_units?: {
    custom_id?: string;
    items?: { sku?: string; unit_amount?: { value?: string } }[];
  }[];
}

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  if (!paypalConfigured(ctx.env)) return json({ error: "Payments are not configured yet" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Sign in first", code: "auth" }, 401);

  const body = await readJson<{ orderId?: string }>(ctx.request);
  const orderId = body?.orderId?.trim();
  if (!orderId || !/^[\w-]{1,40}$/.test(orderId)) return json({ error: "orderId required" }, 400);

  const token = await paypalToken(ctx.env);

  // Read the order WE created earlier — items and prices there are trusted.
  const order = await paypalCall<PayPalOrder>(ctx.env, token, "GET", `/v2/checkout/orders/${orderId}`);
  const unit = order.purchase_units?.[0];
  if (unit?.custom_id !== user.id) return json({ error: "Order does not belong to you" }, 403);

  // Already paid (double click / retry) — don't capture twice, don't re-log.
  if (order.status !== "COMPLETED") {
    const captured = await paypalCall<{ status: string }>(
      ctx.env,
      token,
      "POST",
      `/v2/checkout/orders/${orderId}/capture`,
      {},
    );
    if (captured.status !== "COMPLETED") {
      return json({ error: `Payment not completed (${captured.status})` }, 402);
    }
  }

  // Record each license once per order.
  const existing = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM sync_orders WHERE stripe_session_id = ?1`,
  )
    .bind(orderId)
    .first<{ n: number }>();

  if ((existing?.n ?? 0) === 0) {
    for (const item of unit?.items ?? []) {
      const [slug = "", tier = ""] = (item.sku ?? "").split("|");
      // Record what PayPal actually charged (the order was priced from the
      // live site_config values); fallback to the static defaults.
      const price = Number(item.unit_amount?.value ?? 0) || LICENSE_PRICES[tier] || 0;
      if (!slug || !tier) continue;
      const track = await ctx.env.DB.prepare(`SELECT id FROM tracks WHERE slug = ?1`)
        .bind(slug)
        .first<{ id: string }>();
      await ctx.env.DB.prepare(
        `INSERT INTO sync_orders (id, user_id, track_id, tier, price, stripe_session_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
        .bind(newId("ord"), user.id, track?.id ?? slug, tier, price, orderId)
        .run();
    }
  }

  return json({ ok: true });
};
