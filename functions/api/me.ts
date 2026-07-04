import { getSessionUser, json, type Ctx } from "./_utils";

// GET -> current user + subscription + downloads used this month (Free limit).

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ user: null }, 200);

  const subscription = await ctx.env.DB.prepare(
    `SELECT plan, interval, status, current_period_end
       FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first();

  const used = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM download_log
      WHERE user_id = ?1 AND format = 'mp3'
        AND created_at >= datetime('now', 'start of month')`,
  )
    .bind(user.id)
    .first<{ n: number }>();

  return json({
    user,
    subscription: subscription ?? { plan: "free", status: "active" },
    downloadsUsedThisMonth: used?.n ?? 0,
  });
};
