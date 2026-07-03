import type { DownloadFormat, DownloadLogEntry, PlanId } from "@/types/domain";

// Deterministic pseudo-random generator so the mock data is stable
// between reloads (stable UI while designing, stable tests).
const lcg = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const rnd = lcg(42);

const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

const composerWeights: { composerId: string; weight: number }[] = [
  { composerId: "cmp_1", weight: 0.4 },
  { composerId: "cmp_2", weight: 0.25 },
  { composerId: "cmp_3", weight: 0.35 },
];

const pickComposer = (): string => {
  const r = rnd();
  let acc = 0;
  for (const c of composerWeights) {
    acc += c.weight;
    if (r <= acc) return c.composerId;
  }
  return composerWeights[0].composerId;
};

const userIds = ["usr_free_1", "usr_free_2", "usr_pro_1", "usr_max_1", "usr_cnl_1"];
const planByUser: Record<string, PlanId> = {
  usr_free_1: "free",
  usr_free_2: "free",
  usr_pro_1: "pro",
  usr_max_1: "max",
  usr_cnl_1: "pro",
};

/** ~3 months of download history (May–July 2026), 8–20 downloads per day. */
export const mockDownloadLog: DownloadLogEntry[] = (() => {
  const entries: DownloadLogEntry[] = [];
  let id = 1;
  const start = new Date("2026-05-01T00:00:00Z").getTime();
  const days = 63;
  for (let d = 0; d < days; d++) {
    const perDay = 8 + Math.floor(rnd() * 13);
    for (let i = 0; i < perDay; i++) {
      const userId = pick(userIds);
      const plan = planByUser[userId];
      const composerId = pickComposer();
      const format: DownloadFormat =
        plan === "max" && rnd() < 0.3 ? (rnd() < 0.5 ? "wav" : "stems") : "mp3";
      const ts = new Date(start + d * 86400000 + Math.floor(rnd() * 86400000));
      entries.push({
        id: `dl_${id++}`,
        userId,
        trackId: `trk_${String(1 + Math.floor(rnd() * 30)).padStart(3, "0")}`,
        composerId,
        planAtDownload: plan,
        format,
        createdAt: ts.toISOString(),
      });
    }
  }
  return entries;
})();
