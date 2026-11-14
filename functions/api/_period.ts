// Shared reporting periods for the admin Dashboard (Sales) and Finance pages.
//
//   ?period=this_month | last_month | this_year | all
//
// Every range is [from, to) on calendar days (YYYY-MM-DD, UTC), matched
// against revenue_events.created_at = the day the money ARRIVED. `prev` is the
// same-length range just before it (for the +/- % on the dashboard); "all"
// has none. `bucket` tells the chart whether to group by day or by month.

export type PeriodId = "this_month" | "last_month" | "this_year" | "all" | `${number}-${number}` | `${number}-${number}-${number}`;

export interface Period {
  id: PeriodId;
  label: string;
  from: string;
  /** Exclusive end; null = open (all time). */
  to: string | null;
  prev: { from: string; to: string } | null;
  bucket: "day" | "month";
  /** Chart range when it differs from the period (a single day shows its whole month). */
  chart?: { from: string; to: string };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Month name for a month offset from y/m (handles year wrap), e.g. "October". */
const monthName = (y: number, m: number) => MONTHS[new Date(Date.UTC(y, m, 1)).getUTCMonth()];
const monthStart = (y: number, m: number) => day(new Date(Date.UTC(y, m, 1)));

export const resolvePeriod = (raw: string | null): Period => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // One day: ?period=2026-11-13 (Dashboard day picker / chart bar click).
  const dd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw ?? "");
  if (dd) {
    const d0 = new Date(Date.UTC(Number(dd[1]), Number(dd[2]) - 1, Number(dd[3])));
    if (!Number.isNaN(d0.getTime())) {
      const next = new Date(d0.getTime() + 86400000);
      const prevDay = new Date(d0.getTime() - 86400000);
      const py = d0.getUTCFullYear();
      const pm = d0.getUTCMonth();
      return {
        id: raw as PeriodId,
        label: `${d0.getUTCDate()} ${MONTHS[pm]}${py === y ? "" : ` ${py}`}`,
        from: day(d0),
        to: day(next),
        prev: { from: day(prevDay), to: day(d0) },
        bucket: "day",
        chart: { from: monthStart(py, pm), to: monthStart(py, pm + 1) },
      };
    }
  }
  // Any calendar month: ?period=2026-09 (Dashboard month picker).
  const mm = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (mm) {
    const py = Number(mm[1]);
    const pm = Number(mm[2]) - 1;
    if (pm >= 0 && pm < 12 && py > 2000) {
      return {
        id: raw as PeriodId,
        label: `${MONTHS[pm]}${py === y ? "" : ` ${py}`}`,
        from: monthStart(py, pm),
        to: monthStart(py, pm + 1),
        prev: { from: monthStart(py, pm - 1), to: monthStart(py, pm) },
        bucket: "day",
      };
    }
  }
  switch (raw) {
    case "last_month":
      return {
        id: "last_month",
        label: monthName(y, m - 1),
        from: monthStart(y, m - 1),
        to: monthStart(y, m),
        prev: { from: monthStart(y, m - 2), to: monthStart(y, m - 1) },
        bucket: "day",
      };
    case "this_year":
      return {
        id: "this_year",
        label: String(y),
        from: monthStart(y, 0),
        to: monthStart(y + 1, 0),
        prev: { from: monthStart(y - 1, 0), to: monthStart(y, 0) },
        bucket: "month",
      };
    case "all":
      return { id: "all", label: "All time", from: "0000-01-01", to: null, prev: null, bucket: "month" };
    default:
      return {
        id: "this_month",
        label: monthName(y, m),
        from: monthStart(y, m),
        to: monthStart(y, m + 1),
        prev: { from: monthStart(y, m - 1), to: monthStart(y, m) },
        bucket: "day",
      };
  }
};

/** SQL fragment: `<col>` (an ISO timestamp) falls inside [?a, ?b) — b may be NULL. */
export const inRange = (col: string, a: number, b: number) =>
  `substr(${col},1,10) >= ?${a} AND (?${b} IS NULL OR substr(${col},1,10) < ?${b})`;

/** Every chart key (YYYY-MM-DD or YYYY-MM) of the WHOLE period — all days of
 *  the month, all months of the year (owner: show the full month with a
 *  "today" marker, like the composer Earnings chart). "All time" runs from
 *  the first data month to now. */
export const axisKeys = (p: Period, firstData: string | null): string[] => {
  const today = day(new Date());
  const keys: string[] = [];
  if (p.bucket === "day") {
    const d = new Date(`${p.from}T00:00:00Z`);
    const end = p.to ?? today;
    while (day(d) < end) {
      keys.push(day(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else {
    const startStr = p.id === "all" ? (firstData ?? today).slice(0, 7) : p.from.slice(0, 7);
    const lastMonth = p.to ? day(new Date(new Date(`${p.to}T00:00:00Z`).getTime() - 86400000)).slice(0, 7) : today.slice(0, 7);
    const d = new Date(`${startStr}-01T00:00:00Z`);
    while (day(d).slice(0, 7) <= lastMonth) {
      keys.push(day(d).slice(0, 7));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }
  return keys;
};
