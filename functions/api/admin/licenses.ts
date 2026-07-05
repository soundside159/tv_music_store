import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";

// GET /api/admin/licenses[?q=...] — admin only.
// Every one-time sync license (all users), newest first, with the buyer and
// track resolved. `q` filters by license id, buyer email/name or track title —
// so the owner can look up the number printed on a customer's certificate.

const prettify = (idOrSlug: string) =>
  idOrSlug.replace(/^trk_/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }

  const q = (new URL(ctx.request.url).searchParams.get("q") ?? "").trim().toLowerCase();

  const rows = await ctx.env.DB.prepare(
    `SELECT o.id, o.tier, o.price, o.stripe_session_id, o.created_at, o.track_id,
            u.email AS user_email, u.name AS user_name, t.title AS track_title
       FROM sync_orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN tracks t ON t.id = o.track_id
      ORDER BY o.created_at DESC
      LIMIT 500`,
  ).all<{
    id: string;
    tier: string;
    price: number;
    stripe_session_id: string | null;
    created_at: string;
    track_id: string;
    user_email: string | null;
    user_name: string | null;
    track_title: string | null;
  }>();

  const licenses = rows.results
    .map((r) => ({
      id: r.id,
      tier: r.tier,
      price: r.price,
      reference: r.stripe_session_id ?? "",
      createdAt: r.created_at,
      userEmail: r.user_email ?? "",
      userName: r.user_name ?? "",
      trackTitle: r.track_title ?? prettify(r.track_id),
    }))
    .filter(
      (l) =>
        !q ||
        l.id.toLowerCase().includes(q) ||
        l.reference.toLowerCase().includes(q) ||
        l.userEmail.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q) ||
        l.trackTitle.toLowerCase().includes(q),
    );

  return json({ licenses });
};
