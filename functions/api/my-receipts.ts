import { getSessionUser, json, type Ctx } from "./_utils";
import { stripeCall } from "./stripe/_stripe";

// Account -> Receipts & Invoices.
//
// GET            -> the signed-in customer's payments (subscriptions + one-time
//                   license carts), straight from the revenue ledger — so nobody
//                   has to dig through email for a receipt.
// GET ?open=<id> -> 302 to the FRESH Stripe document for that payment (hosted
//                   receipt / invoice page). Resolved on demand — we never store
//                   Stripe's hosted URLs, they are not ours to keep alive.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const openId = new URL(ctx.request.url).searchParams.get("open");

  if (openId) {
    const key = ctx.env.STRIPE_SECRET_KEY;
    if (!key) return json({ error: "Payments are not configured" }, 503);
    const ev = await ctx.env.DB.prepare(
      `SELECT id, user_id, provider, provider_ref FROM revenue_events WHERE id = ?1`,
    )
      .bind(openId)
      .first<{
        id: string;
        user_id: string | null;
        provider: string | null;
        provider_ref: string | null;
      }>();
    // Strictly the customer's own documents.
    if (!ev || ev.user_id !== user.id) return json({ error: "Not found" }, 404);
    if (ev.provider !== "stripe" || !ev.provider_ref) {
      return json({ error: "No online document for this payment" }, 404);
    }

    const token = ev.provider_ref.split(":")[0];
    try {
      let target: string | null = null;
      if (token.startsWith("in_")) {
        // Subscription payment -> the invoice's hosted page (receipt + PDF).
        const inv = await stripeCall<{
          hosted_invoice_url?: string | null;
          invoice_pdf?: string | null;
        }>(key, "GET", `/invoices/${token}`);
        target = inv.hosted_invoice_url ?? inv.invoice_pdf ?? null;
      } else {
        // One-time cart -> the charge's hosted receipt.
        let piId = token;
        if (token.startsWith("cs_")) {
          const s = await stripeCall<{ payment_intent?: string | null }>(
            key,
            "GET",
            `/checkout/sessions/${token}`,
          );
          piId = s.payment_intent ?? "";
        }
        if (piId) {
          const pi = await stripeCall<{
            latest_charge?: { receipt_url?: string | null } | string | null;
          }>(key, "GET", `/payment_intents/${piId}?expand[]=latest_charge`);
          const charge = pi.latest_charge;
          target = charge && typeof charge === "object" ? (charge.receipt_url ?? null) : null;
        }
      }
      if (!target) return json({ error: "Stripe has no document for this payment yet" }, 404);
      return new Response(null, {
        status: 302,
        headers: { location: target, "cache-control": "no-store" },
      });
    } catch {
      return json({ error: "Could not reach Stripe for this document — try again" }, 502);
    }
  }

  // The list. Refunded payments stay visible, plainly marked.
  interface Row {
    id: string;
    source: string;
    provider: string | null;
    gross_cents: number;
    currency: string | null;
    status: string | null;
    created_at: string;
    track_title: string | null;
  }
  let rows: Row[] = [];
  try {
    rows = (
      await ctx.env.DB.prepare(
        `SELECT e.id, e.source, e.provider, e.gross_cents, e.currency, e.status, e.created_at,
                t.title AS track_title
           FROM revenue_events e
           LEFT JOIN tracks t ON t.id = e.track_id
          WHERE e.user_id = ?1
          ORDER BY e.created_at DESC LIMIT 100`,
      )
        .bind(user.id)
        .all<Row>()
    ).results;
  } catch {
    rows = []; // ledger tables not created yet
  }
  return json({ receipts: rows });
};
