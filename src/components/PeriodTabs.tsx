// Period switch shared by Dashboard (Sales) and Finance:
// This month / Last month / This year / All time (functions/api/_period.ts).

export type PeriodId = "this_month" | "last_month" | "this_year" | "all";

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_year", label: "This year" },
  { id: "all", label: "All time" },
];

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
