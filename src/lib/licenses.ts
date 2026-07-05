// Single-track license tiers (one-time purchases, paid via PayPal in /cart).
// Server-side prices live in functions/api/paypal/_paypal.ts — keep in sync.
// NOTE: prices below are TEMPORARY TEST PRICES ($1/$2/$3) for end-to-end
// checkout testing. Restore 29 / 89 / 249 here AND in _paypal.ts before launch.

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
    price: 1,
    formats: "MP3, WAV",
    usageTerms: [
      "Personal use only",
      "All social platforms",
      "Podcasts",
      "Streaming",
      "Monetization allowed",
      "Non-profit",
    ],
  },
  {
    id: "commercial",
    name: "Commercial",
    price: 2,
    formats: "MP3, WAV, STEMS",
    usageTerms: [
      "Commercial usage",
      "All social platforms",
      "Podcasts",
      "Streaming",
      "Client work",
      "Paid ads",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 3,
    formats: "MP3, WAV, STEMS",
    usageTerms: [
      "Commercial usage",
      "TV / Radio broadcast",
      "Games",
      "Software",
      "Client work",
      "Paid ads",
    ],
  },
];

export const licenseTierById = (id: string): LicenseTier | undefined =>
  licenseTiers.find((t) => t.id === id);
