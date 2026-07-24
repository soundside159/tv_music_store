import { getSessionUser, json, OWNER_EMAIL, type Ctx, type D1Database } from "../_utils";
import {
  mapStripeStatus,
  stripeCall,
  type StripeSubscription,
  subCancelScheduled,
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
//
// GET ?email=<user> — ADMIN-ONLY diagnostic: shows the local subscription row,
// what Stripe says about it (status / cancel_at / cancel_at_period_end /
// period ends), heals the row, and shows it again. Open it in the browser
// while signed in as admin when a plan state ever looks wrong on the site.

const latestSubRow = (db: D1Database, userId: string) =>
  db
    .prepare(`SELECT * FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`)
    .bind(userId)
    .first<Record<string, unknown> & { stripe_sub_id?: string | null }>();

/** Fetch the sub from Stripe and mirror it into D1. Returns what Stripe said. */
const healUser = async (
  db: D1Database,
  key: string,
  userId: string,
  row: { stripe_sub_id?: string | null; plan?: unknown; interval?: unknown },
): Promise<{ synced: boolean; stripe?: Record<string, unknown>; error?: string }> => {
  if (!row.stripe_sub_id) return { synced: false, error: "no stripe_sub_id on the local row" };
  try {
    const sub = await stripeCall<StripeSubscription>(
      key,
      "GET",
      `/subscriptions/${row.stripe_sub_id}`,
    );
    // "canceled" from Stripe = fully ENDED (the period ran out) -> back to
    // Free. A portal cancel that still runs shows status active + a scheduled
    // cancel (cancel_at on 2025+ API, cancel_at_period_end before that).
    const ended = sub.status === "canceled";
    await upsertSubscription(db, userId, {
      stripeSubId: sub.id,
      stripeCustomerId: sub.customer,
      plan: ended ? "free" : (sub.metadata?.plan ?? (row.plan as string) ?? "pro"),
      interval: ended ? null : (sub.metadata?.interval ?? (row.interval as string) ?? null),
      status: mapStripeStatus(sub.status),
      currentPeriodEnd: unixToIso(subPeriodEnd(sub)),
      cancelAtPeriodEnd: !ended && subCancelScheduled(sub),
    });
    return {
      synced: true,
      stripe: {
        id: sub.id,
        status: sub.status,
        cancel_at: sub.cancel_at ?? null,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        cancel_scheduled: subCancelScheduled(sub),
        period_end: subPeriodEnd(sub),
      },
    };
  } catch (e) {
    // Stripe unreachable or the sub belongs to another (old test) environment —
    // leave the local row alone rather than guessing.
    return { synced: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  if (!key) return json({ ok: true, synced: false });

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const row = await latestSubRow(ctx.env.DB, user.id);
  if (!row?.stripe_sub_id) return json({ ok: true, synced: false });

  const result = await healUser(ctx.env.DB, key, user.id, row);
  return json({ ok: true, synced: result.synced });
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Stripe not configured" }, 503);

  const admin = await getSessionUser(ctx);
  if (!admin || (admin.role !== "admin" && admin.email !== OWNER_EMAIL)) {
    return json({ error: "Admins only" }, 403);
  }

  const email = (new URL(ctx.request.url).searchParams.get("email") ?? admin.email)
    .trim()
    .toLowerCase();
  const target = await ctx.env.DB.prepare(
    `SELECT id, email FROM users WHERE lower(email) = ?1 LIMIT 1`,
  )
    .bind(email)
    .first<{ id: string; email: string }>();
  if (!target) return json({ error: `No user with email ${email}` }, 404);

  const before = await latestSubRow(ctx.env.DB, target.id);
  if (!before) return json({ user: target, subscriptionRow: null, note: "no subscription row" });

  const result = await healUser(ctx.env.DB, key, target.id, before);
  const after = await latestSubRow(ctx.env.DB, target.id);
  return json({ user: target, before, stripe: result.stripe ?? null, error: result.error ?? null, after });
};
