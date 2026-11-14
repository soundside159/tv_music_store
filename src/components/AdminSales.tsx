import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronRight as Go } from "lucide-react";
import CountUp from "@/components/CountUp";

// Admin -> Dashboard (owner's landing screen).
// Data: /api/admin/sales?period=YYYY-MM|all&all=1 (functions/api/admin/sales.ts)
// Layout (approved mockup): period = a month (popover picker) or All;
// 4 tiles 2x2 + revenue chart; Income (Admin + every composer);
// Needs your attention; every sale of the selected period.

const GOLD = "#F4C430";
// Solid colours only (owner: no see-through bars).
const SUB_COLOR = "#B07D12";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// One colour per composer, stable by list order (same idea as the scanner).
const COMPOSER_COLORS = ["#60A5FA", "#F472B6", "#34D399", "#A78BFA", "#FB923C", "#22D3EE", "#F87171", "#A3E635"];

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
  buyerId?: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
}
interface Money2 {
  earned: number;
  pending: number;
}
interface Data {
  period: { id: string; label: string };
  bucket: "day" | "month";
  currency: string;
  totals: { gross: number; net: number; sales: number };
  activeSubs: { total: number; pro: number; max: number };
  series: { k: string; license: number; subscription: number; sales: number }[];
  recent: Sale[];
  customers: number;
  searches: { q: string; n: number }[];
  newToday: number;
  downloads: number;
  income: { admin: Money2; composers: ({ id: string; name: string; slug: string | null } & Money2)[] };
  attention: {
    claimsWaiting: number;
    tracksInReview: number;
    payoutsDue: { count: number; amount: number };
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const thisMonth = () => new Date().toISOString().slice(0, 7);

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</div>
);

/** Month / day / All switch. The pill opens a picker: year, months, then the
 *  days of the chosen month (pick a month = whole month, pick a day = that day). */
const PeriodPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const now = thisMonth();
  const today = new Date().toISOString().slice(0, 10);
  const isAll = value === "all";
  const shownMonth = isAll ? now : value.slice(0, 7);
  const [view, setView] = useState(shownMonth);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const year = Number(view.slice(0, 4));
  const yearSuffix = (y: string) => (y === now.slice(0, 4) ? "" : ` ${y}`);
  const label =
    !isAll && value.length === 10
      ? `${Number(value.slice(8, 10))} ${MONTHS[Number(value.slice(5, 7)) - 1]}${yearSuffix(value.slice(0, 4))}`
      : `${MONTHS[Number(shownMonth.slice(5, 7)) - 1]}${yearSuffix(shownMonth.slice(0, 4))}`;
  // Days of the viewed month, Monday first.
  const vm = Number(view.slice(5, 7)) - 1;
  const daysIn = new Date(Date.UTC(year, vm + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, vm, 1)).getUTCDay() + 6) % 7;
  const pill = (active: boolean) =>
    `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
      active ? "bg-[#F4C430] text-background" : "text-muted-foreground hover:text-foreground"
    }`;
  const cell = (active: boolean) =>
    `rounded-lg py-1.5 font-body text-xs transition-colors disabled:opacity-30 ${
      active ? "bg-[#F4C430] font-semibold text-background" : "text-foreground hover:bg-white/5"
    }`;
  return (
    <div ref={box} className="relative flex gap-1 rounded-full border border-border/70 bg-card/60 p-1">
      <button
        type="button"
        className={pill(!isAll)}
        onClick={() => {
          if (isAll) onChange(now);
          setView(shownMonth);
          setOpen((o) => !o || isAll);
        }}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={pill(isAll)} onClick={() => { onChange("all"); setOpen(false); }}>
        All
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between font-body text-sm text-foreground">
            <button
              type="button"
              onClick={() => setView(`${year - 1}${view.slice(4)}`)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold">{year}</span>
            <button
              type="button"
              disabled={year >= Number(now.slice(0, 4))}
              onClick={() => setView(`${year + 1}${view.slice(4)}`)}
              className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MONTHS_SHORT.map((m, i) => {
              const key = `${year}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={key > now}
                  onClick={() => {
                    setView(key);
                    onChange(key);
                  }}
                  className={cell(key === value || (key === view && value.startsWith(key)))}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <div className="my-2 h-px bg-border/70" />
          <div className="grid grid-cols-7 gap-1 text-center">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span key={d} className="py-1 font-body text-[10px] uppercase text-muted-foreground">
                {d}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`l${i}`} />
            ))}
            {Array.from({ length: daysIn }, (_, i) => {
              const key = `${view}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={key > today}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  className={cell(key === value)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const AdminSales = ({
  onOpenCustomer,
  onOpenSection,
  unreadMail = 0,
}: {
  onOpenCustomer?: (userId: string) => void;
  onOpenSection?: (id: "claims" | "finance" | "tracks" | "mail") => void;
  unreadMail?: number;
} = {}) => {
  const [period, setPeriod] = useState<string>(thisMonth());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/sales?period=${period}&all=1`, { credentials: "include" })
      .then(async (res) => {
        const d = (await res.json()) as Data & { error?: string };
        if (!res.ok) throw new Error(d.error ?? "Failed to load the dashboard");
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

  const chart = useMemo(
    () => (data?.series ?? []).map((r) => ({ ...r, license: r.license / 100, subscription: r.subscription / 100 })),
    [data],
  );
  const fmtKey = (k: string) =>
    k.length === 7
      ? new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" })
      : String(Number(k.slice(8, 10)));
  const fmtFull = (k: string) =>
    k.length === 7
      ? new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : new Date(`${k}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const nowIso = new Date().toISOString();
  const todayKey = data?.bucket === "month" ? nowIso.slice(0, 7) : nowIso.slice(0, 10);
  const showToday = chart.some((r) => r.k === todayKey) && chart.length > 1;

  // Click a bar or a date under the chart: that day (a month in the All view);
  // click the selected one again to go back to the whole month / All.
  const pick = (k: string) => {
    if (!k || k > new Date().toISOString().slice(0, 10)) return;
    if (k === period) setPeriod(k.length === 10 ? k.slice(0, 7) : "all");
    else setPeriod(k);
  };
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 640);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  // "Customer searches" block: folded by default, remembered.
  const [showSearches, setShowSearches] = useState(() => {
    try {
      return localStorage.getItem("tvms_admin_searches_open") === "1";
    } catch {
      return false;
    }
  });
  const toggleSearches = () => {
    const next = !showSearches;
    setShowSearches(next);
    try {
      localStorage.setItem("tvms_admin_searches_open", next ? "1" : "0");
    } catch {
      /* storage blocked */
    }
  };
  const sales = data?.recent ?? [];
  const attention = data
    ? [
        { id: "claims" as const, label: "Claims waiting release", value: String(data.attention.claimsWaiting), on: data.attention.claimsWaiting > 0 },
        {
          id: "finance" as const,
          label: "Composer payouts due",
          value: data.attention.payoutsDue.count > 0 ? money(data.attention.payoutsDue.amount) : "0",
          on: data.attention.payoutsDue.count > 0,
        },
        { id: "tracks" as const, label: "Tracks waiting review", value: String(data.attention.tracksInReview), on: data.attention.tracksInReview > 0 },
        { id: "mail" as const, label: "Unread support messages", value: String(unreadMail), on: unreadMail > 0 },
      ]
    : [];

  const IncomeRow = ({ dot, name, slug, m }: { dot: string; name: string; slug?: string | null; m: Money2 }) => (
    <li className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-3 py-2.5 font-body text-sm">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
        {slug ? (
          <Link to={`/artist/${slug}`} className="truncate font-semibold hover:underline" style={{ color: dot }}>
            {name}
          </Link>
        ) : (
          <span className="truncate font-semibold" style={{ color: dot }}>
            {name}
          </span>
        )}
      </span>
      <span className="text-right font-semibold tabular-nums text-foreground">{money(m.earned)}</span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">{m.pending > 0 ? `+${money(m.pending)}` : ""}</span>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl text-foreground">Dashboard</h2>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {error && <p className="font-body text-sm text-red-400">{error}</p>}
      {!error && !data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
          <div className="h-[196px] animate-pulse rounded-xl border border-border bg-card" />
        </div>
      )}

      {data && (
        <>
          {/* One thin strip: Revenue | Subscribers | Customers, label and value on one line. */}
          <Card className="grid grid-cols-3 divide-x divide-border/70 p-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 px-4 py-2.5 sm:px-6">
              <span className="whitespace-nowrap font-body text-xs uppercase tracking-wide text-muted-foreground">Revenue</span>
              <span className="font-body text-xl font-semibold tabular-nums" style={{ color: GOLD }}>
                <CountUp cents={data.totals.gross} format={money} />
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 px-4 py-2.5 sm:px-6">
              <span className="whitespace-nowrap font-body text-xs uppercase tracking-wide text-muted-foreground">Subscribers</span>
              <span className="font-body text-xl font-semibold tabular-nums text-foreground">{data.activeSubs.total}</span>
              <span className="whitespace-nowrap font-body text-xs text-muted-foreground">
                Pro {data.activeSubs.pro} · Max {data.activeSubs.max}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 px-4 py-2.5 sm:px-6">
              <span className="whitespace-nowrap font-body text-xs uppercase tracking-wide text-muted-foreground">Customers</span>
              <span className="font-body text-xl font-semibold tabular-nums text-foreground">{data.customers}</span>
              <span className={`whitespace-nowrap font-body text-xs ${data.newToday > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                +{data.newToday} new today
              </span>
            </div>
          </Card>

            <Card className="px-2 pb-1 pt-2 sm:px-3">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chart}
                    margin={{ top: 8, right: 4, bottom: 0, left: -14 }}
                    barCategoryGap="22%"
                    className="cursor-pointer"
                    onClick={(st: { activeLabel?: string | number } | null) =>
                      pick(st?.activeLabel != null ? String(st.activeLabel) : "")
                    }
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="k"
                      tick={(t: { x: number; y: number; payload: { value: string } }) => {
                        const k = String(t.payload.value);
                        const sel = k === period;
                        const future = k > new Date().toISOString().slice(0, 10);
                        return (
                          <text
                            x={t.x}
                            y={t.y + 12}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight={sel ? 700 : 400}
                            fill={sel ? GOLD : "rgba(255,255,255,0.55)"}
                            style={{ cursor: future ? "default" : "pointer" }}
                            onClick={() => pick(k)}
                          >
                            {fmtKey(k)}
                          </text>
                        );
                      }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                      // Every date under the chart (every 2nd on a phone).
                      interval={narrow && chart.length > 16 ? 1 : 0}
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
                      labelFormatter={(v) => fmtFull(String(v))}
                      formatter={(v: number, name: string) => [money(Math.round(v * 100)), name]}
                      contentStyle={{
                        background: "#17181c",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    {showToday && todayKey !== period && (
                      <ReferenceLine x={todayKey} stroke="rgba(244,196,48,0.45)" strokeDasharray="3 3" />
                    )}
                    {period.length === 10 && <ReferenceLine x={period} stroke={GOLD} strokeWidth={1.5} />}
                    <Bar dataKey="license" name="Licenses" stackId="a" fill={GOLD} radius={[4, 4, 0, 0]} animationDuration={900} />
                    <Bar dataKey="subscription" name="Subscriptions" stackId="a" fill={SUB_COLOR} radius={[4, 4, 0, 0]} animationDuration={900} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="font-body text-sm font-semibold text-foreground">Income</h3>
              <ul className="mt-1">
                <IncomeRow dot="#FFFFFF" name="Admin" m={data.income.admin} />
              </ul>
              <div className="my-1 h-px bg-border/70" />
              {data.income.composers.length === 0 ? (
                <p className="py-2.5 font-body text-xs text-muted-foreground">No composers yet.</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {data.income.composers.map((c, i) => (
                    <IncomeRow key={c.id} dot={COMPOSER_COLORS[i % COMPOSER_COLORS.length]} name={c.name} slug={c.slug} m={c} />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h3 className="font-body text-sm font-semibold text-foreground">Needs your attention</h3>
              <ul className="mt-1 divide-y divide-border/40">
                {attention.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onOpenSection?.(a.id)}
                      className="group flex w-full items-center justify-between gap-3 py-2.5 text-left font-body text-sm"
                    >
                      <span className={`whitespace-nowrap ${a.on ? "text-foreground" : "text-muted-foreground"}`}>{a.label}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className={`font-semibold tabular-nums ${a.on ? "text-[#F4C430]" : "text-muted-foreground"}`}>{a.value}</span>
                        <Go className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card>
            <h3 className="font-body text-sm font-semibold text-foreground">
              Sales <span className="font-normal text-muted-foreground">· {sales.length}</span>
            </h3>
            {sales.length === 0 ? (
              <p className="mt-3 font-body text-xs text-muted-foreground">No sales {period.length === 10 ? "on" : "in"} {data.period.label}.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border/60">
                {sales.map((s) => (
                  <li
                    key={s.id}
                    className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 font-body text-xs sm:grid-cols-[4.5rem_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                  >
                    <span className="whitespace-nowrap text-muted-foreground">
                      {new Date(s.at.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    <div className="min-w-0">
                      {s.kind === "license" ? (
                        <>
                          {s.trackSlug ? (
                            <Link to={`/track/${s.trackSlug}`} className="block truncate font-semibold text-foreground hover:text-[#F4C430]">
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
                      {s.buyerId && onOpenCustomer ? (
                        <button
                          type="button"
                          onClick={() => onOpenCustomer(s.buyerId!)}
                          title="Open customer profile"
                          className="block max-w-full truncate text-left text-muted-foreground underline-offset-2 hover:text-[#F4C430] hover:underline"
                        >
                          {s.buyerEmail ?? "Customer"}
                        </button>
                      ) : (
                        <span className="block truncate text-muted-foreground">{s.buyerEmail ?? ""}</span>
                      )}
                    </div>
                    <span
                      className={`text-right font-semibold tabular-nums ${s.refunded ? "text-red-400" : "text-[#F4C430]"}`}
                      title={s.refunded ? "Refunded" : undefined}
                    >
                      {s.refunded ? `-${money(s.amountCents)}` : money(s.amountCents)}
                      {s.refunded && <span className="block text-[10px] font-normal">Refunded</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={toggleSearches}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 text-left font-body text-sm font-semibold text-foreground transition-colors hover:border-[#F4C430]/60"
            >
              <span>
                Customer searches <span className="font-normal text-muted-foreground">· {data.searches.length}</span>
              </span>
              <span className="whitespace-nowrap text-xs font-normal text-muted-foreground">{showSearches ? "Hide" : "Show"}</span>
            </button>
            {showSearches && (
              <Card className="py-3">
                {data.searches.length === 0 ? (
                  <p className="font-body text-xs text-muted-foreground">Nobody searched {period.length === 10 ? "on" : "in"} {data.period.label}.</p>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {data.searches.map((x) => (
                      <li key={x.q} className="flex items-center justify-between gap-3 py-2 font-body text-sm">
                        <span className="min-w-0 truncate text-foreground">{x.q}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{x.n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminSales;
