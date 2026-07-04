import {
  ensurePasswordColumn,
  hashPassword,
  json,
  newId,
  openSession,
  OWNER_EMAIL,
  readJson,
  type Ctx,
} from "../_utils";

// POST { email, password, name? } -> creates the account with a free plan and
// signs in. The owner email automatically becomes admin.
//
// Test-phase note: if the email already exists WITHOUT a password (created via
// the login-code flow), the password is attached to it. Before public launch,
// email ownership must be verified (Resend) — tracked in docs/SETUP_BACKEND.md.

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const body = await readJson<{ email?: string; password?: string; name?: string }>(ctx.request);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? "";
  const name = body?.name?.trim() || null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Valid email required" }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 400);
  }

  await ensurePasswordColumn(ctx.env.DB);

  const role = email === OWNER_EMAIL ? "admin" : "customer";

  const existing = await ctx.env.DB.prepare(
    `SELECT id, email, name, role, password_hash FROM users WHERE email = ?1`,
  )
    .bind(email)
    .first<{ id: string; email: string; name: string | null; role: string; password_hash: string | null }>();

  const passwordHash = await hashPassword(password);

  let user: { id: string; email: string; name: string | null; role: string };

  if (existing) {
    if (existing.password_hash) {
      return json({ error: "Account already exists — sign in instead" }, 409);
    }
    await ctx.env.DB.prepare(
      `UPDATE users SET password_hash = ?1, name = COALESCE(?2, name), role = ?3 WHERE id = ?4`,
    )
      .bind(passwordHash, name, role === "admin" ? "admin" : existing.role, existing.id)
      .run();
    user = { id: existing.id, email, name: name ?? existing.name, role: role === "admin" ? "admin" : existing.role };
  } else {
    const id = newId("usr");
    await ctx.env.DB.prepare(
      `INSERT INTO users (id, email, name, role, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
      .bind(id, email, name, role, passwordHash)
      .run();
    await ctx.env.DB.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, status) VALUES (?1, ?2, 'free', 'active')`,
    )
      .bind(newId("sub"), id)
      .run();
    user = { id, email, name, role };
  }

  const cookie = await openSession(ctx.env.DB, user.id);
  return json({ ok: true, user }, 200, { "set-cookie": cookie });
};
