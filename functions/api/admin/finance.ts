import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";
import {
  allocateDue,
  ensureRevenueTables,
  getPayoutPolicy,
  releaseDateOf,
  reverseEvent,
  savePayoutPolicy,
} from "../_revenue";
import { stripeCall } from "../stripe/_stripe";
import { paypalCall, paypalConfigured, paypalToken } from "../paypal/_paypal";

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

  // The page's month axis is WHEN THE MONEY ARRIVED (created_at) — same axis
  // as the Payments list and the accountant report. It used to be the cycle's
  // period_end, which filed an annual subscription paid today under NEXT YEAR
  // (the month dropdown then even DEFAULTED to 2027-07 and everything looked
  // empty/lopsided). Composer split tables below keep their own allocation
  // month — payouts happen when a cycle closes, that part is correct.
  const nowMonth = new Date().toISOString().slice(0, 7);
  const months = await db
    .prepare(
      `SELECT DISTINCT substr(created_at, 1, 7) AS month
         FROM revenue_events ORDER BY month DESC LIMIT 36`,
    )
    .all<{ month: string }>();
  const monthList = months.results.map((m) => m.month);
  if (!monthList.includes(nowMonth)) monthList.unshift(nowMonth);

  const url = new URL(ctx.request.url);
  const month = url.searchParams.get("month") ?? nowMonth;

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
        WHERE substr(created_at, 1, 7) = ?1
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

  // The Payments list is bucketed by the month the money ARRIVED (created_at) —
  // what a human (and the accountant report) means by "July's payments". It used
  // to bucket by period_end, which threw an ANNUAL subscription paid today into
  // NEXT YEAR's view — invisible for 12 months. The composer-split tables keep
  // their own period_end logic (allocation happens when a cycle closes).
  const recent = await db
    .prepare(
      `SELECT e.id, e.source, e.provider, e.provider_ref, e.gross_cents, e.tax_cents, e.fee_cents, e.net_cents,
              e.status, e.created_at, e.period_start, e.period_end, u.email AS user_email
         FROM revenue_events e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE substr(e.created_at, 1, 7) = ?1
        ORDER BY e.created_at DESC LIMIT 50`,
    )
    .bind(month)
    .all();

  // ---- Balances: what is actually PAYABLE today ---------------------------
  // Money is held until the month it belongs to has aged past the hold-back
  // (so refunds and chargebacks net out first), and a balance under the
  // threshold simply rolls forward instead of being wired for pennies.
  const policy = await getPayoutPolicy(db);
  const today = new Date().toISOString().slice(0, 10);

  const openLines = await db
    .prepare(
      `SELECT a.month AS month, a.composer_id AS composer_id, c.display_name AS name,
              SUM(a.amount_cents) AS amount
         FROM revenue_allocations a
         LEFT JOIN composers c ON c.id = a.composer_id
         LEFT JOIN payout_runs p ON p.month = a.month AND p.composer_id = a.composer_id
        WHERE a.kind = 'author'
          AND a.composer_id IS NOT NULL
          AND (p.status IS NULL OR p.status <> 'paid')
        GROUP BY a.month, a.composer_id`,
    )
    .all<{ month: string; composer_id: string; name: string | null; amount: number }>();

  const balanceBy = new Map<
    string,
    { composerId: string; name: string; released: number; held: number; months: string[] }
  >();
  for (const line of openLines.results) {
    const entry = balanceBy.get(line.composer_id) ?? {
      composerId: line.composer_id,
      name: line.name ?? "(deleted composer)",
      released: 0,
      held: 0,
      months: [],
    };
    if (releaseDateOf(line.month, policy.holdbackDays) <= today) {
      entry.released += line.amount ?? 0;
      entry.months.push(line.month);
    } else {
      entry.held += line.amount ?? 0;
    }
    balanceBy.set(line.composer_id, entry);
  }

  const balances = [...balanceBy.values()]
    .map((b) => ({
      ...b,
      payable: b.released >= policy.thresholdCents && b.released > 0,
    }))
    .sort((a, b) => b.released - a.released);

  const sum = (key: "gross" | "tax" | "fee" | "net") =>
    totals.results.reduce((acc, r) => acc + (r[key] ?? 0), 0);

  const authorTotal = authorLines.results.reduce((acc, l) => acc + (l.amount ?? 0), 0);
  const unallocatedTotal = unallocated?.amount ?? 0;
  const net = sum("net");

  return json({
    month,
    months: monthList,
    policy,
    releaseDate: releaseDateOf(month, policy.holdbackDays),
    balances,
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
    // Lets the UI build dashboard.stripe.com/test/... links while the site runs
    // on sandbox keys — invoice/pi ids don't reveal the mode by themselves.
    stripeTestMode: (ctx.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"),
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;
  const db = ctx.env.DB;
  await ensureRevenueTables(db);

  const body = await readJson<{
    action?: string;
    month?: string;
    composerId?: string;
    eventId?: string;
    holdbackDays?: number;
    thresholdCents?: number;
  }>(ctx.request);

  // --- Payout policy (hold-back + minimum payout) ---------------------------
  if (body?.action === "set_policy") {
    await savePayoutPolicy(db, {
      holdbackDays: Math.max(0, Math.min(180, Math.round(Number(body.holdbackDays ?? 30)))),
      thresholdCents: Math.max(0, Math.round(Number(body.thresholdCents ?? 5000))),
    });
    return json({ ok: true });
  }

  // --- Book a reversal that already happened elsewhere (no money moves here) -
  if (body?.action === "refund_event") {
    if (!body.eventId) return json({ error: "eventId required" }, 400);
    const done = await reverseEvent(db, { eventId: body.eventId });
    return json({ ok: true, reversed: done });
  }

  // --- REAL refund: send the money back through Stripe / PayPal -------------
  // This actually moves money. The ledger reversal runs only after the provider
  // confirms, so the books can never say "refunded" for money that never left.
  if (body?.action === "refund_payment") {
    if (!body.eventId) return json({ error: "eventId required" }, 400);

    const event = await db
      .prepare(
        `SELECT id, provider, provider_ref, gross_cents, currency, status
           FROM revenue_events WHERE id = ?1`,
      )
      .bind(body.eventId)
      .first<{
        id: string;
        provider: string;
        provider_ref: string;
        gross_cents: number;
        currency: string;
        status: string;
      }>();
    if (!event) return json({ error: "Payment not found" }, 404);
    if (event.status === "refunded") return json({ error: "Already refunded" }, 400);

    try {
      if (event.provider === "stripe") {
        const key = ctx.env.STRIPE_SECRET_KEY;
        if (!key) return json({ error: "Stripe is not configured" }, 503);
        // provider_ref is the invoice id -> its charge -> refund the charge.
        const invoice = await stripeCall<{ charge?: string | null }>(
          key,
          "GET",
          `/invoices/${event.provider_ref}`,
        );
        if (!invoice.charge) return json({ error: "This invoice has no charge to refund" }, 400);
        await stripeCall(key, "POST", "/refunds", { charge: invoice.charge });
      } else if (event.provider === "paypal") {
        if (!paypalConfigured(ctx.env)) return json({ error: "PayPal is not configured" }, 503);
        // provider_ref = "<captureId>:<slug>:<tier>" — one capture can cover
        // several licensed tracks, so we refund exactly this line's amount.
        const captureId = event.provider_ref.split(":")[0];
        const token = await paypalToken(ctx.env);
        await paypalCall(ctx.env, token, "POST", `/v2/payments/captures/${captureId}/refund`, {
          amount: {
            value: (event.gross_cents / 100).toFixed(2),
            currency_code: (event.currency || "usd").toUpperCase(),
          },
          note_to_payer: "Refund from TV Music Store",
        });
      } else {
        return json({ error: `Unknown provider: ${event.provider}` }, 400);
      }
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "The payment provider refused the refund" },
        502,
      );
    }

    // Money is on its way back — now the books.
    await reverseEvent(db, { eventId: event.id });
    return json({ ok: true, refundedCents: event.gross_cents });
  }

  // --- Pay out a composer's whole released balance at once ------------------
  if (body?.action === "pay_balance") {
    const composer = body.composerId;
    if (!composer) return json({ error: "composerId required" }, 400);
    const policy = await getPayoutPolicy(db);
    const today = new Date().toISOString().slice(0, 10);

    const open = await db
      .prepare(
        `SELECT a.month AS month, SUM(a.amount_cents) AS amount
           FROM revenue_allocations a
           LEFT JOIN payout_runs p ON p.month = a.month AND p.composer_id = a.composer_id
          WHERE a.kind = 'author' AND a.composer_id = ?1
            AND (p.status IS NULL OR p.status <> 'paid')
          GROUP BY a.month`,
      )
      .bind(composer)
      .all<{ month: string; amount: number }>();

    let paidTotal = 0;
    for (const line of open.results) {
      if (releaseDateOf(line.month, policy.holdbackDays) > today) continue; // still held
      await db
        .prepare(
          `INSERT INTO payout_runs (month, composer_id, amount_cents, status, paid_at)
           VALUES (?1, ?2, ?3, 'paid', ?4)
           ON CONFLICT(month, composer_id) DO UPDATE SET
             amount_cents = ?3, status = 'paid', paid_at = ?4`,
        )
        .bind(line.month, composer, line.amount ?? 0, new Date().toISOString())
        .run();
      paidTotal += line.amount ?? 0;
    }
    return json({ ok: true, paidCents: paidTotal });
  }

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
