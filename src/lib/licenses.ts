// Single-track license tiers (one-time purchases, paid via PayPal in /cart).
// PRICES ARE LIVE: the admin edits them on the dashboard (site_config), the
// storefront hydrates them from /api/content (see useContent.ts), and the
// PayPal order endpoint prices carts server-side from the same source. The
// numbers below are only the first-paint fallback.

import { useSyncExternalStore } from "react";

export type LicenseTierId = "personal" | "commercial" | "professional";

export interface LicenseTier {
  id: LicenseTierId;
  name: string;
  price: number;
  formats: string;
  usageTerms: string[];
}

export const licenseTiers: LicenseTier[] = [
  {
    id: "personal",
    name: "Personal",
    price: 15,
    formats: "MP3, WAV",
    usageTerms: [
      "Personal & hobby use",
      "YouTube & social media",
      "Podcasts & streaming",
      "Monetized channels OK",
      "Non-profit use",
      "Lifetime license",
    ],
  },
  {
    id: "commercial",
    name: "Commercial",
    price: 79,
    formats: "MP3, WAV, STEMS",
    usageTerms: [
      "Business & commercial use",
      "Client & freelance work",
      "Paid ads & sponsored content",
      "YouTube & social media",
      "Podcasts & streaming",
      "Lifetime license",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 249,
    formats: "MP3, WAV, STEMS",
    usageTerms: [
      "Everything in Commercial",
      "TV & radio broadcast",
      "Films, games & apps",
      "Software & installations",
      "Widest usage rights",
      "Lifetime license",
    ],
  },
];

export const licenseTierById = (id: string): LicenseTier | undefined =>
  licenseTiers.find((t) => t.id === id);

// ---------------------------------------------------------------------------
// Live price hydration (called by useContent once /api/content answers).
// ---------------------------------------------------------------------------

let tiersSnapshot = licenseTiers;
const listeners = new Set<() => void>();

export const hydrateLicensePrices = (
  prices: Partial<Record<LicenseTierId, number>> | undefined,
): void => {
  if (!prices) return;
  let changed = false;
  for (const t of licenseTiers) {
    const v = Number(prices[t.id]);
    if (Number.isFinite(v) && v > 0 && v !== t.price) {
      t.price = v;
      changed = true;
    }
  }
  if (changed) {
    tiersSnapshot = [...licenseTiers];
    listeners.forEach((l) => l());
  }
};

/** Subscribes a component to live tier prices (re-renders on admin edits). */
export const useLicenseTiers = (): LicenseTier[] =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => tiersSnapshot,
    () => tiersSnapshot,
  );
