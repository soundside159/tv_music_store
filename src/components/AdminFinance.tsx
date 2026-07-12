import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// Admin -> Finance. Real money, straight from the revenue ledger — no mocks.
//
// Reading the numbers:
//   Gross      what the customers actually paid
//   − Tax      VAT / sales tax collected — the state's money, never split
//   − Fees     Stripe / PayPal
//   = Net      the only thing that gets divided
//   Authors    50% of net, allocated to the composers each payer downloaded
//   Platform   the rest — your half, plus the author share of payers who
//              downloaded nothing that cycle (they have no author to pay)

const GOLD = "#F4C430";

interface ComposerLine {
  composerId: string;
  name: string;
  points: number;
  amount: number;
  status: string;
  paidAt: string | null;
}

interface RevenueEvent {
  id: string;
  source: string;
  provider: string;
  gross_cents: number;
  tax_cents: number;
  fee_cents: number;
  net_cents: number;
  status: string;
  created_at: string;
  user_email: string | null;
}

interface Balance {
  composerId: string;
  name: string;
  released: number;
  held: number;
  payable: boolean;
}

interface Report {
  month: string;
  months: string[];
  policy: { holdbackDays: number; thresholdCents: number };
  releaseDate: string;
  balances: Balance[];
  totals: {
    gross: number;
    tax: number;
    fee: number;
    net: number;
    authorTotal: number;
    platformTotal: number;
    unallocatedTotal: number;
    bySource: { source: string; payments: number; gross: number; net: number }[];
  };
  composers: ComposerLine[];
  events: RevenueEvent[];
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Row = ({
  label,
  value,
  hint,
  strong,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  negative?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <span className="font-body text-sm text-muted-foreground">
      {label}
      {hint && <span className="ml-1.5 text-xs text-muted-foreground/60">{hint}</span>}
    </span>
    <span
      className={`font-body tabular-nums ${
        strong ? "text-base font-semibold text-foreground" : "text-sm text-foreground/90"
      }`}
    >
      {negative ? `− ${value}` : value}
    </span>
  </div>
);

const AdminFinance = () => {
  const [report, setReport] = useState<Report | null>(null);
  const [month, setMonth] = useState<string | null>(null);
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
      setMonth(data.month);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** One place for every POST — they all reload the report afterwards. */
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

  const setPaid = async (composerId: string, paid: boolean) => {
    if (!report) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/finance", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: paid ? "mark_paid" : "mark_due",
          month: report.month,
          composerId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      await load(report.month);
      toast.success(paid ? "Marked as paid" : "Marked as due");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ["month", "composer", "points", "amount_usd", "status"],
      ...report.composers.map((c) => [
        report.month,
        c.name,
        String(c.points),
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
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border/40 bg-card/40" />
        ))}
      </div>
    );
  }

  const t = report.totals;
  const noMoney = t.gross === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-body text-sm text-muted-foreground">Month</span>
          <select
            value={month ?? report.month}
            onChange={(e) => void load(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
          >
            {(report.months.length ? report.months : [report.month]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
        >
          Export payouts (CSV)
        </button>
      </div>

      {noMoney && (
        <p className="rounded-xl border border-border/60 bg-card/40 p-4 font-body text-sm text-muted-foreground">
          No payments booked in {report.month} yet. Subscriptions appear here when Stripe charges an
          invoice; single licenses the moment PayPal captures them.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Where the money went */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-body text-sm font-semibold text-foreground">
            {report.month} — from gross to split
          </h2>
          <div className="mt-3 divide-y divide-border/40">
            <Row label="Gross (customers paid)" value={money(t.gross)} strong />
            <Row label="Tax / VAT collected" hint="the state's, never split" value={money(t.tax)} negative />
            <Row label="Payment fees" hint="Stripe / PayPal" value={money(t.fee)} negative />
            <Row label="Net revenue" hint="this is what gets divided" value={money(t.net)} strong />
          </div>
          <div className="mt-4 divide-y divide-border/40 border-t border-border/60 pt-2">
            <Row label="Composers (author share)" value={money(t.authorTotal)} strong />
            <Row
              label="Platform"
              hint="your half + unallocated"
              value={money(t.platformTotal)}
              strong
            />
            <Row
              label="…of which unallocated"
              hint="payers who downloaded nothing"
              value={money(t.unallocatedTotal)}
            />
          </div>
        </div>

        {/* Where it came from */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-body text-sm font-semibold text-foreground">Sources</h2>
          <table className="mt-3 w-full border-collapse font-body text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="py-2 font-semibold text-muted-foreground">Source</th>
                <th className="py-2 text-right font-semibold text-muted-foreground">Payments</th>
                <th className="py-2 text-right font-semibold text-muted-foreground">Gross</th>
                <th className="py-2 text-right font-semibold text-muted-foreground">Net</th>
              </tr>
            </thead>
            <tbody>
              {t.bySource.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    —
                  </td>
                </tr>
              )}
              {t.bySource.map((s) => (
                <tr key={s.source} className="border-b border-border/40 last:border-b-0">
                  <td className="py-2 capitalize text-foreground">
                    {s.source === "license" ? "Single licenses" : "Subscriptions"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {s.payments}
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground/90">
                    {money(s.gross)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground/90">{money(s.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 font-body text-[11px] leading-5 text-muted-foreground">
            Subscription money follows the payer: it is split only between the composers that
            subscriber actually downloaded that cycle (1 point per unique track; MP3 128 and a
            composer's own tracks never count). That is what makes farming your own tracks a losing
            trade — you would pay a full subscription to win back a fraction of it.
          </p>
        </div>
      </div>

      {/* What can actually be sent today */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-body text-sm font-semibold text-foreground">Payable now</h2>
            <p className="mt-1 font-body text-xs text-muted-foreground">
              A month clears {report.policy.holdbackDays} days after it ends (refunds settle first);
              balances under {money(report.policy.thresholdCents)} roll over instead of being wired
              for pennies. {report.month} clears on {report.releaseDate}.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 font-body text-[11px] text-muted-foreground">
              Hold-back, days
              <input
                type="number"
                min={0}
                max={180}
                defaultValue={report.policy.holdbackDays}
                onBlur={(e) =>
                  void act(
                    {
                      action: "set_policy",
                      holdbackDays: Number(e.target.value),
                      thresholdCents: report.policy.thresholdCents,
                    },
                    "Payout policy saved",
                  )
                }
                className="w-24 rounded-md border border-border bg-background px-2 py-1 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 font-body text-[11px] text-muted-foreground">
              Minimum payout, $
              <input
                type="number"
                min={0}
                defaultValue={report.policy.thresholdCents / 100}
                onBlur={(e) =>
                  void act(
                    {
                      action: "set_policy",
                      holdbackDays: report.policy.holdbackDays,
                      thresholdCents: Math.round(Number(e.target.value) * 100),
                    },
                    "Payout policy saved",
                  )
                }
                className="w-24 rounded-md border border-border bg-background px-2 py-1 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse font-body text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Composer</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Cleared</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Clearing</th>
                <th className="py-2 font-semibold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {report.balances.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Nothing outstanding.
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
                        {b.released > 0 ? "Under minimum — rolls over" : "Still clearing"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout lines */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-body text-sm font-semibold text-foreground">
          Composer payouts — {report.month}
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse font-body text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Composer</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Points</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Amount</th>
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Status</th>
                <th className="py-2 font-semibold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {report.composers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nothing to pay out for this month.
                  </td>
                </tr>
              )}
              {report.composers.map((c) => (
                <tr key={c.composerId} className="border-b border-border/40 last:border-b-0">
                  <td className="py-2.5 pr-4 font-medium text-foreground">{c.name}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {c.points}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums" style={{ color: GOLD }}>
                    {money(c.amount)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-body text-[10px] font-semibold ${
                        c.status === "paid"
                          ? "border-[#F4C430]/50 bg-[#F4C430]/10 text-[#F4C430]"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {c.status === "paid" ? "Paid" : "Due"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setPaid(c.composerId, c.status !== "paid")}
                      className="rounded-md border border-border px-2.5 py-1 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-50"
                    >
                      {c.status === "paid" ? "Mark due" : "Mark paid"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-body text-[11px] text-muted-foreground">
          Marking a line paid records it — it does not send money. Transfers are made by you, from
          the payout details in the composer's profile.
        </p>
      </div>

      {/* Ledger */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-body text-sm font-semibold text-foreground">Payments</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse font-body text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Date</th>
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Customer</th>
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Type</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Gross</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Tax</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Fee</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Net</th>
                <th className="py-2 font-semibold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {report.events.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
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
                  <td className="py-2.5 pr-4 capitalize text-muted-foreground">
                    {e.source === "license" ? "License" : "Subscription"} · {e.provider}
                    {e.status === "refunded" && (
                      <span className="ml-2 rounded-full border border-red-400/40 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-red-400">
                        refunded
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-foreground/90">
                    {money(e.gross_cents)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {money(e.tax_cents)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {money(e.fee_cents)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-foreground">
                    {money(e.net_cents)}
                  </td>
                  <td className="py-2.5 text-right">
                    {e.status !== "refunded" && (
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Actually sends the money back through Stripe/PayPal. */}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Refund ${money(e.gross_cents)} to ${e.user_email ?? "this customer"}?\n\n` +
                                  `This REALLY sends the money back through ${
                                    e.provider === "stripe" ? "Stripe" : "PayPal"
                                  }.\n\n` +
                                  "The payment then leaves the revenue totals. If the composer was already paid, the amount is netted off his NEXT payout — we never take money back from his account.",
                              )
                            )
                              return;
                            void act(
                              { action: "refund_payment", eventId: e.id },
                              "Refunded — the money is on its way back",
                            );
                          }}
                          className="rounded-md border border-red-400/40 px-2.5 py-1 font-body text-xs text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                        >
                          Refund
                        </button>
                        {/* For money already sent back outside the site. */}
                        <button
                          type="button"
                          disabled={busy}
                          title="Only records the reversal — use this if you already refunded the customer in the Stripe or PayPal dashboard"
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Record this payment as refunded WITHOUT sending money?\n\nUse this only if the customer has already been refunded elsewhere.",
                              )
                            )
                              return;
                            void act({ action: "refund_event", eventId: e.id }, "Reversal recorded");
                          }}
                          className="rounded-md border border-border px-2 py-1 font-body text-xs text-muted-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          Mark only
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-body text-[11px] leading-5 text-muted-foreground">
          <span className="text-red-400">Refund</span> really sends the money back through Stripe or
          PayPal — you never have to open their dashboards.{" "}
          <span className="text-foreground">Mark only</span> just records a reversal for money you
          already returned elsewhere. Refunds and chargebacks that start on Stripe's side are booked
          here automatically.
        </p>
      </div>
    </div>
  );
};

export default AdminFinance;
