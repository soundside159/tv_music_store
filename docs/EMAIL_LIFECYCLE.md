# TV Music Store — Email & mailer logic

Every email the site sends today, when it fires, and the rules around it.
All email goes through Resend (`sendEmail` in `_utils.ts`); templates live in
`functions/api/_email.ts`. Two kinds: **transactional** (always sent — needed for
the service) and **marketing** (opt-in + unsubscribe).

## 1. Login code — "Here is your code" (transactional)

- **When:** the user asks to sign in with their email (passwordless).
- **Where:** `functions/api/auth/request-code.ts` → 6-digit code, valid 10 min.
- **This IS the registration confirmation:** entering the code proves the person
  owns the email. There is no separate "confirm your email" step — the code is it.
- Rate-limited to 3 active codes per email.

## 2. Welcome email — "Welcome to TV Music Store" (transactional)

- **When:** ONCE, the moment a new account is created — on any signup path:
  email-code (`auth/verify.ts`), email+password (`auth/register.ts`), or Google
  (`auth/google/callback.ts`).
- **Not sent to** the owner/admin account.
- **Content:** greeting by name, how it works (find → download + certificate →
  use per plan), what upgrading unlocks (unlimited, WAV/stems, no attribution,
  whitelisting), "Browse the music library" button.
- Never blocks signup if the email fails.

## 3. Newsletter opt-in (list membership, no email yet)

- **When:** someone submits the footer form (`NewsletterSignup` → `POST
  /api/newsletter`).
- **Effect:** added to `newsletter_subscribers` with an unsubscribe token.
  Idempotent; re-subscribes a previously-unsubscribed email.
- **Single opt-in** today (no confirmation email). If you ever want double
  opt-in (a "confirm your subscription" click), that's a small addition.
- Account signup does **not** auto-subscribe — marketing is separate, by design
  (GDPR opt-in).

## 4. Campaign email — marketing (opt-in + unsubscribe)

- **When:** you send one from `/admin → Campaigns`.
- **Who gets it:** active `newsletter_subscribers` only (never account emails that
  didn't opt in). With a taste tag, further limited to subscribers whose account
  taste (downloads/purchases, from the CRM) includes that genre/mood/use-case.
- **Content:** your subject + body (blank lines = paragraphs), an auto "Listen
  now" button, and an **unsubscribe link** in every message.
- Sent via Resend in batches of 10, **capped at 300 per campaign** (bigger lists
  need a queue later). Each send is logged in `email_campaigns`.

## 5. Unsubscribe (one-click)

- **When:** the recipient clicks the unsubscribe link in a campaign.
- **Where:** `GET /api/newsletter/unsubscribe?token=…` → marks `unsubscribed_at`,
  shows a branded confirmation page.
- **Scope:** stops **marketing** only. Transactional emails (login code, welcome,
  and anything essential about their account/purchases) still go out.

## The lifecycle in one line

Sign in → **login code (1)** → new account → **welcome (2)** · Footer form →
**newsletter list (3)** · You → **campaign to a taste segment (4)** · Recipient →
**unsubscribe (5)**.

## Not built yet (candidates)

- **Purchase/receipt email** after a PayPal/Stripe purchase (with the certificate
  or a link). Today the certificate is download-on-demand, not emailed.
- **Double opt-in** confirmation for the newsletter.
- **Campaign queue/batching** for lists over 300, plus scheduling.
- **Win-back / lifecycle drips** (e.g. email a Free user who hasn't upgraded).
