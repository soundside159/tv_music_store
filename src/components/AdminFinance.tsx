import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/SectionHeading";

// Admin → Finance. Deliberately minimal (owner's call): four blocks, no essays.
//
//   1. Money this month   gross → −tax → −fees → net → composers / you
//   2. Sources            subscriptions vs single licenses
//   3. Composer payouts   to pay now + still clearing, one button
//   4. Payments           the ledger, with Refund
//
// The hold-back (30 days) and minimum payout ($50) are NOT editable here on
// purpose — the owner asks me to change them if he ever wants to.

const GOLD = "#F4C430";

interface ComposerLine {
  composerId: string;
  name: string;
  points: number;
  amount: number;
  status: string;
}

interface Balance {
  composerId: string;
  name: string;
  released: number;
  held: number;
  payable: boolean;
}

interface RevenueEvent {
  id: string;
  source: string;
  provider: string;
  /** Stripe: invoice id (in_…) for subscriptions, "<pi|cs>:<slug>:<tier>" for carts. */
  provider_ref?: string | null;
  gross_cents: number;
  tax_cents: number;
  fee_cents: number;
  net_cents: number;
  status: string;
  created_at: string;
  user_email: string | null;
}

/** Deep link to this payment in the Stripe dashboard — refunds are done THERE;
 *  the charge.refunded webhook books the reversal and voids the licence here.
 *  testMode comes from the server (invoice/pi ids don't reveal the mode), so
 *  sandbox links land straight in test data without the "Did you mean test
 *  mode?" bounce. */
const stripeLinkFor = (e: RevenueEvent, testMode: boolean): string | null => {
  if (e.provider !== "stripe" || !e.provider_ref) return null;
  const token = e.provider_ref.split(":")[0];
  const base = `https://dashboard.stripe.com/${testMode || e.provider_ref.includes("_test_") ? "test/" : ""}`;
  if (token.startsWith("in_")) return `${base}invoices/${token}`;
  if (token.startsWith("pi_")) return `${base}payments/${token}`;
  return `${base}search?query=${encodeURIComponent(token)}`;
};

interface Report {
  month: string;
  months: string[];
  policy: { holdbackDays: number; thresholdCents: number };
  balances: Balance[];
  totals: {
    gross: number;
    tax: number;
    fee: number;
    net: number;
    authorTotal: number;
    platformTotal: number;
    bySource: { source: string; payments: number; gross: number; net: number }[];
  };
  composers: ComposerLine[];
  events: RevenueEvent[];
  /** true while the site runs on sandbox (sk_test_) keys — links get /test/. */
  stripeTestMode?: boolean;
}

const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const Line = ({
  label,
  value,
  minus,
  strong,
  gold,
}: {
  label: string;
  value: string;
  minus?: boolean;
  strong?: boolean;
  gold?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <span
      className={`font-body text-sm ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}
    >
      {label}
    </span>
    <span
      className="font-body tabular-nums"
      style={{
        color: gold ? GOLD : undefined,
        fontWeight: strong ? 600 : 400,
        fontSize: strong ? "1rem" : "0.875rem",
      }}
    >
      {minus ? `− ${value}` : value}
    </span>
  </div>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border bg-card p-5">
    <h2 className="font-body text-sm font-semibold text-foreground">{title}</h2>
    <div className="mt-3">{children}</div>
  </div>
);

/** Book-keeping export: pick a date range → CSV (full transactions) or PDF
 *  (one-page summary). All figures come from the revenue ledger, so the owner
 *  never has to reconcile inside Stripe / PayPal. */
const ReportExport = () => {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [preview, setPreview] = useState<{ count: number; gross: number; tax: number; fee: number; net: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const url = (fmt: string) =>
    `/api/admin/finance-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=${fmt}`;

  const runPreview = async () => {
    setLoading(true);
    try {
      const r = await fetch(url("json"), { credentials: "include" });
      const d = (await r.json()) as { count?: number; summary?: { active: { gross: number; tax: number; fee: number; net: number } } };
      if (r.ok && d.summary) {
        setPreview({ count: d.count ?? 0, ...d.summary.active });
      } else {
        toast.error("Could not load report");
      }
    } catch {
      toast.error("Could not load report");
    } finally {
      setLoading(false);
    }
  };

  const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
  const inputCls =
    "rounded-lg border border-border bg-background px-3 py-1.5 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none";
  const btnCls =
    "rounded-lg border border-border px-3 py-1.5 font-body text-xs font-medium text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]";

  return (
    <Card title="Accountant report">
      <p className="mb-3 font-body text-xs text-muted-foreground">
        Pick a date range and export every sale (solo licenses + subscriptions, both processors)
        with gross, VAT, fees and net — straight from the ledger, no Stripe/PayPal digging.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {/* onClick showPicker(): the browser's calendar opens from a click
            anywhere on the field, not only on the tiny icon. */}
        <label className="flex flex-col gap-1">
          <span className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">From</span>
          <input
            type="date"
            value={from}
            max={to}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => setFrom(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">To</span>
          <input
            type="date"
            value={to}
            min={from}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          />
        </label>
        <button type="button" onClick={() => void runPreview()} className={btnCls} disabled={loading}>
          {loading ? "Loading…" : "Preview"}
        </button>
        <a href={url("csv")} className={btnCls}>
          Export CSV
        </a>
        <a href={url("pdf")} target="_blank" rel="noopener noreferrer" className={btnCls}>
          Export PDF
        </a>
      </div>
      {preview && (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-border/60 pt-3 font-body text-sm sm:grid-cols-5">
          {[
            ["Transactions", String(preview.count)],
            ["Gross", dollars(preview.gross)],
            ["VAT", dollars(preview.tax)],
            ["Fees", dollars(preview.fee)],
            ["Net", dollars(preview.net)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className="font-semibold text-foreground">{v}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const AdminFinance = () => {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (m?: string | null) => {
    try {
      const res = await fetch(`/api/admin/finance${m ? `?month=${m}` : ""}`, {
        credentials: "include",
      });
      const data = (await res.json()) as Report & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load");
      setReport(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (payload: Record<string, unknown>, okMessage: string) => {
    if (!report) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/finance", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month: report.month, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      await load(report.month);
      toast.success(okMessage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ["month", "composer", "amount_usd", "status"],
      ...report.composers.map((c) => [
        report.month,
        c.name,
        (c.amount / 100).toFixed(2),
        c.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `payouts-${report.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-400/40 bg-card p-5 font-body text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border/40 bg-card/40" />
        ))}
      </div>
    );
  }

  const t = report.totals;

  return (
    <div className="space-y-4">
      {/* ---- Category 1: reports over ANY date range (accountant stuff). ---- */}
      <SectionHeading title="Accounting & Reports" />
      <ReportExport />

      {/* ---- Category 2: everything below is the SELECTED MONTH — payments
              that arrived in it, their sources, and the composer split. ---- */}
      <SectionHeading
        title="Month overview"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={report.month}
              onChange={(e) => void load(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
            >
              {(report.months.length ? report.months : [report.month]).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
            >
              Export payouts (CSV)
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1 — the month's money */}
        <Card title="Money this month">
          <div className="divide-y divide-border/40">
            <Line label="Customers paid" value={money(t.gross)} strong />
            <Line label="Tax / VAT" value={money(t.tax)} minus />
            <Line label="Payment fees" value={money(t.fee)} minus />
            <Line label="Net" value={money(t.net)} strong />
          </div>
          <div className="mt-2 divide-y divide-border/40 border-t border-border/60 pt-1">
            <Line label="Composers" value={money(t.authorTotal)} strong gold />
            <Line label="You" value={money(t.platformTotal)} strong gold />
          </div>
        </Card>

        {/* 2 — where it came from */}
        <Card title="Sources">
          <table className="w-full border-collapse font-body text-sm">
            <tbody>
              {t.bySource.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-muted-foreground">No payments yet.</td>
                </tr>
              )}
              {t.bySource.map((s) => (
                <tr key={s.source} className="border-b border-border/40 last:border-b-0">
                  <td className="py-2.5 text-foreground">
                    {s.source === "license" ? "Single licenses" : "Subscriptions"}
                    <span className="ml-2 text-xs text-muted-foreground">×{s.payments}</span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {money(s.gross)}
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">
                    {money(s.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* 3 — who to pay */}
      <Card title="Composer payouts">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse font-body text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Composer</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">To pay</th>
                <th
                  className="py-2 pr-4 text-right font-semibold text-muted-foreground"
                  title={`Money still inside the ${report.policy.holdbackDays}-day window that lets refunds settle first.`}
                >
                  Still clearing
                </th>
                <th className="py-2 font-semibold text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {report.balances.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Nothing to pay out.
                  </td>
                </tr>
              )}
              {report.balances.map((b) => (
                <tr key={b.composerId} className="border-b border-border/40 last:border-b-0">
                  <td className="py-2.5 pr-4 font-medium text-foreground">{b.name}</td>
                  <td
                    className="py-2.5 pr-4 text-right font-semibold tabular-nums"
                    style={{ color: GOLD }}
                  >
                    {money(b.released)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {money(b.held)}
                  </td>
                  <td className="py-2.5 text-right">
                    {b.payable ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            { action: "pay_balance", composerId: b.composerId },
                            `Paid out ${b.name}`,
                          )
                        }
                        className="rounded-md bg-[#F4C430] px-3 py-1 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
                      >
                        Mark paid
                      </button>
                    ) : (
                      <span className="font-body text-[11px] text-muted-foreground/70">
                        {b.released > 0
                          ? `Under ${money(report.policy.thresholdCents)}`
                          : "Clearing"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4 — the ledger */}
      <Card title="Payments">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse font-body text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Date</th>
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Customer</th>
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Type</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Paid</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Net</th>
                <th className="py-2 font-semibold text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {report.events.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No payments yet.
                  </td>
                </tr>
              )}
              {report.events.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-border/40 last:border-b-0 ${
                    e.status === "refunded" ? "opacity-50" : ""
                  }`}
                >
                  <td className="py-2.5 pr-4 text-muted-foreground">{e.created_at.slice(0, 10)}</td>
                  <td className="py-2.5 pr-4 text-foreground">{e.user_email ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {e.source === "license" ? "License" : "Subscription"}
                    {e.status === "refunded" && (
                      <span className="ml-2 rounded-full border border-red-400/40 px-1.5 py-px text-[10px] font-semibold uppercase text-red-400">
                        refunded
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-foreground/90">
                    {money(e.gross_cents)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-foreground">
                    {money(e.net_cents)}
                  </td>
                  {/* Refunds are done IN Stripe (open the payment, press Refund) —
                      the webhook books the reversal and voids the licence here.
                      The old in-admin Refund / Mark-only buttons are gone
                      (owner's call; the server actions still exist if ever needed). */}
                  <td className="py-2.5 text-right">
                    {(() => {
                      const url = stripeLinkFor(e, !!report.stripeTestMode);
                      return url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open this payment in Stripe — refund it there; the site records it automatically"
                          className="font-body text-xs font-semibold text-[#F4C430] hover:underline"
                        >
                          Stripe ↗
                        </a>
                      ) : (
                        <span className="font-body text-xs text-muted-foreground">—</span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminFinance;
