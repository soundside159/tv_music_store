import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";
import {
  allocateDue,
  ensureRevenueTables,
  getPayoutPolicy,
  releaseDateOf,
  reverseEvent,
  savePayoutPolicy,
  ensureWithholdingColumns,
  withheldOf,
  withholdingBpsOf,
} from "../_revenue";
import { inRange, resolvePeriod } from "../_period";
import { stripeCall } from "../stripe/_stripe";
import { paypalCall, paypalConfigured, paypalToken } from "../paypal/_paypal";

// Admin finance report — the real numbers, straight from the revenue ledger.
//
// GET  /api/admin/finance?period=this_month|last_month|this_year|all
//   -> the owner's income (as the store and as a composer), where the money
//      went, composer shares, payable balances and the payments list.
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

  // The period axis is WHEN THE MONEY ARRIVED (revenue_events.created_at) —
  // same as the Payments list, the dashboard and the accountant report.
  // Everything below is computed per payment, so it always adds up:
  //   net = composers + store + still splitting.
  const url = new URL(ctx.request.url);
  const period = resolvePeriod(url.searchParams.get("period"));
  const since = period.from;
  const until = period.to;

  // Money in, by source.
  const totals = await db
    .prepare(
      `SELECT source,
              COUNT(*) AS payments,
              SUM(gross_cents) AS gross,
              SUM(tax_cents) AS tax,
              SUM(fee_cents) AS fee,
              SUM(net_cents) AS net
         FROM revenue_events
        WHERE ${inRange("created_at", 1, 2)}
          AND status != 'refunded'
        GROUP BY source`,
    )
    .bind(since, until)
    .all<{
      source: string;
      payments: number;
      gross: number;
      tax: number;
      fee: number;
      net: number;
    }>();

  // Composer shares of the payments that are already split.
  const authorLines = await db
    .prepare(
      `SELECT a.composer_id AS composer_id,
              c.display_name AS name,
              c.user_id AS user_id,
              SUM(a.amount_cents) AS amount
         FROM revenue_allocations a
         JOIN revenue_events e ON e.id = a.event_id
         LEFT JOIN composers c ON c.id = a.composer_id
        WHERE a.kind = 'author' AND e.status = 'allocated' AND ${inRange("e.created_at", 1, 2)}
        GROUP BY a.composer_id
        ORDER BY amount DESC`,
    )
    .bind(since, until)
    .all<{ composer_id: string; name: string | null; user_id: string | null; amount: number }>();

  const netByStatus = await db
    .prepare(
      `SELECT status, COALESCE(SUM(net_cents),0) AS net FROM revenue_events
        WHERE status IN ('allocated','pending') AND ${inRange("created_at", 1, 2)}
        GROUP BY status`,
    )
    .bind(since, until)
    .all<{ status: string; net: number }>();

  // The owner's own composer profile(s): what he earned as a composer.
  const myComposers = await db
    .prepare(`SELECT id, display_name FROM composers WHERE user_id = ?1`)
    .bind(gate.user!.id)
    .all<{ id: string; display_name: string }>();
  const myIds = new Set(myComposers.results.map((c) => c.id));

  const recent = await db
    .prepare(
      `SELECT e.id, e.source, e.provider, e.provider_ref, e.gross_cents, e.tax_cents, e.fee_cents, e.net_cents,
              e.status, e.created_at, e.period_start, e.period_end, u.email AS user_email
         FROM revenue_events e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE ${inRange("e.created_at", 1, 2)}
        ORDER BY e.created_at DESC LIMIT 100`,
    )
    .bind(since, until)
    .all();

  // ---- Balances: what is actually PAYABLE today ---------------------------
  // Money is held until the month it belongs to has aged past the hold-back
  // (so refunds and chargebacks net out first), and a balance under the
  // threshold simply rolls forward instead of being wired for pennies.
  const policy = await getPayoutPolicy(db);
  const today = new Date().toISOString().slice(0, 10);
  await ensureWithholdingColumns(db);

  const openLines = await db
    .prepare(
      `SELECT a.month AS month, a.composer_id AS composer_id, c.display_name AS name,
              MAX(c.withholding_bps) AS bps, MAX(c.tax_country) AS country,
              SUM(a.amount_cents) AS amount
         FROM revenue_allocations a
         LEFT JOIN composers c ON c.id = a.composer_id
         LEFT JOIN payout_runs p ON p.month = a.month AND p.composer_id = a.composer_id
        WHERE a.kind = 'author'
          AND a.composer_id IS NOT NULL
          AND (p.status IS NULL OR p.status <> 'paid')
        GROUP BY a.month, a.composer_id`,
    )
    .all<{
      month: string;
      composer_id: string;
      name: string | null;
      bps: number | null;
      country: string | null;
      amount: number;
    }>();

  const balanceBy = new Map<
    string,
    {
      composerId: string;
      name: string;
      released: number;
      held: number;
      months: string[];
      withholdingBps: number;
      taxCountry: string | null;
    }
  >();
  for (const line of openLines.results) {
    const entry = balanceBy.get(line.composer_id) ?? {
      composerId: line.composer_id,
      name: line.name ?? "(deleted composer)",
      released: 0,
      held: 0,
      months: [],
      withholdingBps: Math.max(0, Number(line.bps ?? 0) || 0),
      taxCountry: line.country,
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
    .map((b) => {
      const withheld = withheldOf(b.released, b.withholdingBps);
      return {
        ...b,
        /** UK tax kept back for HMRC, and what actually goes to the composer's bank. */
        withheld,
        toPay: b.released - withheld,
        payable: b.released >= policy.thresholdCents && b.released > 0,
      };
    })
    .sort((a, b) => b.released - a.released);

  // ---- The store's own share (TV Music Store), same clearing windows -------
  // Per split payment: its net minus what went to composers. Month = the
  // month the split was booked in, so it clears on the same date as theirs.
  const storeLines = await db
    .prepare(
      `SELECT COALESCE(MIN(a.month), substr(e.created_at, 1, 7)) AS month,
              e.net_cents - COALESCE(SUM(CASE WHEN a.kind = 'author' THEN a.amount_cents END), 0) AS amount
         FROM revenue_events e
         LEFT JOIN revenue_allocations a ON a.event_id = e.id
        WHERE e.status = 'allocated'
        GROUP BY e.id`,
    )
    .all<{ month: string; amount: number }>();
  const storeBalance = { released: 0, held: 0 };
  for (const line of storeLines.results) {
    if (releaseDateOf(line.month, policy.holdbackDays) <= today) storeBalance.released += line.amount ?? 0;
    else storeBalance.held += line.amount ?? 0;
  }

  const sum = (key: "gross" | "tax" | "fee" | "net") =>
    totals.results.reduce((acc, r) => acc + (r[key] ?? 0), 0);
  const bySource = (src: string) => {
    const r = totals.results.find((x) => x.source === src);
    return { count: r?.payments ?? 0, gross: r?.gross ?? 0, net: r?.net ?? 0 };
  };

  const composersTotal = authorLines.results.reduce((acc, l) => acc + (l.amount ?? 0), 0);
  const allocatedNet = netByStatus.results.find((r) => r.status === "allocated")?.net ?? 0;
  const splitting = netByStatus.results.find((r) => r.status === "pending")?.net ?? 0;
  const store = allocatedNet - composersTotal;
  const mine = authorLines.results
    .filter((l) => myIds.has(l.composer_id))
    .reduce((acc, l) => acc + (l.amount ?? 0), 0);

  return json({
    period: { id: period.id, label: period.label, from: period.from, to: period.to },
    policy,
    // "My income" — the owner as the store and as a composer.
    income: {
      store,
      composer: mine,
      total: store + mine,
      splitting,
      composerNames: myComposers.results.map((c) => c.display_name),
    },
    // Where the money went (adds up: net = composers + store + splitting).
    flow: {
      gross: sum("gross"),
      tax: sum("tax"),
      fee: sum("fee"),
      net: sum("net"),
      composers: composersTotal,
      store,
      splitting,
      license: bySource("license"),
      subscription: bySource("subscription"),
    },
    composers: authorLines.results.map((l) => ({
      composerId: l.composer_id,
      name: l.name ?? "(deleted composer)",
      amount: l.amount ?? 0,
      mine: myIds.has(l.composer_id),
    })),
    balances,
    storeBalance,
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
    let withheldTotal = 0;
    const bps = await withholdingBpsOf(db, composer);
    for (const line of open.results) {
      if (releaseDateOf(line.month, policy.holdbackDays) > today) continue; // still held
      const gross = line.amount ?? 0;
      const withheld = withheldOf(gross, bps);
      await db
        .prepare(
          `INSERT INTO payout_runs (month, composer_id, amount_cents, status, paid_at, withheld_cents)
           VALUES (?1, ?2, ?3, 'paid', ?4, ?5)
           ON CONFLICT(month, composer_id) DO UPDATE SET
             amount_cents = ?3, status = 'paid', paid_at = ?4, withheld_cents = ?5`,
        )
        .bind(line.month, composer, gross, new Date().toISOString(), withheld)
        .run();
      paidTotal += gross;
      withheldTotal += withheld;
    }
    return json({ ok: true, paidCents: paidTotal, withheldCents: withheldTotal, sentCents: paidTotal - withheldTotal });
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

  await ensureWithholdingColumns(db);
  const bps = await withholdingBpsOf(db, composerId);
  await db
    .prepare(
      `INSERT INTO payout_runs (month, composer_id, amount_cents, status, paid_at, withheld_cents)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(month, composer_id) DO UPDATE SET
         amount_cents = ?3, status = ?4, paid_at = ?5, withheld_cents = ?6`,
    )
    .bind(
      month,
      composerId,
      owed?.amount ?? 0,
      paid ? "paid" : "due",
      paid ? new Date().toISOString() : null,
      paid ? withheldOf(owed?.amount ?? 0, bps) : 0,
    )
    .run();

  return json({ ok: true });
};
