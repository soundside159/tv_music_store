import {
  ensurePasswordColumn,
  json,
  openSession,
  OWNER_EMAIL,
  readJson,
  verifyPassword,
  type Ctx,
} from "../_utils";

// POST { email, password } -> verifies the password and opens a session.
// The owner email is promoted to admin on every login (self-healing).

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const body = await readJson<{ email?: string; password?: string }>(ctx.request);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? "";
  if (!email || !password) return json({ error: "Email and password required" }, 400);

  await ensurePasswordColumn(ctx.env.DB);

  const user = await ctx.env.DB.prepare(
    `SELECT id, email, name, role, password_hash FROM users WHERE email = ?1`,
  )
    .bind(email)
    .first<{ id: string; email: string; name: string | null; role: string; password_hash: string | null }>();

  if (!user?.password_hash) {
    return json({ error: "Wrong email or password" }, 401);
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return json({ error: "Wrong email or password" }, 401);

  let role = user.role;
  if (email === OWNER_EMAIL && role !== "admin") {
    await ctx.env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?1`).bind(user.id).run();
    role = "admin";
  }

  const cookie = await openSession(ctx.env.DB, user.id);
  return json(
    { ok: true, user: { id: user.id, email: user.email, name: user.name, role } },
    200,
    { "set-cookie": cookie },
  );
};
