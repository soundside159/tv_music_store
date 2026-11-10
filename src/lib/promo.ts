// Time-limited promo shown on the site (strip, pricing cards, plan popup).
// The Stripe promotion code itself is created in the Stripe dashboard;
// this file only controls what the site displays. Everything hides
// automatically after endsAt, no deploy needed.

export const PROMO = {
  code: "BLACKFRIDAY20",
  percent: 20,
  label: "Early Black Friday",
  ribbon: "Black Friday \u221220%",
  endsLabel: "30 Nov",
  endsAt: new Date("2026-11-30T23:59:59Z"),
};

/** True while the promo should be shown. */
export const promoActive = (now: number = Date.now()): boolean =>
  now < PROMO.endsAt.getTime();

/** Format a dollar amount: whole numbers without cents, others with 2 decimals. */
export const money = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

/** Price after the promo discount. */
export const promoPrice = (n: number): number =>
  Math.round(n * (100 - PROMO.percent)) / 100;
