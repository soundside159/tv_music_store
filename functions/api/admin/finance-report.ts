import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";
import { buildPdf, type PdfOp, type Rgb } from "../_pdf";

// GET /api/admin/finance-report?from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|csv|pdf
// Admin only. A book-keeping report over a date range, straight from the
// revenue ledger (revenue_events) — no need to open Stripe/PayPal. Every sale
// (solo licenses + subscription payments, both processors) with gross, VAT,
// processor fee and net. json = summary + rows (for the on-screen preview),
// csv = full transaction list (for the accountant's software), pdf = a one-page
// signed-looking summary.

interface Row {
  id: string;
  source: string; // "license" | "subscription"
  provider: string; // "stripe" | "paypal"
  gross_cents: number;
  tax_cents: number;
  fee_cents: number;
  net_cents: number;
  currency: string | null;
  status: string | null;
  created_at: string;
  order_id: string | null;
  provider_ref: string | null;
  track_title: string | null;
  user_email: string | null;
}

const money = (c: number) => (c / 100).toFixed(2);
const dateOnly = (s: string) => (s || "").slice(0, 10);
const typeLabel = (s: string) => (s === "subscription" ? "Subscription" : "Solo license");
const providerLabel = (p: string) => (p === "paypal" ? "PayPal" : "Stripe");

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

interface Bucket {
  count: number;
  gross: number;
  tax: number;
  fee: number;
  net: number;
}
const emptyBucket = (): Bucket => ({ count: 0, gross: 0, tax: 0, fee: 0, net: 0 });
const add = (b: Bucket, r: Row) => {
  b.count += 1;
  b.gross += r.gross_cents;
  b.tax += r.tax_cents;
  b.fee += r.fee_cents;
  b.net += r.net_cents;
};

const summarize = (rows: Row[]) => {
  const active = emptyBucket();
  const refunded = emptyBucket();
  const byType: Record<string, Bucket> = { license: emptyBucket(), subscription: emptyBucket() };
  const byProvider: Record<string, Bucket> = { stripe: emptyBucket(), paypal: emptyBucket() };
  for (const r of rows) {
    if (r.status === "refunded") {
      add(refunded, r);
      continue;
    }
    add(active, r);
    add(byType[r.source === "subscription" ? "subscription" : "license"], r);
    add(byProvider[r.provider === "paypal" ? "paypal" : "stripe"], r);
  }
  return { active, refunded, byType, byProvider };
};

// ---------------------------------------------------------------------------

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }

  const url = new URL(ctx.request.url);
  const from = (url.searchParams.get("from") || "1970-01-01").slice(0, 10);
  const to = (url.searchParams.get("to") || "2999-12-31").slice(0, 10);
  const format = url.searchParams.get("format") || "json";

  let rows: Row[] = [];
  try {
    const res = await ctx.env.DB.prepare(
      `SELECT e.id, e.source, e.provider, e.gross_cents, e.tax_cents, e.fee_cents, e.net_cents,
              e.currency, e.status, e.created_at, e.order_id, e.provider_ref, e.track_id,
              u.email AS user_email, t.title AS track_title
         FROM revenue_events e
         LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN tracks t ON t.id = e.track_id
        WHERE date(e.created_at) BETWEEN ?1 AND ?2
        ORDER BY e.created_at ASC
        LIMIT 5000`,
    )
      .bind(from, to)
      .all<Row & { track_id: string | null }>();
    rows = res.results;
  } catch {
    rows = []; // ledger table not created yet — empty report
  }

  const sum = summarize(rows);

  // ---- CSV -----------------------------------------------------------------
  if (format === "csv") {
    const head = [
      "Date", "Type", "Provider", "Customer", "Item", "Gross", "Tax (VAT)", "Fee", "Net",
      "Currency", "Status", "Order ID", "Payment reference",
    ];
    const lines = [head.join(",")];
    for (const r of rows) {
      lines.push(
        [
          dateOnly(r.created_at),
          typeLabel(r.source),
          providerLabel(r.provider),
          r.user_email ?? "",
          r.track_title ?? (r.source === "subscription" ? "Subscription" : ""),
          money(r.gross_cents),
          money(r.tax_cents),
          money(r.fee_cents),
          money(r.net_cents),
          (r.currency ?? "usd").toUpperCase(),
          r.status ?? "active",
          r.order_id ?? "",
          r.provider_ref ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const csv = "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="tvmusicstore-sales-${from}_to_${to}.csv"`,
      },
    });
  }

  // ---- PDF (one-page summary) ---------------------------------------------
  if (format === "pdf") {
    const pdf = buildReportPdf(from, to, sum, rows.length);
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="tvmusicstore-sales-${from}_to_${to}.pdf"`,
      },
    });
  }

  // ---- JSON (preview) ------------------------------------------------------
  return json({
    from,
    to,
    count: rows.length,
    summary: sum,
    rows: rows.slice(0, 500).map((r) => ({
      date: dateOnly(r.created_at),
      type: typeLabel(r.source),
      provider: providerLabel(r.provider),
      customer: r.user_email ?? "",
      item: r.track_title ?? (r.source === "subscription" ? "Subscription" : ""),
      gross: r.gross_cents,
      fee: r.fee_cents,
      net: r.net_cents,
      status: r.status ?? "active",
    })),
    truncated: rows.length >= 5000,
  });
};

// ---------------------------------------------------------------------------
// One-page PDF summary (uses the same zero-dep builder as the licence cert).
// ---------------------------------------------------------------------------
const INK: Rgb = [0.09, 0.1, 0.12];
const GRAY: Rgb = [0.44, 0.45, 0.48];
const GOLD: Rgb = [0.957, 0.769, 0.188];
const HEADER_BG: Rgb = [0.071, 0.075, 0.09];
const WHITE: Rgb = [1, 1, 1];
const RULE: Rgb = [0.86, 0.86, 0.87];
const L = 48;
const R = 595 - L;

const buildReportPdf = (
  from: string,
  to: string,
  sum: ReturnType<typeof summarize>,
  txCount: number,
): Uint8Array => {
  const ops: PdfOp[] = [];
  const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

  // header band
  ops.push({ op: "rect", x: 0, y: 782, w: 595, h: 60, color: HEADER_BG });
  ops.push({ op: "rect", x: 0, y: 779, w: 595, h: 3, color: GOLD });
  ops.push({ op: "text", text: "TV MUSIC STORE", x: L, y: 812, size: 8, font: "helvB", color: GOLD });
  ops.push({ op: "text", text: "Sales Report", x: L, y: 792, size: 18, font: "helvB", color: WHITE });
  ops.push({ op: "text", text: `Period ${from} to ${to}`, x: R, y: 812, size: 9, font: "helvB", color: WHITE, align: "right" });
  ops.push({ op: "text", text: `${txCount} transaction${txCount === 1 ? "" : "s"}`, x: R, y: 796, size: 8, color: [0.8, 0.8, 0.82], align: "right" });

  // headline totals
  const a = sum.active;
  let y = 740;
  ops.push({ op: "text", text: "SUMMARY (excludes refunds)", x: L, y, size: 9, font: "helvB", color: GOLD });
  y -= 8;
  ops.push({ op: "line", x1: L, y1: y, x2: R, y2: y, width: 0.7, color: RULE });
  y -= 22;
  const bigRow = (label: string, value: string, strong = false) => {
    ops.push({ op: "text", text: label, x: L, y, size: 10.5, font: "helv", color: GRAY });
    ops.push({ op: "text", text: value, x: R, y, size: strong ? 13 : 11, font: "helvB", color: strong ? INK : INK, align: "right" });
    y -= strong ? 26 : 20;
  };
  bigRow("Gross sales", dollars(a.gross));
  bigRow("VAT / tax collected", dollars(a.tax));
  bigRow("Processor fees", `- ${dollars(a.fee)}`);
  bigRow("Net (after fees)", dollars(a.net), true);

  if (sum.refunded.count > 0) {
    ops.push({ op: "text", text: `Refunds: ${sum.refunded.count} · ${dollars(sum.refunded.gross)} returned`, x: L, y, size: 9.5, color: [0.79, 0.22, 0.2] });
    y -= 24;
  } else {
    y -= 4;
  }

  // breakdown by type
  const section = (title: string) => {
    ops.push({ op: "line", x1: L, y1: y, x2: R, y2: y, width: 0.7, color: RULE });
    y -= 16;
    ops.push({ op: "text", text: title, x: L, y, size: 9, font: "helvB", color: GOLD });
    y -= 16;
  };
  const cols = [L, 250, 360, 470];
  const tableHead = () => {
    ops.push({ op: "text", text: "", x: cols[0], y, size: 8, color: GRAY });
    ops.push({ op: "text", text: "Count", x: cols[1], y, size: 8, font: "helvB", color: GRAY });
    ops.push({ op: "text", text: "Gross", x: cols[2], y, size: 8, font: "helvB", color: GRAY });
    ops.push({ op: "text", text: "Net", x: cols[3], y, size: 8, font: "helvB", color: GRAY });
    y -= 16;
  };
  const tableRow = (label: string, b: Bucket) => {
    ops.push({ op: "text", text: label, x: cols[0], y, size: 10, color: INK });
    ops.push({ op: "text", text: String(b.count), x: cols[1], y, size: 10, color: INK });
    ops.push({ op: "text", text: dollars(b.gross), x: cols[2], y, size: 10, color: INK });
    ops.push({ op: "text", text: dollars(b.net), x: cols[3], y, size: 10, color: INK });
    y -= 18;
  };

  section("BY TYPE");
  tableHead();
  tableRow("Solo licenses", sum.byType.license);
  tableRow("Subscriptions", sum.byType.subscription);
  y -= 6;

  section("BY PROCESSOR");
  tableHead();
  tableRow("Stripe", sum.byProvider.stripe);
  tableRow("PayPal", sum.byProvider.paypal);

  // footer
  ops.push({ op: "line", x1: L, y1: 90, x2: R, y2: 90, width: 0.7, color: RULE });
  ops.push({ op: "text", text: "Figures from the TV Music Store revenue ledger. Full per-transaction detail is in the CSV export.", x: L, y: 76, size: 8, color: GRAY });
  ops.push({ op: "text", text: "This document is a summary for book-keeping and is not a tax invoice.", x: L, y: 64, size: 8, color: GRAY });

  return buildPdf(ops);
};
