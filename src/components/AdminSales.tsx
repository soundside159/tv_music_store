import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CreditCard, Receipt, Repeat, ShoppingBag } from "lucide-react";
import PeriodTabs, { type PeriodId } from "@/components/PeriodTabs";

// Admin -> Dashboard "Sales": what sold, when, and for which composer.
// Data: /api/admin/sales?period=this_month|last_month|this_year|all
// (functions/api/admin/sales.ts).

const GOLD = "#F4C430";
const GOLD_SOFT = "rgba(244,196,48,0.38)";

interface Totals {
  gross: number;
  net: number;
  sales: number;
  licenseGross: number;
  licenseCount: number;
  subscriptionGross: number;
  subscriptionCount: number;
}
interface Sale {
  id: string;
  kind: "license" | "subscription";
  amountCents: number;
  currency: string;
  refunded: boolean;
  at: string;
  trackTitle: string | null;
  trackSlug: string | null;
  composer: string | null;
  composerSlug: string | null;
  tier: string | null;
  plan: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
}
interface Data {
  period: { id: PeriodId; label: string };
  bucket: "day" | "month";
  currency: string;
  totals: Totals;
  previous: Totals | null;
  split: { composers: number; store: number; splitting: number };
  activeSubs: { total: number; pro: number; max: number };
  series: { k: string; license: number; subscription: number; sales: number }[];
  byComposer: { name: string; slug: string | null; n: number; gross: number }[];
  recent: Sale[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const delta = (cur: number, prev: number) => {
  if (prev <= 0) return null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return { text: `${d > 0 ? "+" : ""}${d}%`, up: d >= 0 };
};

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</div>
);

const Tile = ({
  icon: Icon,
  label,
  value,
  sub,
  note,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  sub?: { text: string; up: boolean } | null;
  note?: string;
}) => (
  <Card>
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
    <div className="mt-1 flex items-baseline gap-2">
      <p className="font-body text-3xl font-semibold text-foreground">{value}</p>
      {sub && (
        <span className={`font-body text-xs font-semibold ${sub.up ? "text-emerald-400" : "text-red-400"}`}>
          {sub.text}
        </span>
      )}
    </div>
    {note && <p className="font-body text-[11px] text-muted-foreground">{note}</p>}
  </Card>
);

const AdminSales = () => {
  const [period, setPeriod] = useState<PeriodId>("this_month");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/sales?period=${period}`, { credentials: "include" })
      .then(async (res) => {
        const d = (await res.json()) as Data & { error?: string };
        if (!res.ok) throw new Error(d.error ?? "Failed to load sales");
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const money = useMemo(() => {
    const cur = (data?.currency ?? "usd").toUpperCase();
    let f: Intl.NumberFormat;
    try {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 });
    } catch {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    }
    return (cents: number) => f.format(cents / 100).replace(/\.00$/, "");
  }, [data?.currency]);

  // The server sends every day / month of the period, zero-filled.
  const chart = useMemo(
    () =>
      (data?.series ?? []).map((r) => ({ ...r, license: r.license / 100, subscription: r.subscription / 100 })),
    [data],
  );

  const fmtKey = (k: string) =>
    k.length === 7
      ? new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" })
      : new Date(`${k}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const maxComposer = Math.max(1, ...(data?.byComposer.map((c) => c.gross) ?? [1]));
  const periodLabel = data?.period.label ?? "";
  const prev = data?.previous ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl text-foreground">Sales</h2>
          <p className="font-body text-xs text-muted-foreground">
            What sold, when, and for which composer. Refunds are left out.
          </p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      {error && <p className="font-body text-sm text-red-400">{error}</p>}
      {!error && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              icon={Receipt}
              label={`Revenue · ${periodLabel}`}
              value={money(data.totals.gross)}
              sub={prev ? delta(data.totals.gross, prev.gross) : null}
              note={`${money(data.totals.net)} after tax and fees`}
            />
            <Tile
              icon={ShoppingBag}
              label="Track licenses"
              value={String(data.totals.licenseCount)}
              sub={prev ? delta(data.totals.licenseCount, prev.licenseCount) : null}
              note={money(data.totals.licenseGross)}
            />
            <Tile
              icon={Repeat}
              label="Subscription payments"
              value={String(data.totals.subscriptionCount)}
              sub={prev ? delta(data.totals.subscriptionCount, prev.subscriptionCount) : null}
              note={money(data.totals.subscriptionGross)}
            />
            <Tile
              icon={CreditCard}
              label="Active subscribers"
              value={String(data.activeSubs.total)}
              note={`Pro ${data.activeSubs.pro} · Max ${data.activeSubs.max}`}
            />
          </div>

          {/* Where the net money went this period — the same numbers as Finance. */}
          <Card>
            <div className="grid grid-cols-3 gap-3 font-body">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue (net)</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">{money(data.totals.net)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">TV Music Store</p>
                <p className="text-xl font-semibold tabular-nums" style={{ color: GOLD }}>
                  {money(data.split.store)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Composers</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">{money(data.split.composers)}</p>
              </div>
            </div>
            {data.split.splitting > 0 && (
              <p className="mt-2 font-body text-[11px] text-muted-foreground">
                + {money(data.split.splitting)} from subscriptions still splitting (period not closed yet)
              </p>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h3 className="font-body text-sm font-semibold text-foreground">Revenue</h3>
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -12 }} barCategoryGap="18%">
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="k"
                      tickFormatter={fmtKey}
                      tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      labelFormatter={(v) => fmtKey(String(v))}
                      formatter={(v: number, name: string) => [money(Math.round(v * 100)), name]}
                      contentStyle={{
                        background: "#17181c",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="license" name="Track licenses" stackId="a" fill={GOLD} />
                    <Bar dataKey="subscription" name="Subscriptions" stackId="a" fill={GOLD_SOFT} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex gap-4 font-body text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GOLD }} /> Track licenses
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GOLD_SOFT }} /> Subscriptions
                </span>
              </div>
            </Card>

            <Card>
              <h3 className="font-body text-sm font-semibold text-foreground">Track sales by composer</h3>
              {data.byComposer.length === 0 ? (
                <p className="mt-3 font-body text-xs text-muted-foreground">No track sales in this period.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.byComposer.map((c) => (
                    <li key={`${c.name}-${c.slug ?? ""}`}>
                      <div className="flex items-baseline justify-between gap-3 font-body text-xs">
                        {c.slug ? (
                          <Link to={`/artist/${c.slug}`} className="truncate text-foreground hover:text-[#F4C430]">
                            {c.name}
                          </Link>
                        ) : (
                          <span className="truncate text-foreground">{c.name}</span>
                        )}
                        <span className="shrink-0 text-muted-foreground">
                          {c.n} · <span className="text-foreground">{money(c.gross)}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-white/5">
                        <div
                          className="h-1 rounded-full bg-[#F4C430]"
                          style={{ width: `${Math.max(3, (c.gross / maxComposer) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-body text-sm font-semibold text-foreground">Latest sales</h3>
              <Link to="/admin?section=finance" className="font-body text-xs text-muted-foreground hover:text-[#F4C430]">
                All payments →
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <p className="mt-3 font-body text-xs text-muted-foreground">No sales yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border/60">
                {data.recent.map((s) => (
                  <li
                    key={s.id}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 font-body text-xs sm:grid-cols-[5rem_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                  >
                    <span className="text-muted-foreground">
                      {new Date(s.at.replace(" ", "T") + "Z").toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <div className="min-w-0">
                      {s.kind === "license" ? (
                        <>
                          {s.trackSlug ? (
                            <Link
                              to={`/track/${s.trackSlug}`}
                              className="block truncate font-semibold text-foreground hover:text-[#F4C430]"
                            >
                              {s.trackTitle ?? "Track"}
                            </Link>
                          ) : (
                            <span className="block truncate font-semibold text-foreground">{s.trackTitle ?? "Track"}</span>
                          )}
                          <span className="block truncate text-muted-foreground">
                            {s.tier ? `${cap(s.tier)} license` : "License"}
                            {s.composer ? ` · ${s.composer}` : ""}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block truncate font-semibold text-foreground">
                            Subscription{s.plan && s.plan !== "free" ? ` · ${cap(s.plan)}` : ""}
                          </span>
                          <span className="block truncate text-muted-foreground">Plan payment</span>
                        </>
                      )}
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <span className="block truncate text-foreground">{s.buyerName || "—"}</span>
                      <span className="block truncate text-muted-foreground">{s.buyerEmail ?? ""}</span>
                    </div>
                    <span
                      className={`text-right font-semibold ${s.refunded ? "text-muted-foreground line-through" : "text-[#F4C430]"}`}
                      title={s.refunded ? "Refunded" : undefined}
                    >
                      {money(s.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default AdminSales;
