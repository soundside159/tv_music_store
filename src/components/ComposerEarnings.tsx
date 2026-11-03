import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CountUp from "@/components/CountUp";

// Composer -> Earnings, AudioJungle-style (owner's brief), two tabs:
//   Earnings   three numbers + a drill-down chart (All time -> year -> month)
//              with a table of the bars underneath
//   Statement  every money movement in a period (sales, subscription shares,
//              refunds, payouts, UK tax) + summary + PDF download
// Data: /api/composer/earnings (ready / waiting, payout rules) and
//       /api/composer/ledger (chart + statement).

const GOLD = "#F4C430";
const GOLD_DIM = "#9c7c1c";

const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

interface Summary {
  policy: { holdbackDays: number; thresholdCents: number };
  totals: { payableCents: number; payableNetCents?: number; heldCents: number; payable: boolean };
  months: { month: string; amountCents: number; state: "paid" | "payable" | "held"; releaseDate: string }[];
  withholdingBps?: number;
}

interface ChartData {
  level: "all" | "year" | "month";
  key: string;
  bars: { k: string; sales: number; salesCount: number; subscriptions: number; refunds: number }[];
  total: number;
  thisMonth: { month: string; amountCents: number; sales: number };
  lifetimeCents: number;
  paidOutCents: number;
}

/** `cents` null = still loading: a soft placeholder instead of a "$0.00" that
 *  then jumps; once loaded the number runs up (CountUp), in step with the chart. */
const Tile = ({ label, cents, hint }: { label: string; cents: number | null; hint?: string }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <p className="font-body text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 font-body text-2xl font-semibold tabular-nums" style={{ color: GOLD }}>
      {cents == null ? (
        <span className="inline-block h-7 w-24 animate-pulse rounded bg-white/[0.06] align-middle" />
      ) : (
        <CountUp cents={cents} format={money} />
      )}
    </p>
    {hint && <p className="mt-1 font-body text-[11px] text-muted-foreground/80">{hint}</p>}
  </div>
);

// ---------------------------------------------------------------------------
// Earnings tab
// ---------------------------------------------------------------------------

const EarningsTab = () => {
  const now = new Date().toISOString();
  const [level, setLevel] = useState<"all" | "year" | "month">("month");
  const [key, setKey] = useState(now.slice(0, 7));
  const [data, setData] = useState<ChartData | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/composer/earnings", { credentials: "include" });
        const d = (await r.json()) as Summary & { error?: string };
        if (r.ok && !d.error) setSum(d);
      } catch {
        // tiles fall back to the chart numbers
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/composer/ledger?view=chart&level=${level}&key=${encodeURIComponent(key)}`, {
          credentials: "include",
        });
        const d = (await r.json()) as ChartData & { error?: string };
        if (!r.ok || d.error) throw new Error(d.error ?? "Failed to load");
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [level, key]);

  // Next money becoming ready: the earliest waiting month.
  const nextReady = useMemo(() => {
    const held = (sum?.months ?? []).filter((m) => m.state === "held").sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : 1));
    if (!held.length) return null;
    const date = held[0].releaseDate;
    return { date, amount: held.filter((m) => m.releaseDate === date).reduce((a, m) => a + m.amountCents, 0) };
  }, [sum]);

  const label = (k: string) =>
    level === "month" ? String(Number(k.slice(8, 10))) : level === "year" ? monthName(k).slice(0, 3) : k;
  const rowLabel = (k: string) =>
    level === "month"
      ? new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", timeZone: "UTC" })
      : level === "year"
        ? monthName(k)
        : k;

  const drill = (k: string) => {
    if (level === "all") {
      setLevel("year");
      setKey(k);
    } else if (level === "year") {
      setLevel("month");
      setKey(k);
    }
  };

  // Memoised: a new array on every hover would restart the bar animation.
  const chart = useMemo(
    () => (data?.bars ?? []).map((b) => ({ ...b, salesD: b.sales / 100, subsD: b.subscriptions / 100 })),
    [data],
  );
  const tableRows = (data?.bars ?? []).filter((b) => b.sales || b.subscriptions || b.refunds);
  // "You are here": today in a month view, this month in a year view, this year in all time.
  const todayKey = level === "month" ? now.slice(0, 10) : level === "year" ? now.slice(0, 7) : now.slice(0, 4);
  const showToday = chart.length > 1 && chart.some((b) => b.k === todayKey);
  const threshold = money(sum?.policy.thresholdCents ?? 5000);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label={`This month (${monthName(now.slice(0, 7))})`}
          cents={data ? data.thisMonth.amountCents : null}
          hint={data ? `${data.thisMonth.sales} sale${data.thisMonth.sales === 1 ? "" : "s"}` : undefined}
        />
        <Tile
          label="Ready to pay"
          cents={sum ? sum.totals.payableCents : null}
          hint={
            nextReady
              ? `+ ${money(nextReady.amount)} becomes ready on ${shortDate(nextReady.date)}`
              : sum && sum.totals.payableCents > 0 && !sum.totals.payable
                ? `Paid once it reaches ${threshold}`
                : `Paid from ${threshold}`
          }
        />
        <Tile
          label="Earned all time"
          cents={data ? data.lifetimeCents : null}
          hint={data ? `Paid out ${money(data.paidOutCents)}` : undefined}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-1.5 font-body text-sm">
          {(["all", "year", "month"] as const).map((lv) => {
            if (lv === "year" && level === "all") return null;
            if (lv === "month" && level !== "month") return null;
            const text = lv === "all" ? "All time" : lv === "year" ? key.slice(0, 4) : monthName(key);
            const current = lv === level;
            return (
              <span key={lv} className="inline-flex items-center gap-1.5">
                {lv !== "all" && <span className="text-muted-foreground/50">/</span>}
                <button
                  type="button"
                  disabled={current}
                  onClick={() => {
                    setLevel(lv);
                    if (lv === "year") setKey(key.slice(0, 4));
                    if (lv === "all") setKey("");
                  }}
                  className={current ? "font-semibold text-foreground" : "text-[#F4C430] hover:underline"}
                >
                  {text}
                </button>
              </span>
            );
          })}
          <span className="ml-auto font-body text-xs text-muted-foreground">
            Total{" "}
            <span className="font-semibold text-foreground">
              {data ? <CountUp cents={data.total} format={money} /> : "—"}
            </span>
          </span>
        </div>

        {error && <p className="mt-4 font-body text-sm text-red-400">{error}</p>}

        <div className="mt-4 h-60" onMouseLeave={() => setHover(null)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chart}
              margin={{ top: 16, right: 4, bottom: 0, left: -14 }}
              barCategoryGap={level === "month" ? "22%" : "30%"}
              onMouseMove={(s: { activeTooltipIndex?: number }) =>
                setHover(typeof s?.activeTooltipIndex === "number" ? s.activeTooltipIndex : null)
              }
              onClick={(s: { activeLabel?: string | number }) => {
                if (s?.activeLabel != null) drill(String(s.activeLabel));
              }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="k"
                tickFormatter={label}
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                interval={level === "month" ? "preserveStartEnd" : 0}
                minTickGap={8}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const b = payload[0].payload as (typeof chart)[number];
                  const total = b.sales + b.subscriptions + b.refunds;
                  return (
                    <div className="min-w-[190px] rounded-xl border border-white/10 bg-[#17181c] p-3 font-body text-xs shadow-2xl">
                      <p className="text-muted-foreground">{rowLabel(b.k)}</p>
                      <p className="mt-0.5 text-base font-semibold text-foreground">Total: {money(total)}</p>
                      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                        <p className="flex justify-between gap-4">
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ background: GOLD }} />
                            Sales ({b.salesCount})
                          </span>
                          <span className="font-semibold text-foreground">{money(b.sales)}</span>
                        </p>
                        <p className="flex justify-between gap-4">
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ background: GOLD_DIM }} />
                            Subscriptions
                          </span>
                          <span className="font-semibold text-foreground">{money(b.subscriptions)}</span>
                        </p>
                        {b.refunds !== 0 && (
                          <p className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Refunds</span>
                            <span className="font-semibold text-red-400">{money(b.refunds)}</span>
                          </p>
                        )}
                      </div>
                      {level !== "month" && <p className="mt-2 text-[10px] text-muted-foreground/70">Click to open</p>}
                    </div>
                  );
                }}
              />
              {showToday && (
                <ReferenceLine
                  x={todayKey}
                  stroke="rgba(244,196,48,0.45)"
                  strokeDasharray="3 3"
                  label={{ value: level === "month" ? "Today" : "Now", position: "top", fill: GOLD, fontSize: 10 }}
                />
              )}
              <Bar
                dataKey="subsD"
                stackId="a"
                name="Subscriptions"
                fill={GOLD_DIM}
                radius={[0, 0, 0, 0]}
                animationDuration={900}
                animationEasing="ease-out"
              >
                {chart.map((_, i) => (
                  <Cell key={i} fillOpacity={hover === null || hover === i ? 1 : 0.55} cursor={level !== "month" ? "pointer" : undefined} />
                ))}
              </Bar>
              <Bar
                dataKey="salesD"
                stackId="a"
                name="Sales"
                fill={GOLD}
                radius={[4, 4, 0, 0]}
                animationDuration={900}
                animationEasing="ease-out"
              >
                {chart.map((_, i) => (
                  <Cell key={i} fillOpacity={hover === null || hover === i ? 1 : 0.55} cursor={level !== "month" ? "pointer" : undefined} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 font-body text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} /> Sales
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GOLD_DIM }} /> Subscriptions
          </span>
        </div>

        <div className="mt-4 divide-y divide-border/40 border-t border-border/60 font-body text-sm">
          {tableRows.length === 0 ? (
            <p className="py-5 text-center text-muted-foreground">No earnings in this period yet.</p>
          ) : (
            <>
              {tableRows.map((b) => (
                <button
                  key={b.k}
                  type="button"
                  onClick={() => drill(b.k)}
                  disabled={level === "month"}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left enabled:hover:text-[#F4C430]"
                >
                  <span className="text-foreground">{rowLabel(b.k)}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.salesCount} sale{b.salesCount === 1 ? "" : "s"}
                    {b.subscriptions ? " + subscriptions" : ""}
                  </span>
                  <span className="ml-auto font-semibold tabular-nums" style={{ color: GOLD }}>
                    {money(b.sales + b.subscriptions + b.refunds)}
                  </span>
                </button>
              ))}
              <div className="flex justify-between py-2.5 font-semibold">
                <span className="text-foreground">Total</span>
                <span className="tabular-nums text-foreground">{money(data?.total ?? 0)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Statement tab
// ---------------------------------------------------------------------------

type EntryType = "sale" | "subscription" | "refund" | "payout" | "tax";
interface Entry {
  date: string;
  type: EntryType;
  title: string;
  detail: string;
  priceCents: number | null;
  amountCents: number;
}
interface StatementData {
  from: string;
  to: string;
  summary: { earnedCents: number; taxCents: number; paidCents: number; balanceCents: number };
  entries: Entry[];
}

const TYPE_LABEL: Record<EntryType, string> = {
  sale: "Sale",
  subscription: "Subscription",
  refund: "Refund",
  payout: "Payout",
  tax: "UK tax",
};

const dayOffset = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const monthRange = (back: number) => {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back + 1, 0));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
  };
};

const StatementTab = () => {
  const today = new Date().toISOString().slice(0, 10);
  const presets = [
    { id: "30d", label: "Last 30 days", from: dayOffset(29), to: today },
    ...[0, 1, 2].map((b) => ({ id: `m${b}`, ...monthRange(b) })),
    { id: "all", label: "All", from: "", to: today },
  ];
  const [preset, setPreset] = useState("30d");
  const [range, setRange] = useState({ from: presets[0].from, to: today });
  const [custom, setCustom] = useState({ from: dayOffset(29), to: today });
  const [type, setType] = useState<"all" | EntryType>("all");
  const [data, setData] = useState<StatementData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = (fmt?: string) =>
    `/api/composer/ledger?view=statement${range.from ? `&from=${range.from}` : ""}&to=${range.to}&type=${type}${fmt ? `&format=${fmt}` : ""}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(query(), { credentials: "include" });
        const d = (await r.json()) as StatementData & { error?: string };
        if (!r.ok || d.error) throw new Error(d.error ?? "Failed to load");
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, type]);

  const chip = (on: boolean) =>
    `rounded-lg border px-3 py-1.5 font-body text-xs transition-colors ${
      on ? "border-[#F4C430] text-[#F4C430]" : "border-border text-muted-foreground hover:text-foreground"
    }`;
  const dateCls =
    "cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1.5 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none";
  const s = data?.summary;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={chip(preset === p.id)}
              onClick={() => {
                setPreset(p.id);
                setRange({ from: p.from, to: p.to });
              }}
            >
              {p.label}
            </button>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <span className="font-body text-xs text-muted-foreground">From</span>
          <input
            type="date"
            value={custom.from}
            max={custom.to}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            className={dateCls}
          />
          <span className="font-body text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={custom.to}
            min={custom.from}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            className={dateCls}
          />
          <button
            type="button"
            onClick={() => {
              setPreset("custom");
              setRange({ ...custom });
            }}
            className="rounded-lg bg-[#F4C430] px-3 py-1.5 font-body text-xs font-bold text-background hover:bg-[#F4C430]/85"
          >
            Show
          </button>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "all" | EntryType)}
            className="ml-auto rounded-lg border border-border bg-background px-2.5 py-1.5 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
          >
            <option value="all">All types</option>
            <option value="sale">Sales</option>
            <option value="subscription">Subscriptions</option>
            <option value="refund">Refunds</option>
            <option value="payout">Payouts</option>
            <option value="tax">UK tax</option>
          </select>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              k: "Earned",
              v: s ? <CountUp cents={s.earnedCents} format={(c) => `${c > 0 ? "+" : ""}${money(c)}`} /> : "—",
              c: "text-emerald-400",
            },
            { k: "UK tax withheld", v: s ? <CountUp cents={s.taxCents} format={money} /> : "—", c: "text-foreground" },
            { k: "Paid to your bank", v: s ? <CountUp cents={s.paidCents} format={money} /> : "—", c: "text-foreground" },
            { k: "Balance at end of period", v: s ? <CountUp cents={s.balanceCents} format={money} /> : "—", c: "" },
          ].map((x, i) => (
            <div key={x.k} className={i > 0 ? "sm:border-l sm:border-border/60 sm:pl-4" : ""}>
              <p className="font-body text-xs text-muted-foreground">{x.k}</p>
              <p className={`mt-1 font-body text-xl font-semibold tabular-nums ${x.c}`} style={i === 3 ? { color: GOLD } : undefined}>
                {x.v}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        {error && <p className="font-body text-sm text-red-400">{error}</p>}
        <div className="hidden grid-cols-[7rem_7rem_1fr_5rem_6rem] gap-3 border-b border-border/60 pb-2 font-body text-xs text-muted-foreground sm:grid">
          <span>Date</span>
          <span>Type</span>
          <span>Detail</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
        </div>
        {data && data.entries.length === 0 && (
          <p className="py-6 text-center font-body text-sm text-muted-foreground">Nothing in this period.</p>
        )}
        <div className="divide-y divide-border/40">
          {data?.entries.map((e, i) => (
            <div
              key={`${e.date}-${e.type}-${i}`}
              className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-3 font-body text-sm sm:grid-cols-[7rem_7rem_1fr_5rem_6rem] sm:items-start"
            >
              <span className="order-2 text-xs text-muted-foreground sm:order-none sm:text-sm sm:text-foreground/85">
                {shortDate(e.date)}
              </span>
              <span className="hidden sm:block">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    e.type === "payout"
                      ? "border-emerald-400/40 text-emerald-400"
                      : e.type === "tax" || e.type === "refund"
                        ? "border-red-400/40 text-red-400"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {TYPE_LABEL[e.type]}
                </span>
              </span>
              <span className="order-1 min-w-0 sm:order-none">
                <span className="block truncate text-foreground">{e.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  <span className="sm:hidden">{TYPE_LABEL[e.type]} · </span>
                  {e.detail}
                </span>
              </span>
              <span className="hidden text-right tabular-nums text-foreground/85 sm:block">
                {e.priceCents == null ? "—" : money(e.priceCents)}
              </span>
              <span
                className={`order-1 row-span-2 self-center text-right font-semibold tabular-nums sm:order-none sm:row-span-1 sm:self-auto ${
                  e.amountCents < 0 ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {e.amountCents > 0 ? "+" : ""}
                {money(e.amountCents)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between font-body text-xs text-muted-foreground">
          <span>{data ? `${data.entries.length} entr${data.entries.length === 1 ? "y" : "ies"}` : ""}</span>
          <a href={query("pdf")} className="font-semibold text-[#F4C430] hover:underline">
            Download PDF statement ↓
          </a>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const ComposerEarnings = () => {
  const [tab, setTab] = useState<"earnings" | "statement">("earnings");
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(["earnings", "statement"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 font-body text-sm transition-colors ${
              tab === t
                ? "border-[#F4C430] bg-[#F4C430] font-semibold text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "earnings" ? "Earnings" : "Statement"}
          </button>
        ))}
      </div>
      {tab === "earnings" ? <EarningsTab /> : <StatementTab />}
    </div>
  );
};

export default ComposerEarnings;
