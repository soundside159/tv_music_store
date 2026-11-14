import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PeriodPicker } from "@/components/AdminSales";
import CountUp from "@/components/CountUp";

// Admin -> Finance, top to bottom, one question per block (owner's brief):
//   1. My income        what I earned as the store, as a composer, in total
//   2. Where it went    customers paid -> tax -> fees -> composers / store
//   3. Composer payouts who to pay now (balances, not the period)
//   4. Payments         the ledger for the period, with Stripe links
//   5. Accountant report (rarely used, so last)
// Period = when the money ARRIVED; data: /api/admin/finance?period=...

const GOLD = "#F4C430";

interface Balance {
  composerId: string;
  name: string;
  released: number;
  held: number;
  payable: boolean;
  /** UK tax withheld from `released` (for HMRC) and what goes to his bank. */
  withheld?: number;
  toPay?: number;
  withholdingBps?: number;
  taxCountry?: string | null;
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
  period: { id: string; label: string; from: string; to: string | null };
  policy: { holdbackDays: number; thresholdCents: number };
  income: { store: number; composer: number; total: number; splitting: number; composerNames: string[] };
  flow: {
    gross: number;
    tax: number;
    fee: number;
    net: number;
    composers: number;
    store: number;
    splitting: number;
    license: { count: number; gross: number; net: number };
    subscription: { count: number; gross: number; net: number };
  };
  composers: { composerId: string; name: string; amount: number; mine: boolean }[];
  balances: Balance[];
  events: RevenueEvent[];
  /** true while the site runs on sandbox (sk_test_) keys — links get /test/. */
  stripeTestMode?: boolean;
}

const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const Card = ({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-body text-sm font-semibold text-foreground">{title}</h2>
      {right}
    </div>
    <div className="mt-2">{children}</div>
  </div>
);

/** A row of the money chain: label left, amount right. */
const Row = ({
  label,
  value,
  sign,
  strong,
  color,
  swatch,
}: {
  label: string;
  value: string;
  sign?: "−" | "→";
  strong?: boolean;
  color?: string;
  swatch?: string;
}) => (
  <div className="flex items-baseline justify-between gap-4 py-1 font-body text-sm">
    <span className={`inline-flex items-center gap-2 ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      {swatch && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />}
      {sign && <span className="w-3 text-muted-foreground/70">{sign}</span>}
      {label}
    </span>
    <span className={`tabular-nums ${strong ? "font-semibold" : ""}`} style={{ color }}>
      {value}
    </span>
  </div>
);

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
  // Same picker as the Dashboard: a month ("2026-11"), a day ("2026-11-13") or "all".
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p: string) => {
    try {
      const res = await fetch(`/api/admin/finance?period=${p}`, { credentials: "include" });
      const data = (await res.json()) as Report & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load");
      setReport(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const act = async (payload: Record<string, unknown>, okMessage: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/finance", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      await load(period);
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
      ["period", "composer", "amount_usd"],
      ...report.composers.map((c) => [report.period.label, c.name, (c.amount / 100).toFixed(2)]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `composer-shares-${report.period.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl text-foreground">Finance</h2>
      <PeriodPicker value={period} onChange={setPeriod} />
    </div>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-red-400/40 bg-card p-5 font-body text-sm text-red-400">{error}</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4">
        {header}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border/40 bg-card/40" />
        ))}
      </div>
    );
  }

  const { income, flow } = report;
  const label = report.period.label; // "November", "October", "2026", "All time"
  const noPayments = report.period.id === "all" ? "No payments yet." : `No payments in ${label}.`;


  const payAction = (b: Balance) =>
    b.payable ? (
      <button
        type="button"
        disabled={busy}
        onClick={() => void act({ action: "pay_balance", composerId: b.composerId }, `Paid out ${b.name}`)}
        className="rounded-md bg-[#F4C430] px-3 py-1 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
      >
        Mark paid
      </button>
    ) : (
      <span className="font-body text-[11px] text-muted-foreground/70">
        {b.released > 0 ? `Under ${money(report.policy.thresholdCents)}` : "Clearing"}
      </span>
    );

  return (
    <div className="space-y-4">
      {header}

      {/* 1 - what I earned: one thin strip, same as the Dashboard */}
      <div>
        <div className="grid grid-cols-3 divide-x divide-border/70 rounded-xl border border-border bg-card">
          {(
            [
              ["As TV Music Store", income.store, false],
              ["As composer", income.composer, false],
              ["Total to you", income.total, true],
            ] as [string, number, boolean][]
          ).map(([l, cents, gold]) => (
            <div key={l} className="flex min-w-0 flex-wrap items-baseline gap-x-3 px-4 py-2.5 sm:px-6">
              <span className="whitespace-nowrap font-body text-xs uppercase tracking-wide text-muted-foreground">{l}</span>
              <span className="font-body text-xl font-semibold tabular-nums" style={{ color: gold ? GOLD : undefined }}>
                <CountUp cents={cents} format={money} />
              </span>
            </div>
          ))}
        </div>
        {income.splitting > 0 && (
          <p className="mt-1.5 px-1 font-body text-[11px] text-muted-foreground">
            + {money(income.splitting)} from subscriptions not split yet (their paid period has not closed).
          </p>
        )}
      </div>

      {/* 2 — where the money went */}
      <Card title="Where the money went">
        {flow.gross === 0 ? (
          <p className="py-2 text-center font-body text-sm text-muted-foreground">{noPayments}</p>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              <Row label="Customers paid" value={money(flow.gross)} strong />
              <Row sign="−" label="Tax / VAT" value={money(flow.tax)} />
              <Row sign="−" label="Payment fees" value={money(flow.fee)} />
              <Row label="Net" value={money(flow.net)} strong />
              <Row sign="→" label="Composers" value={money(flow.composers)} />
              <Row sign="→" label="TV Music Store" value={money(flow.store)} color={GOLD} />
              {flow.splitting > 0 && (
                <Row sign="→" label="Still splitting" value={money(flow.splitting)} />
              )}
            </div>
            <p className="mt-2 font-body text-xs text-muted-foreground">
              Single licenses: {flow.license.count} · {money(flow.license.gross)} &nbsp;|&nbsp; Subscriptions:{" "}
              {flow.subscription.count} · {money(flow.subscription.gross)}
            </p>

            {report.composers.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">Composer shares</p>
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="font-body text-[11px] text-muted-foreground hover:text-[#F4C430]"
                  >
                    Export CSV
                  </button>
                </div>
                {report.composers.map((c) => (
                  <Row
                    key={c.composerId}
                    label={c.mine ? `${c.name} (you)` : c.name}
                    value={money(c.amount)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* 3 — who to pay now (not tied to the period) */}
      <Card
        title="Composer payouts"
        right={
          <span className="font-body text-[11px] text-muted-foreground">
            Paid {report.policy.holdbackDays} days after the month closes, from {money(report.policy.thresholdCents)}
          </span>
        }
      >
        {report.balances.length === 0 ? (
          <p className="py-2 text-center font-body text-sm text-muted-foreground">Nothing to pay out.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {report.balances.map((b) => (
              <div key={b.composerId} className="py-2 font-body text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{b.name}</span>
                  {payAction(b)}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">Ready</p>
                    <p className="tabular-nums text-foreground">{money(b.released)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      UK tax{b.withholdingBps ? ` ${b.withholdingBps / 100}%${b.taxCountry ? ` ${b.taxCountry}` : ""}` : ""}
                    </p>
                    <p className="tabular-nums text-muted-foreground">{b.withheld ? `−${money(b.withheld)}` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Send to bank</p>
                    {/* Only a real transfer amount once the balance reaches the
                        minimum; below it nothing is sent, it rolls over. */}
                    {b.payable ? (
                      <p className="font-semibold tabular-nums" style={{ color: GOLD }}>
                        {money(b.toPay ?? b.released)}
                      </p>
                    ) : (
                      <p className="tabular-nums text-muted-foreground">
                        — <span className="text-[10px]">from {money(report.policy.thresholdCents)}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground">Still clearing</p>
                    <p className="tabular-nums text-muted-foreground">{money(b.held)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 4 — the ledger for the period */}
      <Card title={`Payments · ${label}`}>
        {report.events.length === 0 ? (
          <p className="py-2 text-center font-body text-sm text-muted-foreground">{noPayments}</p>
        ) : (
          <div className="divide-y divide-border/40">
            {report.events.map((e) => {
              const url = stripeLinkFor(e, !!report.stripeTestMode);
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-2 font-body text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{e.user_email ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.created_at.slice(0, 10)} · {e.source === "license" ? "License" : "Subscription"}
                      {e.status === "refunded" && <span className="ml-1 text-red-400">· refunded</span>}
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open this payment in Stripe — refund it there; the site records it automatically"
                          className="ml-2 font-semibold text-[#F4C430] hover:underline"
                        >
                          Stripe ↗
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-semibold tabular-nums ${e.status === "refunded" ? "text-red-400" : "text-foreground"}`}>
                      {e.status === "refunded" ? `-${money(e.gross_cents)}` : money(e.gross_cents)}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">net {money(e.net_cents)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 5 — for the accountant */}
      <ReportExport />
    </div>
  );
};

export default AdminFinance;
