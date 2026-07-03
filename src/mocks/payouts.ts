import type { PayoutLine, PayoutPeriod } from "@/types/domain";
import { mockDownloadLog } from "./downloads";

// Platform economics (docs/TVMUSICSTORE_MASTER_PLAN.md, section 3):
// net revenue -> 50% platform / 50% author pool split by download points.
export const PLATFORM_SHARE = 0.5;

/** Mocked net monthly revenue (USD, after Stripe fees) while designing. */
const mockNetRevenueByMonth: Record<string, number> = {
  "2026-05": 830,
  "2026-06": 1240,
  "2026-07": 610, // partial month
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const buildPayouts = () => {
  const periods: PayoutPeriod[] = [];
  const lines: PayoutLine[] = [];

  Object.entries(mockNetRevenueByMonth).forEach(([month, netRevenue], pi) => {
    const periodId = `pp_${month}`;
    const monthEntries = mockDownloadLog.filter((e) => e.createdAt.startsWith(month));
    const authorPool = round2(netRevenue * (1 - PLATFORM_SHARE));

    const byComposer = new Map<string, number>();
    for (const e of monthEntries) {
      byComposer.set(e.composerId, (byComposer.get(e.composerId) ?? 0) + 1);
    }
    const totalPoints = monthEntries.length || 1;

    periods.push({
      id: periodId,
      month,
      netRevenue,
      platformShare: round2(netRevenue * PLATFORM_SHARE),
      authorPool,
      status: pi < 2 ? "paid" : "draft",
    });

    let li = 1;
    for (const [composerId, count] of byComposer) {
      lines.push({
        id: `pl_${month}_${li++}`,
        periodId,
        composerId,
        downloadsCount: count,
        weightedPoints: count,
        amount: round2((authorPool * count) / totalPoints),
      });
    }
  });

  return { periods, lines };
};

const built = buildPayouts();

export const mockPayoutPeriods: PayoutPeriod[] = built.periods;
export const mockPayoutLines: PayoutLine[] = built.lines;
