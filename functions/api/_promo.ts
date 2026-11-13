// 13.11.2026: the Black Friday discount for single-track licenses, applied on
// the server (no code to type). Keep in step with src/lib/promo.ts.
import type { LicensePriceMap } from "./_utils";

export const LICENSE_PROMO = { percent: 20, endsAt: Date.parse("2026-11-30T23:59:59Z") };

export const applyLicensePromo = (prices: LicensePriceMap, now: number = Date.now()): LicensePriceMap => {
  if (now >= LICENSE_PROMO.endsAt) return prices;
  const out = { ...prices };
  for (const k of Object.keys(out) as (keyof LicensePriceMap)[]) {
    out[k] = Math.round(out[k] * (100 - LICENSE_PROMO.percent)) / 100;
  }
  return out;
};
