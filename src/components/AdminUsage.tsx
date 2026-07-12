import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// Admin → Usage. "Do I need to top anything up?" — answered without opening
// three provider dashboards.
//
// HONEST BY DESIGN: none of these providers exposes a "credits left" endpoint we
// can call, so the site counts what IT spends (every email, every YouTube
// lookup, every AI generation) and shows it against the limits you enter below.
// Their dashboards remain the source of truth for the bill; this is the warning
// light, not the fuel gauge.

const GOLD = "#F4C430";

interface Bucket {
  units: number;
  costCents: number;
}

interface Report {
  today: Record<"resend" | "youtube" | "openai", Bucket>;
  month: Record<"resend" | "youtube" | "openai", Bucket>;
  limits: { resendMonthly: number; youtubeDaily: number; openaiMonthlyCents: number };
  configured: { resend: boolean; youtube: boolean; openai: boolean };
}

const pct = (used: number, limit: number) =>
  limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

const Meter = ({
  title,
  subtitle,
  used,
  limit,
  unit,
  configured,
  danger,
}: {
  title: string;
  subtitle: string;
  used: string;
  limit: string;
  unit: number;
  configured: boolean;
  danger: boolean;
}) => (
  <div className="rounded-xl border border-border bg-card p-5">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="font-body text-sm font-semibold text-foreground">{title}</h3>
      {!configured && (
        <span className="rounded-full border border-border px-2 py-0.5 font-body text-[10px] uppercase tracking-wide text-muted-foreground">
          not configured
        </span>
      )}
    </div>
    <p className="mt-1 font-body text-xs text-muted-foreground">{subtitle}</p>

    <p className="mt-4 font-body text-2xl font-semibold tabular-nums" style={{ color: GOLD }}>
      {used}
      <span className="ml-1 font-body text-sm font-normal text-muted-foreground">/ {limit}</span>
    </p>

    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${unit}%`,
          backgroundColor: danger ? "#f87171" : GOLD,
        }}
      />
    </div>
    {danger && (
      <p className="mt-2 font-body text-xs text-red-400">
        Running out — top up or raise the limit.
      </p>
    )}
  </div>
);

const AdminUsage = () => {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usage", { credentials: "include" });
      const data = (await res.json()) as Report & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load");
      setReport(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveLimits = async (next: Report["limits"]) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/usage", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      await load();
      toast.success("Limits saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!report) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border border-border/40 bg-card/40" />
        ))}
      </div>
    );
  }

  const { limits } = report;
  const emails = report.month.resend.units;
  const ytToday = report.today.youtube.units;
  const aiCents = report.month.openai.costCents;

  const emailPct = pct(emails, limits.resendMonthly);
  const ytPct = pct(ytToday, limits.youtubeDaily);
  const aiPct = pct(aiCents, limits.openaiMonthlyCents);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Meter
          title="Emails (Resend)"
          subtitle="This month · 1 unit per email sent"
          used={emails.toLocaleString("en-US")}
          limit={limits.resendMonthly.toLocaleString("en-US")}
          unit={emailPct}
          configured={report.configured.resend}
          danger={emailPct >= 85}
        />
        <Meter
          title="YouTube API"
          subtitle="Today · Google resets the quota every midnight PT"
          used={ytToday.toLocaleString("en-US")}
          limit={limits.youtubeDaily.toLocaleString("en-US")}
          unit={ytPct}
          configured={report.configured.youtube}
          danger={ytPct >= 85}
        />
        <Meter
          title="AI generation (OpenAI)"
          subtitle={`This month · ${report.month.openai.units} generations`}
          used={`$${(aiCents / 100).toFixed(2)}`}
          limit={`$${(limits.openaiMonthlyCents / 100).toFixed(2)}`}
          unit={aiPct}
          configured={report.configured.openai}
          danger={aiPct >= 85}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-body text-sm font-semibold text-foreground">Your plan limits</h2>
        <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
          None of these providers lets us ask "how many credits are left", so the site counts what it
          spends and compares it to the numbers you type here. Set them to whatever your plans
          actually give you — the bars then tell you when to top up, and the provider's dashboard
          stays the final word on the bill.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 font-body text-xs text-muted-foreground">
            Resend — emails / month
            <input
              type="number"
              min={0}
              defaultValue={limits.resendMonthly}
              disabled={busy}
              onBlur={(e) =>
                void saveLimits({ ...limits, resendMonthly: Number(e.target.value) })
              }
              className="rounded-md border border-border bg-background px-2.5 py-1.5 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 font-body text-xs text-muted-foreground">
            YouTube — quota units / day
            <input
              type="number"
              min={0}
              defaultValue={limits.youtubeDaily}
              disabled={busy}
              onBlur={(e) => void saveLimits({ ...limits, youtubeDaily: Number(e.target.value) })}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 font-body text-xs text-muted-foreground">
            OpenAI — budget $ / month
            <input
              type="number"
              min={0}
              step="0.5"
              defaultValue={(limits.openaiMonthlyCents / 100).toFixed(2)}
              disabled={busy}
              onBlur={(e) =>
                void saveLimits({
                  ...limits,
                  openaiMonthlyCents: Math.round(Number(e.target.value) * 100),
                })
              }
              className="rounded-md border border-border bg-background px-2.5 py-1.5 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
            />
          </label>
        </div>

        <p className="mt-4 font-body text-[11px] leading-5 text-muted-foreground/80">
          Free YouTube quota is 10,000 units a day; one whitelisted channel costs 2 units per check,
          so ~5,000 channel checks a day before Google says no. The AI figures are list-price
          estimates (≈4¢ per cover, ≈1¢ per description) — close enough to warn you, not accurate
          enough to do your accounting.
        </p>
      </div>
    </div>
  );
};

export default AdminUsage;
