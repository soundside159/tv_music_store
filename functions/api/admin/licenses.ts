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
  userId: string;
  userEmail: string;
  userName: string;
  trackTitle: string;
  // Money + payment linkage (one-time only; null for subscriptions). Pulled from
  // the revenue ledger so the owner can see the processor fee / net and jump
  // straight to the exact payment in Stripe.
  provider: "stripe" | "paypal" | null;
  feeCents: number | null;
  netCents: number | null;
  /** Stripe PaymentIntent id (pi_…) when known — deep-links to the payment. */
  paymentIntent: string | null;
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
  interface SyncRow {
    id: string;
    tier: string;
    price: number;
    stripe_session_id: string | null;
    created_at: string;
    status: string;
    track_id: string;
    user_id: string;
    user_email: string | null;
    user_name: string | null;
    track_title: string | null;
    gross_cents: number | null;
    fee_cents: number | null;
    net_cents: number | null;
    provider_ref: string | null;
    provider: string | null;
  }
  const BASE_COLS = `o.id, o.tier, o.price, o.stripe_session_id, o.created_at, o.track_id, o.user_id,
              COALESCE(o.status, 'active') AS status,
              u.email AS user_email, u.name AS user_name, t.title AS track_title`;
  const BASE_JOINS = `FROM sync_orders o
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN tracks t ON t.id = o.track_id`;
  let syncRows: { results: SyncRow[] };
  try {
    // Join the ORIGINAL ledger event per order (rn = 1) for its fee / net and
    // the provider_ref that carries the Stripe PaymentIntent.
    syncRows = await db
      .prepare(
        `SELECT ${BASE_COLS}, re.gross_cents, re.fee_cents, re.net_cents, re.provider_ref, re.provider
           ${BASE_JOINS}
           LEFT JOIN (
             SELECT order_id, gross_cents, fee_cents, net_cents, provider_ref, provider,
                    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at ASC) AS rn
               FROM revenue_events
              WHERE source = 'license' AND order_id IS NOT NULL
           ) re ON re.order_id = o.id AND re.rn = 1
          ORDER BY o.created_at DESC
          LIMIT 500`,
      )
      .all<SyncRow>();
  } catch {
    // revenue_events / window functions unavailable — degrade to no money data.
    const base = await db
      .prepare(`SELECT ${BASE_COLS} ${BASE_JOINS} ORDER BY o.created_at DESC LIMIT 500`)
      .all<Omit<SyncRow, "gross_cents" | "fee_cents" | "net_cents" | "provider_ref" | "provider">>();
    syncRows = {
      results: base.results.map((r) => ({
        ...r,
        gross_cents: null,
        fee_cents: null,
        net_cents: null,
        provider_ref: null,
        provider: null,
      })),
    };
  }

  const oneTime: AdminLicenseRow[] = syncRows.results.map((r) => {
    // provider_ref is "<pi_… | cs_…>:<slug>:<tier>" — the leading token is the
    // Stripe PaymentIntent when the payment had one.
    const refToken = (r.provider_ref ?? "").split(":")[0];
    const paymentIntent = refToken.startsWith("pi_") ? refToken : null;
    const provider: "stripe" | "paypal" | null =
      r.provider === "stripe" || r.provider === "paypal"
        ? r.provider
        : r.stripe_session_id?.startsWith("cs_")
          ? "stripe"
          : r.stripe_session_id
            ? "paypal"
            : null;
    return {
      id: r.id,
      kind: "one-time",
      // A refunded purchase is shown, but plainly marked void — the owner must be
      // able to see that this code no longer validates.
      tier: r.status === "refunded" ? `${r.tier} (refunded)` : r.tier,
      price: r.price,
      reference: r.stripe_session_id ?? "",
      createdAt: r.created_at,
      validUntil: null,
      userId: r.user_id ?? "",
      userEmail: r.user_email ?? "",
      userName: r.user_name ?? "",
      trackTitle: r.track_title ?? prettify(r.track_id),
      provider,
      feeCents: r.fee_cents,
      netCents: r.net_cents,
      paymentIntent,
    };
  });

  // --- subscription (plan_licenses) ---------------------------------------
  await ensurePlanLicensesTable(db);
  let subscription: AdminLicenseRow[] = [];
  try {
    const planRows = await db
      .prepare(
        `SELECT p.id, p.plan, p.plan_period_end, p.created_at, p.track_id, p.user_id,
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
        user_id: string;
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
      userId: r.user_id ?? "",
      userEmail: r.user_email ?? "",
      userName: r.user_name ?? "",
      trackTitle: r.track_title ?? prettify(r.track_id),
      provider: null,
      feeCents: null,
      netCents: null,
      paymentIntent: null,
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
