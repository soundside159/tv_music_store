import { getSessionUser, json, type Ctx } from "../_utils";
import { allocateDue, ensureRevenueTables, ensureWithholdingColumns } from "../_revenue";
import { buildPdfPages, type PdfOp, type Rgb } from "../_pdf";

// Composer -> Earnings (chart) and Statement (ledger), AudioJungle-style.
//
//   GET /api/composer/ledger?view=chart&level=all|year|month&key=2026|2026-11
//     -> bars (sales / subscriptions / refunds per year, month or day),
//        plus this month, earned all time and paid out all time.
//   GET /api/composer/ledger?view=statement&from=YYYY-MM-DD&to=YYYY-MM-DD&type=all|sale|subscription|refund|payout|tax[&format=pdf]
//     -> every money movement in the range + a summary
//        (earned, UK tax withheld, paid to bank, balance at the end).
//
// The date of a credit = when it was booked to him (revenue_allocations.created_at):
// a licence is booked the moment it sells, a subscription share when the
// subscriber's paid period closes. Payouts come from payout_runs (paid only).

type Entry = {
  date: string;
  type: "sale" | "subscription" | "refund" | "payout" | "tax";
  title: string;
  detail: string;
  priceCents: number | null;
  amountCents: number;
};

const ymd = (s: string | null) => (s ?? "").slice(0, 10);

export const onRequestGet = async (ctx: Ctx) => {
  try {
    return await handle(ctx);
  } catch (e) {
    return json({ error: `Ledger: ${(e as Error).message}` }, 500);
  }
};

const handle = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const db = ctx.env.DB;
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const composer = await db
    .prepare(`SELECT id, display_name FROM composers WHERE user_id = ?1 LIMIT 1`)
    .bind(user.id)
    .first<{ id: string; display_name: string }>();
  if (!composer) return json({ error: "No composer profile", code: "not_composer" }, 403);

  await ensureRevenueTables(db);
  await ensureWithholdingColumns(db);
  await allocateDue(db);

  const url = new URL(ctx.request.url);
  const view = url.searchParams.get("view") ?? "chart";
  return view === "statement" ? statement(ctx, composer, url) : chart(ctx, composer.id, url);
};

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

const chart = async (ctx: Ctx, composerId: string, url: URL) => {
  const db = ctx.env.DB!;
  const now = new Date().toISOString();
  const level = ["all", "year", "month"].includes(url.searchParams.get("level") ?? "")
    ? (url.searchParams.get("level") as "all" | "year" | "month")
    : "month";
  const key =
    url.searchParams.get("key") ?? (level === "year" ? now.slice(0, 4) : level === "month" ? now.slice(0, 7) : "");
  // Bucket = first 4 (year), 7 (month) or 10 (day) characters of the date.
  const len = level === "all" ? 4 : level === "year" ? 7 : 10;

  const rows = await db
    .prepare(
      `SELECT substr(a.created_at,1,?2) AS k,
              SUM(CASE WHEN a.amount_cents > 0 AND e.source = 'license' THEN a.amount_cents ELSE 0 END) AS sales,
              SUM(CASE WHEN a.amount_cents > 0 AND e.source = 'license' THEN 1 ELSE 0 END) AS salesCount,
              SUM(CASE WHEN a.amount_cents > 0 AND e.source = 'subscription' THEN a.amount_cents ELSE 0 END) AS subscriptions,
              SUM(CASE WHEN a.amount_cents < 0 THEN a.amount_cents ELSE 0 END) AS refunds
         FROM revenue_allocations a
         LEFT JOIN revenue_events e ON e.id = a.event_id
        WHERE a.kind = 'author' AND a.composer_id = ?1
          AND (?3 = '' OR substr(a.created_at,1,?4) = ?3)
        GROUP BY k ORDER BY k`,
    )
    .bind(composerId, len, key, key.length || 1)
    .all<{ k: string; sales: number; salesCount: number; subscriptions: number; refunds: number }>();
  const byKey = new Map(rows.results.map((r) => [r.k, r]));

  // Zero-filled axis: every day of the month / month of the year / year since the first.
  const keys: string[] = [];
  if (level === "month") {
    const [y, m] = key.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) keys.push(`${key}-${String(d).padStart(2, "0")}`);
  } else if (level === "year") {
    for (let m = 1; m <= 12; m++) keys.push(`${key}-${String(m).padStart(2, "0")}`);
  } else {
    const first = rows.results[0]?.k ?? now.slice(0, 4);
    for (let y = Number(first); y <= Number(now.slice(0, 4)); y++) keys.push(String(y));
  }
  const bars = keys.map((k) => {
    const r = byKey.get(k);
    return {
      k,
      sales: r?.sales ?? 0,
      salesCount: r?.salesCount ?? 0,
      subscriptions: r?.subscriptions ?? 0,
      refunds: r?.refunds ?? 0,
    };
  });

  const totals = await db
    .prepare(
      `SELECT COALESCE(SUM(a.amount_cents),0) AS lifetime,
              COALESCE(SUM(CASE WHEN substr(a.created_at,1,7) = ?2 THEN a.amount_cents ELSE 0 END),0) AS thisMonth,
              COALESCE(SUM(CASE WHEN substr(a.created_at,1,7) = ?2 AND a.amount_cents > 0 AND e.source = 'license' THEN 1 ELSE 0 END),0) AS thisMonthSales
         FROM revenue_allocations a LEFT JOIN revenue_events e ON e.id = a.event_id
        WHERE a.kind = 'author' AND a.composer_id = ?1`,
    )
    .bind(composerId, now.slice(0, 7))
    .first<{ lifetime: number; thisMonth: number; thisMonthSales: number }>();
  const paid = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS paid FROM payout_runs WHERE composer_id = ?1 AND status = 'paid'`,
    )
    .bind(composerId)
    .first<{ paid: number }>();
  const years = await db
    .prepare(
      `SELECT DISTINCT substr(created_at,1,4) AS y FROM revenue_allocations
        WHERE kind = 'author' AND composer_id = ?1 ORDER BY y`,
    )
    .bind(composerId)
    .all<{ y: string }>();

  return json({
    level,
    key,
    bars,
    total: bars.reduce((a, b) => a + b.sales + b.subscriptions + b.refunds, 0),
    thisMonth: { month: now.slice(0, 7), amountCents: totals?.thisMonth ?? 0, sales: totals?.thisMonthSales ?? 0 },
    lifetimeCents: totals?.lifetime ?? 0,
    paidOutCents: paid?.paid ?? 0,
    years: years.results.map((r) => r.y),
  });
};

// ---------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------

const statement = async (ctx: Ctx, composer: { id: string; display_name: string }, url: URL) => {
  const db = ctx.env.DB!;
  const today = new Date().toISOString().slice(0, 10);
  const isDay = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const to = isDay(url.searchParams.get("to")) ? url.searchParams.get("to")! : today;
  const from = isDay(url.searchParams.get("from")) ? url.searchParams.get("from")! : "2000-01-01";
  const type = url.searchParams.get("type") ?? "all";

  // Credits (sales, refunds) one row each; subscription shares one row per day.
  const lines = await db
    .prepare(
      `SELECT a.created_at AS at, a.amount_cents AS amount, e.source AS source, e.gross_cents AS price,
              e.id AS event_id, e.order_id AS order_id, t.title AS title, o.tier AS tier
         FROM revenue_allocations a
         LEFT JOIN revenue_events e ON e.id = a.event_id
         LEFT JOIN tracks t ON t.id = e.track_id OR t.slug = e.track_id
         LEFT JOIN sync_orders o ON o.id = e.order_id
        WHERE a.kind = 'author' AND a.composer_id = ?1
          AND substr(a.created_at,1,10) >= ?2 AND substr(a.created_at,1,10) <= ?3
        ORDER BY a.created_at DESC`,
    )
    .bind(composer.id, from, to)
    .all<{
      at: string;
      amount: number;
      source: string | null;
      price: number | null;
      event_id: string | null;
      order_id: string | null;
      title: string | null;
      tier: string | null;
    }>();

  const entries: Entry[] = [];
  const subsByDay = new Map<string, { amount: number; payments: Set<string> }>();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  for (const l of lines.results) {
    if (l.amount < 0) {
      entries.push({
        date: ymd(l.at),
        type: "refund",
        title: l.title ?? (l.source === "subscription" ? "Subscription" : "Licence"),
        detail: `Customer refunded${l.order_id ? ` · order ${l.order_id.slice(0, 8)}` : ""}`,
        priceCents: l.price,
        amountCents: l.amount,
      });
    } else if (l.source === "subscription") {
      const d = ymd(l.at);
      const s = subsByDay.get(d) ?? { amount: 0, payments: new Set<string>() };
      s.amount += l.amount;
      if (l.event_id) s.payments.add(l.event_id);
      subsByDay.set(d, s);
    } else {
      entries.push({
        date: ymd(l.at),
        type: "sale",
        title: l.title ?? "Track licence",
        detail: `${l.tier ? `${cap(l.tier)} licence` : "Licence"}${l.order_id ? ` · order ${l.order_id.slice(0, 8)}` : ""}`,
        priceCents: l.price,
        amountCents: l.amount,
      });
    }
  }
  for (const [d, s] of subsByDay) {
    const n = s.payments.size;
    entries.push({
      date: d,
      type: "subscription",
      title: `Your share of ${n} subscriber payment${n === 1 ? "" : "s"}`,
      detail: "Subscribers who downloaded your music",
      priceCents: null,
      amountCents: s.amount,
    });
  }

  // Payouts: one bank transfer per day it was paid, UK tax as its own line.
  const payouts = await db
    .prepare(
      `SELECT substr(paid_at,1,10) AS d, GROUP_CONCAT(month) AS months,
              SUM(amount_cents) AS amount, SUM(COALESCE(withheld_cents,0)) AS withheld
         FROM payout_runs
        WHERE composer_id = ?1 AND status = 'paid' AND paid_at IS NOT NULL
          AND substr(paid_at,1,10) >= ?2 AND substr(paid_at,1,10) <= ?3
        GROUP BY d`,
    )
    .bind(composer.id, from, to)
    .all<{ d: string; months: string; amount: number; withheld: number }>();
  for (const p of payouts.results) {
    const months = (p.months ?? "").split(",").filter(Boolean).sort().join(", ");
    entries.push({
      date: p.d,
      type: "payout",
      title: "Bank transfer",
      detail: months ? `Earnings for ${months}` : "Payout",
      priceCents: null,
      amountCents: -(p.amount - p.withheld),
    });
    if (p.withheld > 0) {
      entries.push({
        date: p.d,
        type: "tax",
        title: "UK tax withheld",
        detail: "Paid to HMRC on your behalf",
        priceCents: null,
        amountCents: -p.withheld,
      });
    }
  }

  const order: Record<Entry["type"], number> = { payout: 0, tax: 1, refund: 2, sale: 3, subscription: 4 };
  entries.sort((a, b) => (a.date === b.date ? order[a.type] - order[b.type] : a.date < b.date ? 1 : -1));

  const summary = {
    earnedCents: entries
      .filter((e) => e.type === "sale" || e.type === "subscription" || e.type === "refund")
      .reduce((a, e) => a + e.amountCents, 0),
    taxCents: -entries.filter((e) => e.type === "tax").reduce((a, e) => a + e.amountCents, 0),
    paidCents: -entries.filter((e) => e.type === "payout").reduce((a, e) => a + e.amountCents, 0),
    balanceCents: 0,
  };
  const credited = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS n FROM revenue_allocations
        WHERE kind = 'author' AND composer_id = ?1 AND substr(created_at,1,10) <= ?2`,
    )
    .bind(composer.id, to)
    .first<{ n: number }>();
  const paidOut = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS n FROM payout_runs
        WHERE composer_id = ?1 AND status = 'paid' AND substr(paid_at,1,10) <= ?2`,
    )
    .bind(composer.id, to)
    .first<{ n: number }>();
  summary.balanceCents = (credited?.n ?? 0) - (paidOut?.n ?? 0);

  const shown = type === "all" ? entries : entries.filter((e) => e.type === type);

  if (url.searchParams.get("format") === "pdf") {
    const pdf = statementPdf(composer.display_name, from === "2000-01-01" ? "" : from, to, summary, shown);
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="tvmusicstore-statement-${from === "2000-01-01" ? "all" : from}_to_${to}.pdf"`,
      },
    });
  }
  return json({ from, to, type, summary, entries: shown });
};

// ---------------------------------------------------------------------------
// PDF statement (A4, as many pages as needed)
// ---------------------------------------------------------------------------

const ascii = (s: string) => s.replace(/[–—·]/g, "-").replace(/[^\x20-\x7e]/g, "");
const dollars = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;

const statementPdf = (
  name: string,
  from: string,
  to: string,
  s: { earnedCents: number; taxCents: number; paidCents: number; balanceCents: number },
  rows: Entry[],
): Uint8Array => {
  const GOLD: Rgb = [0.957, 0.769, 0.188];
  const INK: Rgb = [0.1, 0.1, 0.12];
  const GRAY: Rgb = [0.45, 0.45, 0.5];
  const RULE: Rgb = [0.86, 0.86, 0.88];
  const L = 40;
  const R = 555;
  const TYPE: Record<Entry["type"], string> = {
    sale: "Sale",
    subscription: "Subscription",
    refund: "Refund",
    payout: "Payout",
    tax: "UK tax",
  };
  const pages: PdfOp[][] = [];
  let ops: PdfOp[] = [];
  let y = 0;
  const header = (first: boolean) => {
    ops.push({ op: "rect", x: 0, y: 782, w: 595, h: 60, color: [0.055, 0.055, 0.063] });
    ops.push({ op: "rect", x: 0, y: 779, w: 595, h: 3, color: GOLD });
    ops.push({ op: "text", text: "TV MUSIC STORE", x: L, y: 812, size: 8, font: "helvB", color: GOLD });
    ops.push({ op: "text", text: "Composer Statement", x: L, y: 792, size: 18, font: "helvB", color: [1, 1, 1] });
    ops.push({ op: "text", text: ascii(name), x: R, y: 812, size: 9, font: "helvB", color: [1, 1, 1], align: "right" });
    ops.push({ op: "text", text: from ? `Period ${from} to ${to}` : `All time to ${to}`, x: R, y: 796, size: 8, color: [0.8, 0.8, 0.82], align: "right" });
    y = 750;
    if (first) {
      const cells: [string, string][] = [
        ["Earned", dollars(s.earnedCents)],
        ["UK tax withheld", dollars(s.taxCents)],
        ["Paid to your bank", dollars(s.paidCents)],
        ["Balance at end", dollars(s.balanceCents)],
      ];
      cells.forEach(([k, v], i) => {
        const x = L + i * 130;
        ops.push({ op: "text", text: k, x, y, size: 8, color: GRAY });
        ops.push({ op: "text", text: v, x, y: y - 16, size: 13, font: "helvB", color: INK });
      });
      y -= 44;
    }
    ops.push({ op: "text", text: "Date", x: L, y, size: 8, font: "helvB", color: GRAY });
    ops.push({ op: "text", text: "Type", x: L + 70, y, size: 8, font: "helvB", color: GRAY });
    ops.push({ op: "text", text: "Detail", x: L + 145, y, size: 8, font: "helvB", color: GRAY });
    ops.push({ op: "text", text: "Price", x: R - 80, y, size: 8, font: "helvB", color: GRAY, align: "right" });
    ops.push({ op: "text", text: "Amount", x: R, y, size: 8, font: "helvB", color: GRAY, align: "right" });
    y -= 6;
    ops.push({ op: "line", x1: L, y1: y, x2: R, y2: y, width: 0.7, color: RULE });
    y -= 16;
  };
  header(true);
  if (rows.length === 0) {
    ops.push({ op: "text", text: "No entries in this period.", x: L, y, size: 10, color: GRAY });
  }
  for (const r of rows) {
    if (y < 70) {
      pages.push(ops);
      ops = [];
      header(false);
    }
    const title = ascii(r.title).slice(0, 52);
    const detail = ascii(r.detail).slice(0, 60);
    ops.push({ op: "text", text: r.date, x: L, y, size: 9, color: INK });
    ops.push({ op: "text", text: TYPE[r.type], x: L + 70, y, size: 9, color: INK });
    ops.push({ op: "text", text: title, x: L + 145, y, size: 9, color: INK });
    ops.push({ op: "text", text: detail, x: L + 145, y: y - 10, size: 7.5, color: GRAY });
    ops.push({ op: "text", text: r.priceCents == null ? "-" : dollars(r.priceCents), x: R - 80, y, size: 9, color: INK, align: "right" });
    ops.push({
      op: "text",
      text: `${r.amountCents > 0 ? "+" : ""}${dollars(r.amountCents)}`,
      x: R,
      y,
      size: 9,
      font: "helvB",
      color: r.amountCents < 0 ? [0.79, 0.22, 0.2] : [0.1, 0.5, 0.3],
      align: "right",
    });
    y -= 26;
  }
  ops.push({ op: "line", x1: L, y1: 50, x2: R, y2: 50, width: 0.7, color: RULE });
  ops.push({ op: "text", text: "Figures from the TV Music Store revenue ledger. Amounts in USD.", x: L, y: 38, size: 7.5, color: GRAY });
  pages.push(ops);
  return buildPdfPages(pages);
};
