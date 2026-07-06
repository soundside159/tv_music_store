# TV Music Store — Deploy checklist

Everything to deploy and configure for the recent work (certificates, license
codes, whitelisting Phase 1+2, CRM, funnel: newsletter + welcome + campaigns).

## 1. Deploy the code

Run **`deploy.bat`** on the Windows machine (git pull --ff-only → lint → build →
commit → push). Cloudflare Pages then builds from `main` in ~1–3 min; hard-refresh
(Ctrl+F5). The sandbox can't build (Windows node_modules), so `deploy.bat` is the
authoritative lint + build.

## 2. Cloudflare Pages — bindings (Settings → Functions / Bindings)

- **D1 database** → variable name **`DB`** (the main database).
- **R2 bucket** → variable name **`R2`** → `tvmusicstore-files` (covers/masters).

## 3. Cloudflare Pages — environment variables & secrets

Already set from earlier work (verify they're still there):

- `RESEND_API_KEY` — all email (login code, welcome, campaigns).
- `EMAIL_FROM` — optional sender, e.g. `TV Music Store <no-reply@e.tvmusicstore.com>`.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — subscriptions.
- `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV` (`live` or `sandbox`) — one-time.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google sign-in.

**NEW — set these now:**

- **`LICENSE_SIGNING_SECRET`** — any long random string. Signs subscription license
  codes so they're tamper-evident. Codes still work without it (admin lookup is
  authoritative), but set it before launch.
- **`YOUTUBE_API_KEY`** — YouTube Data API v3 key. Needed for the whitelist
  "New videos" feature (admin → Whitelisting). Without it that button shows a
  clear "not configured" message; everything else works.

## 4. Database

- New tables are **created lazily at runtime** (plan_licenses, whitelist_channels,
  newsletter_subscribers, email_campaigns), so an existing D1 needs no manual step.
- For a **fresh** D1, apply `migrations/0001_init.sql` (it now includes all of
  them).

## 5. Post-deploy smoke test

- `GET /api/health` — check DB/R2/Stripe/PayPal report OK.
- Sign up a test account → confirm the **welcome email** arrives.
- Buy a one-time license (PayPal) and a subscription cert → open both PDFs, check
  the new design + codes.
- `/admin`: open **Licenses** (click a buyer → profile), **Whitelisting** (add a
  channel as a test paid user, then "New videos"), **Campaigns** (Preview count).
- Footer newsletter form → subscribe → check the row; click an unsubscribe link.

## 6. Owner to-dos before public launch (not code)

- Rent a **correspondence address** and fill the `[[correspondence address]]`
  placeholders (Terms/Privacy pages use the `ADDRESS` constant; drafts in `docs/`).
- Set the **effective date** (EFFECTIVE constant in LicenseTerms.tsx / Privacy.tsx).
- Restore **live prices** ($29 / $89 / $249) from the test $1/$2/$3
  (`paypal/_paypal.ts` LICENSE_PRICES + `src/lib/licenses.ts`).
- Set real **social URLs** in `Footer.tsx` (YouTube / Instagram / X / Facebook).
- Confirm whitelist per-plan limits (Free 0 / Pro 3 / Max 10) in `whitelist.ts`.
- Decide composer **revenue %** (Composer Agreement).
- Have a lawyer review Terms / Privacy / Composer Agreement.
