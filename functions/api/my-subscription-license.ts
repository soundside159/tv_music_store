import { getSessionUser, json, type Ctx } from "./_utils";
import { getOrCreateSubscriptionLicense } from "./_licenses";

// GET /api/my-subscription-license
//
// The ONE licence a subscriber holds: it covers the whole library for the period
// he paid for. Issued lazily the first time he looks at it, re-used for the rest
// of the period, replaced by a new code when the subscription renews.
//
// Free plan -> nothing (free downloads carry attribution instead of a licence).

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const sub = await ctx.env.DB.prepare(
    `SELECT plan, status, current_period_end
       FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ plan: string; status: string; current_period_end: string | null }>();

  const plan = sub?.status === "active" ? (sub.plan ?? "free") : "free";
  if (plan === "free") return json({ license: null, plan: "free" });

  const license = await getOrCreateSubscriptionLicense(
    ctx.env,
    user.id,
    plan,
    sub?.current_period_end ?? null,
  );

  return json({
    plan,
    license: license && {
      code: license.code,
      plan: license.plan,
      periodStart: license.periodStart,
      periodEnd: license.periodEnd,
    },
  });
};
