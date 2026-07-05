import { json, type Ctx } from "../_utils";
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
        subscription?: string | null;
        client_reference_id?: string | null;
      };
      if (s.subscription) {
        const sub = await stripeCall<StripeSubscription>(
          key,
          "GET",
          `/subscriptions/${s.subscription}`,
        );
        await applySubscription(ctx, sub, s.client_reference_id);
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
