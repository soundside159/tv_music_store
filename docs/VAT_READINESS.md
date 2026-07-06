# VAT Readiness — notes for later (NOT urgent)

> Idea parked at the owner's request. Nothing to build now. Not tax advice —
> confirm timing/registration with an accountant before selling to EU consumers.

## Where we stand
- Owner is **not VAT-registered** (UK turnover under the £90k threshold).
- Sell **UK-only** at the start = no VAT to handle.
- EU B2C digital sales have **no threshold** for a UK seller — VAT is technically
  due from the first EU-consumer sale (via **OSS**, one registration + quarterly
  return). So the OSS-vs-MoR decision must be made **before** taking EU money.

## Two paths (decide before EU launch)
1. **Merchant of Record (Paddle)** — Paddle becomes the seller of record and
   handles **all** VAT/OSS/sales tax worldwide, for both subscriptions and
   one-time sales. We register nowhere. ~5% fee, replaces Stripe+PayPal checkout.
   Best "set-and-forget" for a small global seller — **owner's preferred future
   direction.**
2. **Stripe + PayPal + OSS** — cheaper (~3%), but we register for OSS and file
   quarterly (with an accountant). This is the current stack.

## If we stay on Stripe+PayPal — the "flip a switch" design (build later)
- Config flag `vat_enabled` in `site_config` (off now).
- Order/subscription records gain: `buyer_country`, `gross`, `net`, `vat_amount`,
  `vat_rate`, `tax_source`.
- `vat_rates` table (country → %), editable in admin; rates from the EU **TEDB**
  (ec.europa.eu/taxation_customs/tedb/, has a SOAP API) + UK 20%.
- **Stripe:** enable Stripe Tax, prices **tax-inclusive** (VAT inside the shown
  price — never added on top), store the tax breakdown per order.
- **PayPal:** no auto-tax — compute ourselves from the payer country + rate:
  `net = gross / (1 + rate)`, `vat = gross - net`. Store it.
- Admin Licenses/Orders: show gross / net / VAT + CSV export for filing.
- Certificate/receipt: when VAT on, add a "Includes VAT of £X (Y%)" line.

## Current status
Payments stay on Stripe + PayPal. `TVM-` invoice prefix already added to PayPal
orders for CSV filtering. VAT line stays off. Revisit when UK turnover nears £90k
or before opening EU sales — most likely by switching to Paddle.
