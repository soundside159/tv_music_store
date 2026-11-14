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
import { MonitorSmartphone } from "lucide-react";
import { PeriodPicker } from "@/components/AdminSales";

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
  from?: string;
  to?: string;
  label?: string;
  series: { day: string; views: number; visitors: number }[];
  totals: { views: number; visitors: number };
  previous: { views: number; visitors: number };
  online: number;
  pages: TopRow[];
  referrers: TopRow[];
  countries: TopRow[];
  devices: TopRow[];
  browsers: TopRow[];
  funnel?: { key: string; label: string; n: number }[];
  sources?: { k: string; visitors: number; actions: number; paid: number }[];
  sourcePages?: { k: string; visitors: number }[];
}

/** Link tags used in posts ("?s=yt") -> readable platform names. */
const SOURCE_NAMES: Record<string, string> = {
  yt: "YouTube",
  yts: "YouTube Shorts",
  ig: "Instagram",
  tt: "TikTok",
  fb: "Facebook",
  x: "X / Twitter",
  rd: "Reddit",
  pin: "Pinterest",
  mail: "Email",
};
const sourceName = (tag: string) => {
  const head = tag.split("-")[0];
  const base = SOURCE_NAMES[tag] ?? SOURCE_NAMES[head];
  if (!base) return tag;
  return tag === head ? base : `${base} · ${tag.slice(head.length + 1)}`;
};

/** Step-by-step: how many visitors reached each step and where they dropped off. */
const FunnelCard = ({ steps }: { steps: { key: string; label: string; n: number }[] }) => {
  const top = Math.max(1, steps[0]?.n ?? 1);
  return (
    <Card>
      <h3 className="font-body text-sm font-semibold text-foreground">Where visitors drop off</h3>
      <p className="font-body text-[11px] text-muted-foreground">
        Unique visitors who reached each step. The red number is how many left before the next one.
      </p>
      <ul className="mt-4 space-y-3">
        {steps.map((st, i) => {
          const prev = i > 0 ? steps[i - 1].n : 0;
          const pct = i > 0 && prev > 0 ? Math.round((st.n / prev) * 100) : null;
          const lost = i > 0 ? Math.max(0, prev - st.n) : 0;
          return (
            <li key={st.key}>
              <div className="flex items-baseline justify-between gap-3 font-body text-xs">
                <span className="text-foreground">{st.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {pct !== null && <span className="mr-2">{pct}% of previous</span>}
                  {lost > 0 && <span className="mr-2 text-red-400">-{lost}</span>}
                  <span className="font-semibold text-foreground">{st.n}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/5">
                <div
                  className="h-1.5 rounded-full bg-[#F4C430]"
                  style={{ width: `${st.n > 0 ? Math.max(2, (st.n / top) * 100) : 0}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

/** Visitors brought by tagged links (?s=yt etc.) and what they did next. */
const SourcesCard = ({
  rows,
  pages,
}: {
  rows: { k: string; visitors: number; actions: number; paid: number }[];
  pages: { k: string; visitors: number }[];
}) => (
  <Card>
    <h3 className="font-body text-sm font-semibold text-foreground">Your links</h3>
    <p className="font-body text-[11px] text-muted-foreground">
      Visits from links with a tag, e.g. tvmusicstore.com/track/2575?s=yt
    </p>
    {rows.length === 0 ? (
      <p className="mt-4 font-body text-xs text-muted-foreground">
        No tagged visits yet. Add ?s=yt, ?s=yts, ?s=ig or ?s=tt to the links in your posts.
      </p>
    ) : (
      <>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 gap-y-2 font-body text-xs">
          <span className="text-muted-foreground">Source</span>
          <span className="text-right text-muted-foreground">Visitors</span>
          <span className="text-right text-muted-foreground">Acted</span>
          <span className="text-right text-muted-foreground">Paid</span>
          {rows.map((r) => (
            <div key={r.k} className="contents">
              <span className="truncate text-foreground">{sourceName(r.k)}</span>
              <span className="text-right text-foreground">{r.visitors}</span>
              <span className="text-right text-muted-foreground">{r.actions}</span>
              <span className={`text-right ${r.paid > 0 ? "font-semibold text-[#F4C430]" : "text-muted-foreground"}`}>
                {r.paid}
              </span>
            </div>
          ))}
        </div>
        {pages.length > 0 && (
          <>
            <p className="mt-5 font-body text-[11px] uppercase tracking-wide text-muted-foreground">Landing pages</p>
            <ul className="mt-2 space-y-1.5 font-body text-xs">
              {pages.map((p) => {
                const [tag, ...rest] = p.k.split(" ");
                const path = rest.join(" ");
                return (
                  <li key={p.k} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="text-[#F4C430]">{sourceName(tag)}</span>
                      <span className="text-muted-foreground"> → {path}</span>
                    </span>
                    <span className="shrink-0 text-foreground">{p.visitors}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </>
    )}
  </Card>
);

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
  <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>{children}</div>
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
  // "7" | "30" | "90" = rolling days; "YYYY-MM" / "YYYY-MM-DD" / "all" = picker.
  const [range, setRange] = useState<string>("30");
  const rolling = /^\d{1,2}$/.test(range);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/admin/analytics?${rolling ? `days=${range}` : `period=${range}`}`, { credentials: "include" })
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
  }, [range]);

  // The chart wants EVERY day on the axis — fill the gaps with zeroes so a
  // quiet Tuesday shows as a dip, not as a missing point.
  const chart = useMemo(() => {
    if (!data) return [];
    const byDay = new Map(data.series.map((s) => [s.day, s]));
    const out: { day: string; views: number; visitors: number }[] = [];
    // Every day of the window up to today (a month in progress stops today).
    const today = new Date().toISOString().slice(0, 10);
    const start = data.from ?? (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (data.days - 1));
      return d.toISOString().slice(0, 10);
    })();
    const d = new Date(`${start}T00:00:00Z`);
    for (let guard = 0; guard < 400; guard++) {
      const key = d.toISOString().slice(0, 10);
      if (key > today || (data.to && key >= data.to)) break;
      out.push(byDay.get(key) ?? { day: key, views: 0, visitors: 0 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }, [data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl text-foreground">Analytics</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border border-border/70 bg-card/60 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(String(r))}
                className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
                  range === String(r) ? "bg-[#F4C430] text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <PeriodPicker value={range} onChange={setRange} />
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-400">{error}</p>}
      {!error && !data && <p className="font-body text-sm text-muted-foreground">Loading analytics…</p>}

      {data && (
        <>
          {/* One thin strip, same as the Dashboard. */}
          <div className="grid grid-cols-2 divide-border/70 rounded-xl border border-border bg-card sm:grid-cols-4 sm:divide-x">
            {(
              [
                ["Visitors", data.totals.visitors, delta(data.totals.visitors, data.previous.visitors)],
                ["Pageviews", data.totals.views, delta(data.totals.views, data.previous.views)],
                ["Countries", data.countries.length, null],
              ] as [string, number, { text: string; up: boolean } | null][]
            ).map(([label, value, d]) => (
              <div key={label} className="flex min-w-0 flex-wrap items-baseline gap-x-3 px-4 py-2.5 sm:px-6">
                <span className="whitespace-nowrap font-body text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
                <span className="font-body text-xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</span>
                {d && (
                  <span className={`whitespace-nowrap font-body text-xs font-semibold ${d.up ? "text-emerald-400" : "text-red-400"}`}>
                    {d.text}
                  </span>
                )}
              </div>
            ))}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 px-4 py-2.5 sm:px-6" title="Unique visitors in the last 30 minutes">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="whitespace-nowrap font-body text-xs uppercase tracking-wide text-muted-foreground">Online now</span>
              <span className="font-body text-xl font-semibold tabular-nums text-foreground">{data.online}</span>
            </div>
          </div>

          <Card className="px-2 pb-1 pt-2 sm:px-3">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
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
                  <Area type="monotone" dataKey="visitors" name="Unique visitors" stroke={BLUE} fill="url(#gVisitors)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.funnel && <FunnelCard steps={data.funnel} />}
            <SourcesCard rows={data.sources ?? []} pages={data.sourcePages ?? []} />
          </div>

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
