import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";
import { ensurePlanLicensesTable } from "../_licenses";

// GET /api/admin/licenses[?q=...] — admin only.
// Returns BOTH kinds of licenses, newest first, with buyer + track resolved:
//   - "one-time"     : sync_orders (PayPal single-track purchases)
//   - "subscription" : plan_licenses (codes minted for plan certificates)
// `q` filters by license code/id, buyer email/name, reference or track title —
// so the owner can look up the code printed on a customer's certificate and see
// who got it, for which track/plan, and when.

const prettify = (idOrSlug: string) =>
  idOrSlug.replace(/^trk_/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface AdminLicenseRow {
  id: string;
  kind: "one-time" | "subscription";
  tier: string; // one-time tier OR plan name for subscriptions
  price: number | null; // null for subscriptions (covered by the plan)
  reference: string;
  createdAt: string;
  validUntil: string | null; // subscription period end, if known
  userEmail: string;
  userName: string;
  trackTitle: string;
}

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }

  const db = ctx.env.DB;
  const q = (new URL(ctx.request.url).searchParams.get("q") ?? "").trim().toLowerCase();

  // --- one-time (sync_orders) ---------------------------------------------
  const syncRows = await db
    .prepare(
      `SELECT o.id, o.tier, o.price, o.stripe_session_id, o.created_at, o.track_id,
              u.email AS user_email, u.name AS user_name, t.title AS track_title
         FROM sync_orders o
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN tracks t ON t.id = o.track_id
        ORDER BY o.created_at DESC
        LIMIT 500`,
    )
    .all<{
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

  const oneTime: AdminLicenseRow[] = syncRows.results.map((r) => ({
    id: r.id,
    kind: "one-time",
    tier: r.tier,
    price: r.price,
    reference: r.stripe_session_id ?? "",
    createdAt: r.created_at,
    validUntil: null,
    userEmail: r.user_email ?? "",
    userName: r.user_name ?? "",
    trackTitle: r.track_title ?? prettify(r.track_id),
  }));

  // --- subscription (plan_licenses) ---------------------------------------
  await ensurePlanLicensesTable(db);
  let subscription: AdminLicenseRow[] = [];
  try {
    const planRows = await db
      .prepare(
        `SELECT p.id, p.plan, p.plan_period_end, p.created_at, p.track_id,
                u.email AS user_email, u.name AS user_name, t.title AS track_title
           FROM plan_licenses p
           LEFT JOIN users u ON u.id = p.user_id
           LEFT JOIN tracks t ON t.id = p.track_id
          ORDER BY p.created_at DESC
          LIMIT 500`,
      )
      .all<{
        id: string;
        plan: string;
        plan_period_end: string | null;
        created_at: string;
        track_id: string;
        user_email: string | null;
        user_name: string | null;
        track_title: string | null;
      }>();
    subscription = planRows.results.map((r) => ({
      id: r.id,
      kind: "subscription",
      tier: `${r.plan.charAt(0).toUpperCase()}${r.plan.slice(1)} plan`,
      price: null,
      reference: "",
      createdAt: r.created_at,
      validUntil: r.plan_period_end,
      userEmail: r.user_email ?? "",
      userName: r.user_name ?? "",
      trackTitle: r.track_title ?? prettify(r.track_id),
    }));
  } catch {
    // table not present yet — no subscription codes issued
  }

  const licenses = [...oneTime, ...subscription]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
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
