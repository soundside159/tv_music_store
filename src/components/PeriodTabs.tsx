// Period switch shared by Dashboard (Sales) and Finance:
// This month / Last month / This year / All time (functions/api/_period.ts).

export type PeriodId = "this_month" | "last_month" | "this_year" | "all";

// Labels are the real names ("November", "October", "2026") — "Last month"
// read like "the last 30 days" (owner), but it is the previous calendar month.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const now = () => new Date();
export const periodLabel = (id: PeriodId): string => {
  const d = now();
  if (id === "this_month") return MONTHS[d.getUTCMonth()];
  if (id === "last_month") return MONTHS[(d.getUTCMonth() + 11) % 12];
  if (id === "this_year") return String(d.getUTCFullYear());
  return "All time";
};
export const PERIODS: { id: PeriodId; label: string }[] = (["this_month", "last_month", "this_year", "all"] as PeriodId[]).map(
  (id) => ({ id, label: periodLabel(id) }),
);

const PeriodTabs = ({ value, onChange }: { value: PeriodId; onChange: (p: PeriodId) => void }) => (
  <div className="flex flex-wrap gap-1 rounded-full border border-border/70 bg-card/60 p-1">
    {PERIODS.map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => onChange(p.id)}
        className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
          value === p.id ? "bg-[#F4C430] text-background" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {p.label}
      </button>
    ))}
  </div>
);

export default PeriodTabs;
