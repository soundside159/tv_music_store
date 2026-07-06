# TODO — Persistent license codes for subscription licenses + admin lookup

> **Status:** ✅ IMPLEMENTED 2026-07-06 (see the "Implemented" note at the bottom).
> Kept for reference / acceptance criteria.
> This is the "next task" the owner asked to write down: give subscription
> (plan-based) license certificates a **real, unique, verifiable code** that is
> **stored** and can be **looked up in the admin panel** (who issued it, which
> track, which plan, when).

---

## 1. Why

One-time (PayPal) licenses already have a stable code: it is the
`sync_orders.id` printed on the certificate, and `/admin` → **Licenses**
(`functions/api/admin/licenses.ts`) already resolves that id to buyer + track +
tier + price + date.

**Subscription** certificates do NOT have this. Today `license-pdf.ts`, for a
`?slug=` / `?track=` request, prints a static label like `MAX PLAN` as the
"code" — it is not unique, not stored, and cannot be looked up. So if a customer
sends the owner a plan certificate (e.g. for a YouTube Content ID dispute), the
owner has no way to verify it or see who/what/when.

**Goal:** every time a subscription certificate is generated, mint (or reuse) a
unique code, persist it in D1, print it on the PDF, and expose it in admin.

---

## 2. Data model (new table, lazy-created like the others)

Add a `plan_licenses` table. Create it lazily on first use (same pattern as
`ensureTrackCoverColumn` / the `categories` seed) so no manual migration step is
needed — but also add it to `migrations/0001_init.sql` for fresh DBs.

```sql
CREATE TABLE IF NOT EXISTS plan_licenses (
  id           TEXT PRIMARY KEY,             -- the printed code, e.g. TVMS-MAX-7QF3-9AB2
  user_id      TEXT NOT NULL REFERENCES users(id),
  track_id     TEXT NOT NULL,
  plan         TEXT NOT NULL,                -- free | pro | max (plan AT ISSUE TIME)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plan_licenses_user  ON plan_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_licenses_track ON plan_licenses(track_id);
```

**Reuse rule:** one code per `(user_id, track_id, plan)`. When a certificate is
requested, `SELECT` an existing row for that triple first; only `INSERT` a new
code if none exists. This keeps a customer's certificate for a given track
stable across re-downloads, while a plan upgrade (free→pro→max) mints a new code
(correct: the granted rights changed).

### Code format
`TVMS-<PLAN>-XXXX-XXXX` where `PLAN` ∈ `FREE|PRO|MAX` and `X` are
Crockford base32 (no `I O 0 1` ambiguity), e.g. `TVMS-MAX-7QF3-9AB2`.
Generate with `crypto.getRandomValues` (available in the Workers runtime).
Retry on the (extremely unlikely) PK collision.

---

## 3. Server changes

### 3.1 `functions/api/license-pdf.ts`
In the `?slug=` / `?track=` branch (the subscription branch), after resolving
`plan` and the track:

1. `getOrCreatePlanLicense(db, user.id, trackId, plan)` → returns the code
   (select-or-insert per §2).
2. Feed it into `buildCertificate`:
   - `code: licenseCode` (instead of `"${plan.toUpperCase()} PLAN"`)
   - `codeLabel: "LICENSE CODE"` (instead of `"PLAN"`)
   - keep `codeNote: "Issued under the licensee's active subscription plan."`
   - `meta`: keep `["Type","Subscription"]`, `["Plan", plan.toUpperCase()]`,
     `["Status","Active"]` (swap the current `Track` meta row for `Plan` so the
     plan is visible; the track title is already the big line above).

The PDF template does **not** need layout changes — it already renders a
`LICENSE CODE` panel in courier for the one-time path. This is a data change.

Put `getOrCreatePlanLicense` + `ensurePlanLicensesTable` in a small shared
helper (e.g. extend `_utils.ts` or a new `_licenses.ts`) so admin can reuse it.

### 3.2 `functions/api/admin/licenses.ts` (extend the existing lookup)
Right now it queries `sync_orders` only. Make the admin Licenses view cover BOTH
kinds so any code a customer quotes resolves:

- Keep the `sync_orders` query (one-time licenses) as-is.
- Add a second query over `plan_licenses` LEFT JOIN `users` + `tracks`.
- Return a unified, newest-first list with a `kind` field:
  `"one-time" | "subscription"`. Fields per row:
  `id (code), kind, buyer (name/email), trackTitle, plan/tier, price (— for
  subs), createdAt`.
- `?q=` filter should match either code, buyer email/name, or track title
  (client-side filter can stay, just include the new rows).

### 3.3 (optional) public/verify endpoint
Nice-to-have for disputes: `GET /api/license-verify?code=` returning a minimal
public confirmation `{ valid, plan/tier, trackTitle, issued }` **without** buyer
PII. Not required for the owner's admin-only ask; note it and skip unless wanted.

---

## 4. Admin UI (`src/pages/Admin.tsx` + adminNav)

The **Licenses** sidebar item already exists (added with `admin/licenses.ts`).
Changes:

- Add a **Kind** column (One-time / Subscription) and/or a small filter chip
  (All / One-time / Subscription).
- The `License ID` column already links to the PDF for one-time orders
  (`/api/license-pdf?order=<id>`). For subscription rows, link to
  `/api/license-pdf?track=<track_id>` (regenerates the same cert; the code is
  now stable because it is persisted).
- Show `plan` for subscription rows where `tier` shows for one-time rows.

No new sidebar entry needed — this extends the existing Licenses view.

---

## 5. Acceptance checklist

- [ ] `plan_licenses` table created lazily + added to `0001_init.sql`.
- [ ] Downloading a plan certificate twice for the same track yields the **same**
      code; a plan upgrade yields a **new** code.
- [ ] The subscription PDF prints `TVMS-<PLAN>-XXXX-XXXX` in the code panel
      (label `LICENSE CODE`), not `MAX PLAN`.
- [ ] `/admin` → Licenses lists subscription licenses alongside one-time ones,
      searchable by code / buyer / track, each linking to its PDF.
- [ ] `npm run lint` 0 errors; frontend `tsc` clean; `functions/` verified via
      Read (sandbox mirror truncates — see AI_CONTEXT warnings).

---

## 6. Notes / gotchas for whoever picks this up

- **Sandbox↔host sync glitch** (documented throughout AI_CONTEXT): after editing
  files, the Linux sandbox mirror is often truncated/NUL-padded. Verify host
  files with the Read tool; do not trust a bash `cat`/lint of the mirror. To
  render/test the PDF in the sandbox, copy the *host* content into `/tmp` first
  (`_logo.ts` usually syncs whole; `_pdf.ts` / `license-pdf.ts` do not).
- `crypto.getRandomValues` + `atob` are available in the CF Workers runtime
  (already relied on by `_pdf.ts` and the stripe/paypal HMAC code).
- Keep prices/PII out of any public verify endpoint.
- The redesigned certificate template (dark header band, gold soundwave logo,
  usage-rights list, code panel) is DONE and validated with qpdf — this task is
  purely the code+storage+admin layer, no template redesign required.

---

## 7. Implemented (2026-07-06)

- **`functions/api/_licenses.ts`** (new): Crockford base32, WebCrypto HMAC-SHA256
  signing, `ensurePlanLicensesTable`, `getOrCreatePlanLicense` (stable per
  user/track/plan), `verifyCode`. Code format
  `TVMS-<PLAN>-XXXX-XXXX-YY` (YY = 2-char HMAC check).
- **`functions/api/license-pdf.ts`**: subscription branch now mints/reuses the
  code and prints it (label `LICENSE CODE`); meta shows Type / Plan / Valid
  until (from `subscriptions.current_period_end`). New admin-only `?code=`
  branch opens any customer's subscription certificate; `?order=` relaxed so
  admins can open any buyer's one-time certificate (customers still only their
  own).
- **`functions/api/admin/licenses.ts`**: returns one-time AND subscription
  licenses unified with a `kind` field, newest first, still `?q=` searchable.
- **`src/pages/Admin.tsx`**: Licenses table gained Kind / Plan / Issued / Valid
  until columns; each code links to its PDF (`?order=` or `?code=`).
- **`migrations/0001_init.sql`**: `plan_licenses` table + indexes (also created
  lazily at runtime).
- **`functions/api/_utils.ts`**: `LICENSE_SIGNING_SECRET` added to `Env`.
- **Verified**: code gen + signature round-trip (valid ✓, tampered ✗, wrong
  secret ✗) unit-tested; subscription PDF re-rendered with a real code, qpdf
  clean, no layout overlap.
- **OWNER STEP:** set `LICENSE_SIGNING_SECRET` in Cloudflare Pages →
  Settings → Environment variables (any long random string) so the HMAC check
  is meaningful, then redeploy. Without it codes still generate and store
  (admin lookup works), the signature is just not owner-specific.
