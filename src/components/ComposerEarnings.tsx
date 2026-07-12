import { useEffect, useState } from "react";

// Composer -> Earnings. Real money from the revenue ledger (revenue_allocations),
// with the rules spelled out on the page. A payout system a composer cannot
// audit is a payout system he will not trust — so this screen shows the same
// numbers the owner sees, plus WHY they are those numbers.

const GOLD = "#F4C430";

interface MonthRow {
  month: string;
  amountCents: number;
  points: number;
  paid: boolean;
  paidAt: string | null;
  releaseDate: string;
  state: "paid" | "payable" | "held";
}

interface Earnings {
  composer: { id: string; name: string };
  policy: { holdbackDays: number; thresholdCents: number };
  totals: {
    lifetimeCents: number;
    paidOutCents: number;
    payableCents: number;
    heldCents: number;
    payable: boolean;
  };
  months: MonthRow[];
  tracks: { title: string; slug: string; points: number }[];
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

const STATE_LABEL: Record<MonthRow["state"], string> = {
  paid: "Paid",
  payable: "Ready to pay",
  held: "Clearing",
};

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

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Earned all time" value={money(totals.lifetimeCents)} />
        <Stat label="Paid out" value={money(totals.paidOutCents)} />
        <Stat
          label="Ready to pay"
          value={money(totals.payableCents)}
          hint={
            totals.payableCents > 0 && !totals.payable
              ? `Rolls over until it reaches ${threshold}`
              : undefined
          }
        />
        <Stat
          label="Clearing"
          value={money(totals.heldCents)}
          hint={`Held ${policy.holdbackDays} days after the month ends`}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-body text-sm font-semibold text-foreground">Earnings by month</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse font-body text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="py-2 pr-4 font-semibold text-muted-foreground">Month</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Points</th>
                <th className="py-2 pr-4 text-right font-semibold text-muted-foreground">Amount</th>
                <th className="py-2 font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.months.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Nothing earned yet. Every subscriber who downloads one of your tracks, and every
                    single-track license, shows up here.
                  </td>
                </tr>
              )}
              {data.months.map((m) => (
                <tr key={m.month} className="border-b border-border/40 last:border-b-0">
                  <td className="py-2.5 pr-4 text-foreground">{m.month}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {m.points}
                  </td>
                  <td
                    className="py-2.5 pr-4 text-right font-semibold tabular-nums"
                    style={{ color: m.amountCents < 0 ? undefined : GOLD }}
                  >
                    {money(m.amountCents)}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-body text-[10px] font-semibold ${
                        m.state === "paid"
                          ? "border-[#F4C430]/50 bg-[#F4C430]/10 text-[#F4C430]"
                          : "border-border text-muted-foreground"
                      }`}
                      title={m.state === "held" ? `Clears on ${m.releaseDate}` : undefined}
                    >
                      {STATE_LABEL[m.state]}
                    </span>
                    {m.state === "held" && (
                      <span className="ml-2 font-body text-[11px] text-muted-foreground/70">
                        clears {m.releaseDate}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.tracks.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-body text-sm font-semibold text-foreground">
            Your tracks, by counted downloads
          </h2>
          <p className="mt-1 font-body text-xs text-muted-foreground">
            Points, not dollars: what a download is worth depends on what that subscriber paid, so a
            per-track amount would be made up.
          </p>
          <ul className="mt-3 divide-y divide-border/40">
            {data.tracks.map((t) => (
              <li key={t.slug} className="flex items-center justify-between py-2">
                <span className="font-body text-sm text-foreground">{t.title}</span>
                <span className="font-body text-sm tabular-nums text-muted-foreground">
                  {t.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The rules, in the composer's own words — no surprises at payout time. */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-body text-sm font-semibold text-foreground">How this is calculated</h2>
        <ul className="mt-3 space-y-2 font-body text-sm leading-6 text-muted-foreground">
          <li>
            <span className="text-foreground">50% of net revenue</span> goes to composers. Net = what
            the customer paid, minus VAT (that money is the state's) and the payment fee.
          </li>
          <li>
            <span className="text-foreground">Subscriptions follow the subscriber.</span> Each
            subscription is split only between the composers that subscriber actually downloaded in
            the cycle he paid for — not thrown into a shared pool.
          </li>
          <li>
            <span className="text-foreground">One point per unique track, per subscriber, per
            cycle.</span> Taking the WAV, the stems and the MP3 of the same track is still one point.
            MP3 128 (the free format) does not count, and your own downloads of your own tracks count
            for nothing.
          </li>
          <li>
            <span className="text-foreground">Single-track licenses</span> pay you 50% of the net of
            that sale, straight away.
          </li>
          <li>
            <span className="text-foreground">Timing.</span> A month clears {policy.holdbackDays} days
            after it ends, so refunds and chargebacks settle first. Balances under {threshold} roll
            over to the next payout instead of being wired for pennies.
          </li>
          <li>
            <span className="text-foreground">Refunds.</span> If a customer is refunded after you were
            already paid, we never take money back from your account — the amount is simply netted off
            your next payout.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ComposerEarnings;
