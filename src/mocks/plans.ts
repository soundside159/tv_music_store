import type { PlanConfig } from "@/types/domain";

export const mockPlans: PlanConfig[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnualPerMonth: 0,
    downloadLimit: 3,
    wavAndStems: false,
    commercialLicense: false,
    whitelistSlots: 0,
    prioritySupport: false,
    highlights: ["3 downloads / month", "Personal license", "Claims sent for release on request"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 12,
    priceAnnualPerMonth: 7,
    downloadLimit: null,
    wavAndStems: false,
    commercialLicense: false,
    whitelistSlots: 3,
    prioritySupport: false,
    highlights: ["Unlimited MP3 downloads", "Personal & small-team license"],
  },
  {
    id: "max",
    name: "Max",
    priceMonthly: 29,
    priceAnnualPerMonth: 15,
    downloadLimit: null,
    wavAndStems: true,
    commercialLicense: true,
    whitelistSlots: 10,
    prioritySupport: true,
    highlights: [
      "Commercial license: ads & client work",
      "WAV format + stems",
      "Priority support",
    ],
  },
];
