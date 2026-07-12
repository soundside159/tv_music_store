import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

// Services & credits — rendered at the bottom of Admin → Dashboard.
//
// Only ONE of the three providers can honestly be metered from here:
//
//   YouTube  — no quota endpoint exists, but the cost is fully deterministic
//              (2 units per whitelisted-channel check, 10,000 free units a day),
//              so counting our own calls IS the real number.
//   Resend   — no usage/quota endpoint at all → link to their dashboard.
//   OpenAI   — a real Costs API exists but needs a separate Admin key; until the
//              owner adds one (OPENAI_ADMIN_KEY), we link out rather than show a
//              guess. If the key IS set, the real spend appears instead.
//
// A number that pretends to be a bill is worse than an honest link.

const GOLD = "#F4C430";

const YOUTUBE_DAILY_QUOTA = 10000;

interface Bucket {
  units: number;
  costCents: number;
}

interface Report {
  today: Record<"resend" | "youtube" | "openai", Bucket>;
  month: Record<"resend" | "youtube" | "openai", Bucket>;
  configured: { resend: boolean; youtube: boolean; openai: boolean; openaiAdmin: boolean };
  openaiSpend: { centsThisMonth: number; source: "openai" | "estimate"; note?: string };
}

/** A card that links out, because the provider gives us nothing to read. */
const LinkCard = ({
  title,
  href,
  what,
  configured,
}: {
  title: string;
  href: string;
  what: string;
  configured: boolean;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-colors hover:border-[#F4C430]/60"
  >
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-body text-sm font-semibold text-foreground">{title}</h3>
        {!configured && (
          <span className="rounded-full border border-border px-2 py-0.5 font-body text-[10px] uppercase tracking-wide text-muted-foreground">
            not configured
          </span>
        )}
      </div>
      <p className="mt-2 font-body text-xs leading-5 text-muted-foreground">{what}</p>
    </div>
    <span
      className="mt-5 inline-flex items-center gap-1.5 font-body text-sm font-semibold transition-colors"
      style={{ color: GOLD }}
    >
      Open dashboard
      <ExternalLink className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
    </span>
  </a>
);

const AdminUsage = () => {
  const [report, setReport] = useState<Report | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usage", { credentials: "include" });
      if (!res.ok) return;
      setReport((await res.json()) as Report);
    } catch {
      // offline — the cards still link out, which is the important part
    }
  }, []);

  // Refreshed every time the Dashboard is opened.
  useEffect(() => {
    void load();
  }, [load]);

  const ytToday = report?.today.youtube.units ?? 0;
  const ytPct = Math.min(100, Math.round((ytToday / YOUTUBE_DAILY_QUOTA) * 100));
  const ytDanger = ytPct >= 85;

  const realAi = report?.openaiSpend.source === "openai";
  const aiCents = report?.openaiSpend.centsThisMonth ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-body text-sm font-semibold text-foreground">Services &amp; credits</h2>
        <p className="mt-1 font-body text-xs text-muted-foreground">
          YouTube is metered here (its cost is fixed and countable). Resend and OpenAI publish no
          "credits left" figure, so they link straight to their own dashboards — an honest link beats
          an invented number.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* The one real meter. */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-body text-sm font-semibold text-foreground">YouTube API</h3>
            {report && !report.configured.youtube && (
              <span className="rounded-full border border-border px-2 py-0.5 font-body text-[10px] uppercase tracking-wide text-muted-foreground">
                no key
              </span>
            )}
          </div>
          <p className="mt-2 font-body text-xs text-muted-foreground">
            Quota used today · resets midnight PT
          </p>

          <p className="mt-4 font-body text-2xl font-semibold tabular-nums" style={{ color: GOLD }}>
            {ytToday.toLocaleString("en-US")}
            <span className="ml-1 font-body text-sm font-normal text-muted-foreground">
              / {YOUTUBE_DAILY_QUOTA.toLocaleString("en-US")}
            </span>
          </p>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${ytPct}%`, backgroundColor: ytDanger ? "#f87171" : GOLD }}
            />
          </div>
          <p className="mt-2 font-body text-[11px] leading-5 text-muted-foreground/80">
            2 units per whitelisted-channel check — roughly 5,000 checks a day before Google says no.
          </p>
          {ytDanger && (
            <p className="mt-1 font-body text-xs text-red-400">
              Nearly out for today — channel checks will start failing.
            </p>
          )}
        </div>

        <LinkCard
          title="Emails (Resend)"
          href="https://resend.com/emails"
          what="Resend has no usage API, so the balance lives only in their dashboard. Login codes and (soon) receipts go through it."
          configured={!!report?.configured.resend}
        />

        {/* If an Admin key is set we CAN show the real bill; otherwise, a link. */}
        {realAi ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-body text-sm font-semibold text-foreground">AI generation (OpenAI)</h3>
            <p className="mt-2 font-body text-xs text-muted-foreground">
              Spent this month · real figure from OpenAI
            </p>
            <p className="mt-4 font-body text-2xl font-semibold tabular-nums" style={{ color: GOLD }}>
              ${(aiCents / 100).toFixed(2)}
            </p>
            <a
              href="https://platform.openai.com/usage"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 font-body text-sm font-semibold"
              style={{ color: GOLD }}
            >
              Open dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <LinkCard
            title="AI generation (OpenAI)"
            href="https://platform.openai.com/usage"
            what="Cover art and descriptions. Add an OPENAI_ADMIN_KEY in Cloudflare and the real monthly spend appears here instead of this link."
            configured={!!report?.configured.openai}
          />
        )}
      </div>
    </div>
  );
};

export default AdminUsage;
