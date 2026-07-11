import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";
import { allocateDue, ensureRevenueTables } from "../_revenue";

// Admin finance report — the real numbers, straight from the revenue ledger.
//
// GET  /api/admin/finance?month=YYYY-MM
//   -> the months that have money in them, the P&L of the selected one
//      (gross, tax, fees, net, author pool, platform), the per-composer payout
//      lines and the latest payments.
// POST { action: "mark_paid" | "mark_due", month, composerId }
//   -> flips a composer's payout line for that month.
//
// Every request first runs allocateDue(): licenses are split on the spot,
// subscriptions once their cycle has closed. So the report is never stale.

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
  const db = ctx.env.DB;

  await ensureRevenueTables(db);
  await allocateDue(db);

  const months = await db
    .prepare(
      `SELECT DISTINCT substr(COALESCE(period_end, created_at), 1, 7) AS month
         FROM revenue_events ORDER BY month DESC LIMIT 36`,
    )
    .all<{ month: string }>();

  const url = new URL(ctx.request.url);
  const month =
    url.searchParams.get("month") ??
    months.results[0]?.month ??
    new Date().toISOString().slice(0, 7);

  // P&L of the month, by where the money came from.
  const totals = await db
    .prepare(
      `SELECT source,
              COUNT(*) AS payments,
              SUM(gross_cents) AS gross,
              SUM(tax_cents) AS tax,
              SUM(fee_cents) AS fee,
              SUM(net_cents) AS net
         FROM revenue_events
        WHERE substr(COALESCE(period_end, created_at), 1, 7) = ?1
          AND status != 'refunded'
        GROUP BY source`,
    )
    .bind(month)
    .all<{
      source: string;
      payments: number;
      gross: number;
      tax: number;
      fee: number;
      net: number;
    }>();

  // What the split produced: author money per composer + the share that stayed
  // with the platform because the payer downloaded nothing that cycle.
  const authorLines = await db
    .prepare(
      `SELECT a.composer_id AS composer_id,
              c.display_name AS name,
              SUM(a.points) AS points,
              SUM(a.amount_cents) AS amount
         FROM revenue_allocations a
         LEFT JOIN composers c ON c.id = a.composer_id
        WHERE a.month = ?1 AND a.kind = 'author'
        GROUP BY a.composer_id
        ORDER BY amount DESC`,
    )
    .bind(month)
    .all<{ composer_id: string; name: string | null; points: number; amount: number }>();

  const unallocated = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS amount
         FROM revenue_allocations
        WHERE month = ?1 AND kind = 'platform_unallocated'`,
    )
    .bind(month)
    .first<{ amount: number }>();

  const payouts = await db
    .prepare(`SELECT composer_id, status, paid_at FROM payout_runs WHERE month = ?1`)
    .bind(month)
    .all<{ composer_id: string; status: string; paid_at: string | null }>();
  const payoutBy = new Map(payouts.results.map((p) => [p.composer_id, p]));

  const recent = await db
    .prepare(
      `SELECT e.id, e.source, e.provider, e.gross_cents, e.tax_cents, e.fee_cents, e.net_cents,
              e.status, e.created_at, e.period_start, e.period_end, u.email AS user_email
         FROM revenue_events e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE substr(COALESCE(e.period_end, e.created_at), 1, 7) = ?1
        ORDER BY e.created_at DESC LIMIT 50`,
    )
    .bind(month)
    .all();

  const sum = (key: "gross" | "tax" | "fee" | "net") =>
    totals.results.reduce((acc, r) => acc + (r[key] ?? 0), 0);

  const authorTotal = authorLines.results.reduce((acc, l) => acc + (l.amount ?? 0), 0);
  const unallocatedTotal = unallocated?.amount ?? 0;
  const net = sum("net");

  return json({
    month,
    months: months.results.map((m) => m.month),
    totals: {
      gross: sum("gross"),
      tax: sum("tax"),
      fee: sum("fee"),
      net,
      authorTotal,
      // Platform = its half + the author share of payers who downloaded nothing.
      platformTotal: net - authorTotal,
      unallocatedTotal,
      bySource: totals.results,
    },
    composers: authorLines.results.map((l) => ({
      composerId: l.composer_id,
      name: l.name ?? "(deleted composer)",
      points: l.points ?? 0,
      amount: l.amount ?? 0,
      status: payoutBy.get(l.composer_id)?.status ?? "due",
      paidAt: payoutBy.get(l.composer_id)?.paid_at ?? null,
    })),
    events: recent.results,
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;
  const db = ctx.env.DB;
  await ensureRevenueTables(db);

  const body = await readJson<{ action?: string; month?: string; composerId?: string }>(
    ctx.request,
  );
  const month = body?.month;
  const composerId = body?.composerId;
  if (!month || !/^\d{4}-\d{2}$/.test(month) || !composerId) {
    return json({ error: "month and composerId required" }, 400);
  }

  if (body?.action !== "mark_paid" && body?.action !== "mark_due") {
    return json({ error: "Unknown action" }, 400);
  }
  const paid = body.action === "mark_paid";

  const owed = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS amount
         FROM revenue_allocations
        WHERE month = ?1 AND kind = 'author' AND composer_id = ?2`,
    )
    .bind(month, composerId)
    .first<{ amount: number }>();

  await db
    .prepare(
      `INSERT INTO payout_runs (month, composer_id, amount_cents, status, paid_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(month, composer_id) DO UPDATE SET
         amount_cents = ?3, status = ?4, paid_at = ?5`,
    )
    .bind(
      month,
      composerId,
      owed?.amount ?? 0,
      paid ? "paid" : "due",
      paid ? new Date().toISOString() : null,
    )
    .run();

  return json({ ok: true });
};
