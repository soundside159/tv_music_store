# TV Music Store — Backlog & owner reminders

Running list of ideas and to-dos captured during sessions. Not urgent unless noted.

## Admin CRM — customer profiles (owner idea, 2026-07-06)

Make buyers clickable in the admin so their whole history is one click away, for
support and targeted marketing.

- **Licenses view:** clicking the buyer (name/email) opens that customer's profile.
- **Customers view:** clicking a customer opens the same profile page.
- **Profile page contents (proposed):**
  - Identity: name, email, plan, member since.
  - Subscriptions: current + past plans, status, billing dates.
  - Purchases: one-time licenses (track, tier, price, date).
  - Downloads: what they downloaded, with **genre/mood/use-case tags** aggregated
    so you can see their taste (e.g. "mostly Epic / Trailer").
  - Quick actions: view any license PDF, copy email, (later) "send campaign".
- **Why:** understand each customer's taste to send relevant promos — e.g. a
  buyer who favours epic/trailer music gets the new epic album, not random emails.
- **Data:** most already exists — `sync_orders`, `subscriptions`, `download_log`
  (+ track tags via `tracks`). Mostly a new admin page + a couple of queries
  (`/api/admin/customer/:id`), no new schema.
- Marketing send itself is a later, separate feature (needs an email campaign
  flow + unsubscribe; keep GDPR consent from the Privacy Policy in mind).

## Owner to-dos (not code)

- [ ] **Rent a correspondence address** (virtual office / mailing address, ~£5–15/mo)
      to use on legal docs and invoices instead of the home address. Then fill the
      `[[correspondence address]]` placeholders in `LICENSE_TERMS_DRAFT.md`,
      `PRIVACY_POLICY_DRAFT.md`, and `COMPOSER_AGREEMENT_DRAFT.md`.
- [ ] Set real social URLs in `src/components/Footer.tsx` (YouTube, Instagram, X,
      Facebook) — currently `#` placeholders.
- [ ] Restore live prices ($29 / $89 / $249) from the test $1/$2/$3 before launch.
- [ ] Decide composer revenue share % + payout threshold (Composer Agreement).
- [ ] Have a lawyer review the Terms / Privacy / Composer drafts before publishing.

## Pages still to build

- `/license-terms` and `/privacy` — real site pages from the drafts in `docs/`
  (the footer + certificate link to them; currently 404).
