import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";

// Admin-only user management.
// GET  -> latest 200 users with plan info.
// PATCH { userId, role } -> change a user's role (customer | composer | admin).

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return { error: json({ error: "Admin only" }, 403) };
  }
  return { user };
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const rows = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.created_at,
            (SELECT s.plan FROM subscriptions s
              WHERE s.user_id = u.id ORDER BY s.rowid DESC LIMIT 1) AS plan,
            (SELECT COUNT(*) FROM download_log d WHERE d.user_id = u.id) AS downloads
       FROM users u
      ORDER BY u.created_at DESC
      LIMIT 200`,
  ).all<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    created_at: string;
    plan: string | null;
    downloads: number;
  }>();

  return json({ users: rows.results });
};

export const onRequestPatch = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const body = await readJson<{ userId?: string; role?: string }>(ctx.request);
  const userId = body?.userId;
  const role = body?.role;
  if (!userId || !role || !["customer", "composer", "admin"].includes(role)) {
    return json({ error: "userId and a valid role required" }, 400);
  }

  const target = await ctx.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ email: string }>();
  if (!target) return json({ error: "User not found" }, 404);

  // The owner account always stays admin.
  if (target.email === OWNER_EMAIL && role !== "admin") {
    return json({ error: "The owner account must stay admin" }, 400);
  }

  await ctx.env.DB.prepare(`UPDATE users SET role = ?1 WHERE id = ?2`).bind(role, userId).run();
  return json({ ok: true });
};
