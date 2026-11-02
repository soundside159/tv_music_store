import { useEffect, useState } from "react";

// Composer -> Earnings. Real money from the revenue ledger (revenue_allocations),
// with the rules spelled out on the page. A payout system a composer cannot
// audit is a payout system he will not trust — so this screen shows the same
// numbers the owner sees, plus WHY they are those numbers.

const GOLD = "#F4C430";

interface MonthRow {
  month: string;
  amountCents: number;
  withheldCents?: number;
  netCents?: number;
  points: number;
  paid: boolean;
  paidAt: string | null;
  releaseDate: string;
  state: "paid" | "payable" | "held";
}

interface Earnings {
  composer: { id: string; name: string };
  policy: { holdbackDays: number; thresholdCents: number };
  openMonth: { month: string; publishOn: string };
  totals: {
    lifetimeCents: number;
    paidOutCents: number;
    payableCents: number;
    payableNetCents?: number;
    heldCents: number;
    payable: boolean;
  };
  months: MonthRow[];
  tracks: { title: string; slug: string; points: number }[];
  /** UK withholding tax on his royalties, basis points (500 = 5%). */
  withholdingBps?: number;
}

const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <p className="font-body text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 font-body text-xl font-semibold tabular-nums" style={{ color: GOLD }}>
      {value}
    </p>
    {hint && <p className="mt-1 font-body text-[11px] text-muted-foreground/70">{hint}</p>}
  </div>
);

const ComposerEarnings = () => {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/composer/earnings", { credentials: "include" });
        const body = (await res.json()) as Earnings & { error?: string };
        if (!res.ok || body.error) throw new Error(body.error ?? "Failed to load");
        setData(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 font-body text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border/40 bg-card/40" />
        ))}
      </div>
    );
  }

  const { totals, policy } = data;
  const threshold = money(policy.thresholdCents);
  const tax = data.withholdingBps ?? 0;

  // Three numbers only (owner: composers like it simple), then one row per
  // closed month. The running month never shows a figure (see the API).
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Ready to pay"
          value={money(totals.payableCents)}
          hint={
            totals.payableCents > 0 && !totals.payable
              ? `Paid once it reaches ${threshold}`
              : tax && totals.payableCents > 0
                ? `You receive ${money(totals.payableNetCents ?? totals.payableCents)} after UK tax`
                : undefined
          }
        />
        <Stat
          label="Waiting"
          value={money(totals.heldCents)}
          hint={`Becomes ready ${policy.holdbackDays} days after the month closes`}
        />
        <Stat label="Paid out" value={money(totals.paidOutCents)} hint="All time" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-body text-sm font-semibold text-foreground">By month</h2>
        <p className="mt-1 font-body text-xs text-muted-foreground">
          This month&apos;s total appears on {data.openMonth.publishOn}.
          {tax
            ? ` UK tax of ${tax / 100}% (the treaty rate for your country) is kept back for HMRC; you can usually claim it against tax at home.`
            : ""}
        </p>
        <div className="mt-3 divide-y divide-border/40">
          {data.months.length === 0 && (
            <p className="py-6 text-center font-body text-sm text-muted-foreground">No closed month yet.</p>
          )}
          {data.months.map((m) => (
            <div key={m.month} className="flex items-center justify-between gap-3 py-3 font-body text-sm">
              <div>
                <p className="text-foreground">{m.month}</p>
                <p className="text-[11px] text-muted-foreground">
                  {m.state === "paid"
                    ? `Paid${m.paidAt ? ` ${m.paidAt.slice(0, 10)}` : ""}`
                    : m.state === "payable"
                      ? "Ready to pay"
                      : `Waiting until ${m.releaseDate}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums" style={{ color: m.amountCents < 0 ? undefined : GOLD }}>
                  {money(m.amountCents)}
                </p>
                {tax > 0 && m.withheldCents ? (
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    you receive {money(m.netCents ?? m.amountCents)}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ComposerEarnings;
