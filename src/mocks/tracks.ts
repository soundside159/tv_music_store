import type { ModerationStatus } from "@/types/domain";

/** Lightweight track rows for composer/admin dashboards (design phase only). */
export interface ComposerTrackRow {
  id: string;
  composerId: string;
  title: string;
  status: ModerationStatus;
  published: boolean;
}

const titlesByComposer: Record<string, string[]> = {
  cmp_1: [
    "A Few Clicks To Destruction",
    "A Journey in Other Worlds",
    "Silent Corridors",
    "Last Transmission",
    "Glass Skyline",
    "Interrogation Room",
    "Signal Lost",
    "Final Approach",
  ],
  cmp_2: [
    "Ignition Point",
    "Pulse Driver",
    "Midnight Sprint",
    "Overdrive",
    "Steel Rhythm",
    "Adrenaline Peak",
    "Circuit Breaker",
    "Velocity",
  ],
  cmp_3: [
    "Dust Roads",
    "Wooden Hearts",
    "Northern Shore",
    "Slow Fire",
    "Canyon Light",
    "Homecoming",
    "River Stones",
    "Open Fields",
  ],
};

export const mockComposerTracks: ComposerTrackRow[] = Object.entries(titlesByComposer).flatMap(
  ([composerId, titles], ci) =>
    titles.map((title, i) => ({
      id: `trk_${String(ci * 10 + i + 1).padStart(3, "0")}`,
      composerId,
      title,
      status: (i === 7 ? "pending" : "approved") as ModerationStatus,
      published: i !== 7,
    })),
);
