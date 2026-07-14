import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Globe2, MonitorSmartphone, MousePointerClick, Users } from "lucide-react";

// Admin -> Analytics: the self-hosted, cookie-less visitor stats.
// Data comes from /api/admin/analytics in one call (see functions/api/admin/
// analytics.ts); collection happens in functions/api/hit.ts. Bots, admins and
// the /admin//account//login pages are never counted.

const GOLD = "#F4C430";
const BLUE = "#5BA8FF";

interface TopRow {
  k: string;
  views: number;
  visitors: number;
}
interface Data {
  days: number;
  series: { day: string; views: number; visitors: number }[];
  totals: { views: number; visitors: number };
  previous: { views: number; visitors: number };
  online: number;
  pages: TopRow[];
  referrers: TopRow[];
  countries: TopRow[];
  devices: TopRow[];
  browsers: TopRow[];
}

const RANGES = [7, 30, 90] as const;

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "US" -> flag emoji + English name (both derived, nothing hardcoded). */
const countryLabel = (code: string) => {
  if (!/^[A-Z]{2}$/i.test(code)) return code || "Unknown";
  const cc = code.toUpperCase();
  const flag = String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  let name = cc;
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc;
  } catch {
    // very old browser — the code alone is fine
  }
  return `${flag} ${name}`;
};

/** +18% / −4% vs the previous window; "—" when there is nothing to compare. */
const delta = (cur: number, prev: number) => {
  if (prev <= 0) return null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return { text: `${d > 0 ? "+" : ""}${d}%`, up: d >= 0 };
};

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</div>
);

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: { text: string; up: boolean } | null;
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
  </Card>
);

/** One "top …" list: label, thin share bar, views count. */
const TopList = ({ title, rows, label }: { title: string; rows: TopRow[]; label?: (k: string) => string }) => {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <Card>
      <h3 className="font-body text-sm font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 font-body text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.k || "—"}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-body text-xs text-foreground/90">
                  {label ? label(r.k) : r.k || "—"}
                </span>
                <span className="shrink-0 font-body text-xs tabular-nums text-muted-foreground">
                  {r.views.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-foreground/[0.06]">
                <div
                  className="h-1 rounded-full"
                  style={{ width: `${(r.views / max) * 100}%`, backgroundColor: GOLD, opacity: 0.8 }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const AdminAnalytics = () => {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/admin/analytics?days=${days}`, { credentials: "include" })
      .then(async (res) => {
        const d = (await res.json()) as Data & { error?: string };
        if (!res.ok) throw new Error(d.error ?? "Failed to load analytics");
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  // The chart wants EVERY day on the axis — fill the gaps with zeroes so a
  // quiet Tuesday shows as a dip, not as a missing point.
  const chart = useMemo(() => {
    if (!data) return [];
    const byDay = new Map(data.series.map((s) => [s.day, s]));
    const out: { day: string; views: number; visitors: number }[] = [];
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push(byDay.get(key) ?? { day: key, views: 0, visitors: 0 });
    }
    return out;
  }, [data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl text-foreground">Analytics</h1>
          <p className="font-body text-xs text-muted-foreground">
            Own cookie-less stats — bots and your admin visits are not counted.
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-border/70 bg-card/60 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
                days === r ? "bg-[#F4C430] text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-400">{error}</p>}
      {!error && !data && <p className="font-body text-sm text-muted-foreground">Loading analytics…</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label={`Visitors · ${data.days}d`}
              value={data.totals.visitors.toLocaleString()}
              sub={delta(data.totals.visitors, data.previous.visitors)}
            />
            <StatCard
              icon={MousePointerClick}
              label={`Pageviews · ${data.days}d`}
              value={data.totals.views.toLocaleString()}
              sub={delta(data.totals.views, data.previous.views)}
            />
            <StatCard icon={Globe2} label="Countries" value={String(data.countries.length)} />
            <Card>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">Online now</p>
              </div>
              <p className="mt-1 font-body text-3xl font-semibold text-foreground">{data.online}</p>
              <p className="font-body text-[10px] text-muted-foreground">unique visitors, last 30 min</p>
            </Card>
          </div>

          <Card>
            <h3 className="font-body text-sm font-semibold text-foreground">Traffic</h3>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BLUE} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={fmtDay}
                    tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    labelFormatter={(v) => fmtDay(String(v))}
                    contentStyle={{
                      background: "#17181c",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="views" name="Pageviews" stroke={GOLD} fill="url(#gViews)" strokeWidth={2} />
                  <Area type="monotone" dataKey="visitors" name="Visitors" stroke={BLUE} fill="url(#gVisitors)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex gap-4 font-body text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GOLD }} /> Pageviews
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BLUE }} /> Unique visitors
              </span>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <TopList title="Top pages" rows={data.pages} />
            <TopList title="Referrers" rows={data.referrers.length ? data.referrers : []} label={(k) => k || "Direct"} />
            <TopList title="Countries" rows={data.countries} label={countryLabel} />
            <div className="grid gap-4">
              <TopList title="Devices" rows={data.devices} label={(k) => k.charAt(0).toUpperCase() + k.slice(1)} />
              <TopList title="Browsers" rows={data.browsers} />
            </div>
          </div>
          <p className="flex items-center gap-1.5 font-body text-[11px] text-muted-foreground">
            <MonitorSmartphone className="h-3.5 w-3.5" />
            Collected on your own Cloudflare edge — no cookies, no Google, raw IPs never stored; visitor identity
            resets every midnight. Data kept for 180 days.
          </p>
        </>
      )}
    </div>
  );
};

export default AdminAnalytics;
