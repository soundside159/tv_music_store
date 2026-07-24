import {
  deleteUserAccount,
  getSessionUser,
  json,
  OWNER_EMAIL,
  readJson,
  SESSION_COOKIE,
  type Ctx,
} from "./_utils";

// GET    -> current user + subscription + downloads used this month (Free limit).
// PATCH  { name } -> update display name.
// DELETE -> self-delete the account (customers only: admins and composer
//           accounts are removed by the owner from Admin → Users; tracks are
//           never touched — see deleteUserAccount).

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ user: null }, 200);

  // Self-healing: the owner is always admin, no matter how the account was created.
  if (user.email === OWNER_EMAIL && user.role !== "admin") {
    await ctx.env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?1`).bind(user.id).run();
    user.role = "admin";
  }

  // cancel_at_period_end is a lazy column (added by the Stripe webhook helper)
  // — fall back to the old shape on databases that don't have it yet.
  let subscription: Record<string, unknown> | null = null;
  try {
    subscription = await ctx.env.DB.prepare(
      `SELECT plan, interval, status, current_period_end, cancel_at_period_end
         FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
    )
      .bind(user.id)
      .first();
  } catch {
    subscription = await ctx.env.DB.prepare(
      `SELECT plan, interval, status, current_period_end
         FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
    )
      .bind(user.id)
      .first();
  }

  // Downloads made under a purchased one-time license don't burn the free
  // limit — mirrors the exclusion in /api/download.
  // DISTINCT tracks — same rule as /api/download: the free plan is 3 TRACKS a
  // month, and re-downloading one you already took costs nothing.
  const used = await ctx.env.DB.prepare(
    `SELECT COUNT(DISTINCT track_id) AS n FROM download_log
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

export const onRequestDelete = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role === "admin" || user.email === OWNER_EMAIL) {
    return json({ error: "Admin accounts cannot self-delete" }, 403);
  }
  // An ACTIVE paid subscription must be canceled first — otherwise Stripe
  // would keep charging a deleted account. Our subscriptions table mirrors
  // Stripe via webhooks, so this check is reliable. "canceled" status means
  // it already won't renew — deleting is fine then.
  const activeSub = await ctx.env.DB.prepare(
    `SELECT plan, status FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ plan: string; status: string }>();
  if (activeSub && activeSub.plan !== "free" && activeSub.status === "active") {
    return json(
      {
        error: "You have an active subscription — cancel it first so you are not charged again",
        code: "subscription",
      },
      409,
    );
  }
  const composer = await ctx.env.DB.prepare(
    `SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`,
  )
    .bind(user.id)
    .first();
  if (composer) {
    return json(
      { error: "Composer accounts are removed by the site owner — contact us" },
      403,
    );
  }

  await deleteUserAccount(ctx.env.DB, user.id, user.email);
  // Expire the session cookie.
  return json(
    { ok: true },
    200,
    { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
  );
};
