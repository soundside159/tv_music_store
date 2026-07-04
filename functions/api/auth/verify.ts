import {
  json,
  newId,
  OWNER_EMAIL,
  readJson,
  sessionCookieHeader,
  SESSION_DAYS,
  type Ctx,
} from "../_utils";

// POST { email, code } -> verifies the code, creates user (if new) with a
// free subscription, opens a session (httpOnly cookie).

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const body = await readJson<{ email?: string; code?: string }>(ctx.request);
  const email = body?.email?.trim().toLowerCase();
  const code = body?.code?.trim();
  if (!email || !code) return json({ error: "Email and code required" }, 400);

  const row = await ctx.env.DB.prepare(
    `SELECT id FROM auth_codes
      WHERE email = ?1 AND code = ?2 AND used = 0 AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1`,
  )
    .bind(email, code)
    .first<{ id: number }>();
  if (!row) return json({ error: "Invalid or expired code" }, 401);

  await ctx.env.DB.prepare(`UPDATE auth_codes SET used = 1 WHERE id = ?1`).bind(row.id).run();

  // Find or create user
  let user = await ctx.env.DB.prepare(`SELECT id, email, name, role FROM users WHERE email = ?1`)
    .bind(email)
    .first<{ id: string; email: string; name: string | null; role: string }>();

  const ownerRole = email === OWNER_EMAIL ? "admin" : "customer";

  if (!user) {
    const id = newId("usr");
    await ctx.env.DB.prepare(`INSERT INTO users (id, email, role) VALUES (?1, ?2, ?3)`)
      .bind(id, email, ownerRole)
      .run();
    await ctx.env.DB.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, status) VALUES (?1, ?2, 'free', 'active')`,
    )
      .bind(newId("sub"), id)
      .run();
    user = { id, email, name: null, role: ownerRole };
  } else if (ownerRole === "admin" && user.role !== "admin") {
    await ctx.env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?1`).bind(user.id).run();
    user = { ...user, role: "admin" };
  }

  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  await ctx.env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?1, ?2, datetime('now', '+${SESSION_DAYS} days'))`,
  )
    .bind(token, user.id)
    .run();

  return json(
    { ok: true, user },
    200,
    { "set-cookie": sessionCookieHeader(token, SESSION_DAYS * 86400) },
  );
};
