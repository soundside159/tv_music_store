import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";
import { ensureWhitelistTable } from "../whitelist";

// GET /api/admin/whitelist[?q=] — admin only.
// Every whitelisted channel with its owning customer + current subscription plan
// and status, so the owner knows which channels to service (active subs) and can
// open each one to clear Content ID claims. Active subscriptions are listed first.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }

  const db = ctx.env.DB;
  await ensureWhitelistTable(db);

  const rows = await db
    .prepare(
      `SELECT w.id, w.channel_url, w.channel_ref, w.added_at, w.user_id,
              u.email AS user_email, u.name AS user_name,
              s.plan AS plan, s.status AS status
         FROM whitelist_channels w
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN subscriptions s ON s.rowid = (
           SELECT rowid FROM subscriptions WHERE user_id = w.user_id ORDER BY rowid DESC LIMIT 1
         )
        ORDER BY w.added_at DESC`,
    )
    .all<{
      id: string;
      channel_url: string;
      channel_ref: string | null;
      added_at: string;
      user_id: string;
      user_email: string | null;
      user_name: string | null;
      plan: string | null;
      status: string | null;
    }>();

  const q = (new URL(ctx.request.url).searchParams.get("q") ?? "").trim().toLowerCase();

  const channels = rows.results
    .map((r) => {
      const plan = r.plan ?? "free";
      const active = (r.status ? r.status === "active" : false) && plan !== "free";
      return {
        id: r.id,
        channelUrl: r.channel_url,
        channelRef: r.channel_ref ?? "",
        addedAt: r.added_at,
        userId: r.user_id,
        userEmail: r.user_email ?? "",
        userName: r.user_name ?? "",
        plan,
        status: r.status ?? "none",
        active,
      };
    })
    .filter(
      (c) =>
        !q ||
        c.channelUrl.toLowerCase().includes(q) ||
        c.userEmail.toLowerCase().includes(q) ||
        c.userName.toLowerCase().includes(q),
    )
    .sort((a, b) => (a.active === b.active ? (a.addedAt < b.addedAt ? 1 : -1) : a.active ? -1 : 1));

  return json({ channels });
};
