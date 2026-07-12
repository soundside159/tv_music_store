import { getSessionUser, json, newId, readJson, type Ctx } from "../_utils";
import { allocateEvent, recordRevenueEvent } from "../_revenue";
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
    payments?: {
      captures?: {
        id?: string;
        seller_receivable_breakdown?: {
          gross_amount?: { value?: string; currency_code?: string };
          paypal_fee?: { value?: string };
        };
      }[];
    };
  }[];
}

const cents = (value: string | undefined): number =>
  Math.max(0, Math.round(Number(value ?? 0) * 100));

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
    // What PayPal actually kept: gross and its fee come from the capture itself,
    // so the ledger books real money, not our list price.
    const fresh = await paypalCall<PayPalOrder>(
      ctx.env,
      token,
      "GET",
      `/v2/checkout/orders/${orderId}`,
    );
    const capture = fresh.purchase_units?.[0]?.payments?.captures?.[0];
    const breakdown = capture?.seller_receivable_breakdown;
    const capturedGross = cents(breakdown?.gross_amount?.value);
    const capturedFee = cents(breakdown?.paypal_fee?.value);
    const currency = breakdown?.gross_amount?.currency_code?.toLowerCase() ?? "usd";

    const items = (unit?.items ?? [])
      .map((item) => {
        const [slug = "", tier = ""] = (item.sku ?? "").split("|");
        const price = Number(item.unit_amount?.value ?? 0) || LICENSE_PRICES[tier] || 0;
        return { slug, tier, priceCents: Math.round(price * 100) };
      })
      .filter((i) => i.slug && i.tier);

    const itemsTotal = items.reduce((sum, i) => sum + i.priceCents, 0) || 1;

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
        .bind(licenseId, user.id, trackId, item.tier, item.priceCents / 100, orderId)
        .run();

      // One ledger event per licensed TRACK — a cart with three tracks pays
      // three composers. Gross and fee are shared out in proportion to price;
      // PayPal reports them per capture, not per line.
      const share = item.priceCents / itemsTotal;
      const gross = capturedGross > 0 ? Math.round(capturedGross * share) : item.priceCents;
      const fee =
        capturedFee > 0
          ? Math.round(capturedFee * share)
          : Math.round(gross * 0.034) + 30; // PayPal's usual take, if it stayed silent
      const eventId = await recordRevenueEvent(ctx.env.DB, {
        source: "license",
        userId: user.id,
        provider: "paypal",
        providerRef: `${capture?.id ?? orderId}:${item.slug}:${item.tier}`,
        grossCents: gross,
        // PayPal is the merchant of record for the tax it collects; when it
        // reports none, there is none to strip out.
        taxCents: 0,
        feeCents: fee,
        currency,
        trackId,
        orderId: licenseId,
      });
      // A one-off license has no cycle to wait for — split it right away.
      if (eventId) await allocateEvent(ctx.env.DB, eventId);
    }
  }

  return json({ ok: true });
};
