import type { D1Database } from "./_utils";

// ---------------------------------------------------------------------------
// SERVICE USAGE METER — "how much of my quota have I burned?"
//
// None of the three providers gives a clean "credits left" endpoint we can call
// from a Worker, so we do the honest thing: we count what WE spend, every time
// we spend it, and show that against the plan limits the owner enters. The
// provider's own dashboard stays the source of truth — this is the warning light
// on the dash, not the gauge in the tank.
//
//   resend   — 1 unit per email sent
//   youtube  — YouTube Data API quota UNITS (a channels/playlistItems/videos
//              lookup costs 1 unit; a search costs 100 — we never search)
//   openai   — 1 unit per generation, plus an estimated cost in cents
// ---------------------------------------------------------------------------

export type UsageService = "resend" | "youtube" | "openai";

/** Cheap, additive, and never allowed to break the caller. */
export const bumpUsage = async (
  db: D1Database | undefined,
  service: UsageService,
  units = 1,
  costCents = 0,
): Promise<void> => {
  if (!db) return;
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS service_usage (
           day TEXT NOT NULL,
           service TEXT NOT NULL,
           units INTEGER NOT NULL DEFAULT 0,
           cost_cents INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (day, service)
         )`,
      )
      .run();
    const day = new Date().toISOString().slice(0, 10);
    await db
      .prepare(
        `INSERT INTO service_usage (day, service, units, cost_cents)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(day, service) DO UPDATE SET
           units = units + ?3,
           cost_cents = cost_cents + ?4`,
      )
      .bind(day, service, Math.max(0, Math.round(units)), Math.max(0, Math.round(costCents)))
      .run();
  } catch {
    // Metering must NEVER take down the thing it is measuring.
  }
};

export interface UsageLimits {
  /** Resend emails per month on the current plan. */
  resendMonthly: number;
  /** YouTube Data API units per DAY (Google's default free quota is 10,000). */
  youtubeDaily: number;
  /** What the owner is willing to spend on AI generation per month, in cents. */
  openaiMonthlyCents: number;
}

export const DEFAULT_LIMITS: UsageLimits = {
  resendMonthly: 50000,
  youtubeDaily: 10000,
  openaiMonthlyCents: 2000,
};

export const getUsageLimits = async (db: D1Database): Promise<UsageLimits> => {
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'usage_limits'`)
      .first<{ value: string }>();
    if (!row) return DEFAULT_LIMITS;
    const parsed = JSON.parse(row.value) as Partial<UsageLimits>;
    return {
      resendMonthly: Number(parsed.resendMonthly) || DEFAULT_LIMITS.resendMonthly,
      youtubeDaily: Number(parsed.youtubeDaily) || DEFAULT_LIMITS.youtubeDaily,
      openaiMonthlyCents:
        Number(parsed.openaiMonthlyCents) || DEFAULT_LIMITS.openaiMonthlyCents,
    };
  } catch {
    return DEFAULT_LIMITS;
  }
};

export const saveUsageLimits = async (db: D1Database, limits: UsageLimits): Promise<void> => {
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
    .run();
  await db
    .prepare(
      `INSERT INTO site_config (key, value) VALUES ('usage_limits', ?1)
       ON CONFLICT(key) DO UPDATE SET value = ?1`,
    )
    .bind(JSON.stringify(limits))
    .run();
};

export interface UsageReport {
  today: Record<UsageService, { units: number; costCents: number }>;
  month: Record<UsageService, { units: number; costCents: number }>;
  limits: UsageLimits;
  /** Last 14 days, for a small bar chart. */
  history: { day: string; service: UsageService; units: number }[];
}

const empty = () => ({ units: 0, costCents: 0 });

export const getUsageReport = async (db: D1Database): Promise<UsageReport> => {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const report: UsageReport = {
    today: { resend: empty(), youtube: empty(), openai: empty() },
    month: { resend: empty(), youtube: empty(), openai: empty() },
    limits: await getUsageLimits(db),
    history: [],
  };

  try {
    const rows = await db
      .prepare(
        `SELECT day, service, units, cost_cents FROM service_usage
          WHERE day >= date('now', '-14 days') ORDER BY day ASC`,
      )
      .all<{ day: string; service: UsageService; units: number; cost_cents: number }>();

    for (const r of rows.results) {
      if (!report.month[r.service]) continue;
      if (r.day === today) {
        report.today[r.service].units += r.units;
        report.today[r.service].costCents += r.cost_cents;
      }
      if (r.day.startsWith(month)) {
        report.month[r.service].units += r.units;
        report.month[r.service].costCents += r.cost_cents;
      }
      report.history.push({ day: r.day, service: r.service, units: r.units });
    }
  } catch {
    // no table yet — nothing has been spent
  }

  return report;
};
