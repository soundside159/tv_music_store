import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "./_utils";

// GET -> current user + subscription + downloads used this month (Free limit).
// PATCH { name } -> update display name.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ user: null }, 200);

  // Self-healing: the owner is always admin, no matter how the account was created.
  if (user.email === OWNER_EMAIL && user.role !== "admin") {
    await ctx.env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?1`).bind(user.id).run();
    user.role = "admin";
  }

  const subscription = await ctx.env.DB.prepare(
    `SELECT plan, interval, status, current_period_end
       FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first();

  // Downloads made under a purchased one-time license don't burn the free
  // limit — mirrors the exclusion in /api/download.
  const used = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM download_log
      WHERE user_id = ?1 AND format = 'mp3'
        AND plan_at_download != 'license'
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

export const onRequestPatch = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const body = await readJson<{ name?: string }>(ctx.request);
  const name = body?.name?.trim();
  if (!name || name.length > 60) {
    return json({ error: "Name must be 1-60 characters" }, 400);
  }

  await ctx.env.DB.prepare(`UPDATE users SET name = ?1 WHERE id = ?2`).bind(name, user.id).run();
  return json({ ok: true });
};
