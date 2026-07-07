// Single-track license tiers (one-time purchases, paid via PayPal in /cart).
// Server-side prices live in functions/api/paypal/_paypal.ts — keep in sync.
// LIVE PRICES (USD): Personal 15 / Commercial 79 / Professional 249.

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
