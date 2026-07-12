# Revenue split — the rules (and why they are these rules)

This is the spec the code implements (`functions/api/_revenue.ts`) **and** the text the
composer agreement should be built from. Owner-approved, 2026-07-11.

## 1. What gets split: the NET, never the gross

```
Gross            what the customer actually paid
− Tax / VAT      collected for the state — never ours, never split
− Payment fee    Stripe / PayPal, read from the real transaction
= NET REVENUE    →  50% authors  /  50% platform
```

The split percentage is **snapshotted on every payment** (`author_share_bps`, default 5000).
Changing the percentage later must never rewrite what was already earned.

**Why not raise the platform share to "cover VAT":** VAT is not the platform's money and not
the composer's — it belongs to the state. Deducting it *before* the split is honest, easy to
explain, and keeps the headline "50% of net" competitive. Hiding a tax inside the split as a
larger platform cut is the kind of thing composers discover and resent.

## 2. Subscriptions: the money follows the payer (user-centric)

A subscription payment is split **only between the composers that this subscriber actually
downloaded during the cycle he paid for**. It is not thrown into a monthly pool.

**Why this and not a pool (Spotify-style):** the pool model is what made the MotionArray-type
fraud profitable. A composer buys a subscription under a fake account, farms his own tracks,
and because his slice of the pool grows at everyone else's expense, he can extract more than
he paid. Under the user-centric model that same fraudster pays a full subscription and can
win back **at most his own author share of that same subscription** — a guaranteed loss. The
model defends itself; no fraud-detection heroics required.

## 3. Points (what counts as a download)

- **1 point per UNIQUE TRACK per subscriber per cycle.** Re-downloading a track, or taking
  the WAV *and* the stems *and* the MP3 of it, is still **one** point.
- **MP3 128 does not count.** It is the free-tier format; free money is no money, and an
  uncounted format cannot be farmed.
- **A composer's own downloads of his own tracks count for nothing.**
- **Points reset every cycle.** The next invoice opens a new window and the same track can
  earn again.
- Only tracks that have a composer earn; house tracks with no composer leave their share
  with the platform.

## 4. The idle subscriber

A subscriber who pays but downloads nothing in his cycle has no composer to pay. **His author
share stays with the platform** (owner's decision — it must be written in the composer
agreement, because composers *will* ask). It is booked explicitly as
`platform_unallocated`, so the finance report always balances.

## 5. Single-track licenses

Simple: net of tax and fees, 50% to the composer of that track, paid out immediately (there
is no cycle to wait for). A cart with three tracks books three ledger events and pays three
composers.

## 6. Timing

- **Licenses** are allocated at capture.
- **Subscriptions** are allocated when the cycle CLOSES — the points window must be finished
  before the money can be divided (`allocateDue()` runs on every finance report).
- Payouts are made **after** the month closes, so refunds and chargebacks are netted first.
  Recommended hold-back: 30–45 days. Recommended minimum payout: $50 (transfer fees eat
  anything smaller).

## 7. What the tables hold

| Table | What it is |
|---|---|
| `revenue_events` | one row per payment: gross, tax, fee, net, currency, split %, cycle, provider ref (idempotency), status |
| `revenue_allocations` | how each payment was divided: composer, points, amount, month; `kind='platform_unallocated'` for the idle-subscriber share |
| `payout_runs` | per month per composer: amount, due/paid |
| `download_log.quality` | 128 vs 320 — the whole "free format earns nothing" rule depends on it |

Money is stored in **cents, as integers**. The largest-remainder method distributes the last
cents, so a split never invents or loses money.

## 8. Still open (owner decisions / next steps)

**DONE 2026-07-12** — items 1-3 below are built:

1. ✅ **Refunds & chargebacks.** `reverseEvent()` in `_revenue.ts`. Stripe books them
   automatically (`charge.refunded`, `charge.dispute.created`, `charge.dispute.funds_withdrawn`
   → the charge's invoice → the event). PayPal refunds are booked by hand with the **Refund**
   button in Admin → Finance (PayPal issues the money; we only record the reversal).
   The rule: the event leaves the revenue totals; if the composer was **not** paid yet his
   allocation is deleted, and if he **was**, a NEGATIVE allocation is booked into the current
   month — netted off his next payout. **We never take money back out of a composer's account.**
2. ✅ **Composer earnings on live data.** `GET /api/composer/earnings` +
   `src/components/ComposerEarnings.tsx`: lifetime / paid out / ready to pay / clearing, month
   rows (points, amount, paid | payable | held + the date it clears), his tracks by counted
   downloads, and the rules written out in plain language. The old mock table and the fake
   "This month (est.)" card are gone.
3. ✅ **Hold-back + minimum payout** are real settings (`site_config.payout_policy`, defaults
   30 days / $50), editable in Admin → Finance. A month clears `end of month + hold-back`;
   a balance under the minimum rolls over. "Payable now" shows each composer's cleared and
   clearing balance with a one-click **Mark paid** that closes every cleared month at once.
4. **Next:** the MoR / VAT research below.

- **VAT / Merchant of Record — RESEARCHED 2026-07-12.** Paddle rejected the site. The reason is
  almost certainly NOT "music": it is the **marketplace / third-party-IP** clause that every MoR has.

  **Lemon Squeezy** (read their prohibited-products page directly):
  - ✅ **"Audio" is on the ACCEPTABLE list**, next to software, eBooks, design assets, photos, video.
  - ❌ Prohibited: *"Marketplaces — where you use your Lemon Squeezy store to 'partner' to sell
    others' products"*.
  - ❌ Prohibited: *"Products or content for which you do not hold a proper license or intellectual
    property rights"*, and *"any product which you've obtained a license to sell but do not hold the
    original IP rights"* (their PLR/MRR clause).

  **So the decisive question is not the product, it is the CONTRACT.** If the composer agreement
  grants TV Music Store the **right to license the works to end customers**, then TVMS *does* hold
  the rights it sells, it is the licensor named in the License Terms, and the royalty it pays the
  composer afterwards is an internal supplier relationship — like a record label or a
  production-music publisher. If composers merely "list" their tracks and TVMS takes a cut, it is a
  marketplace and every MoR will refuse, correctly.

  ### ⚠️ EXCLUSIVE vs NON-EXCLUSIVE — the owner's real situation (2026-07-12)

  The owner's composers will supply tracks **that are also sold on other stock libraries**
  (non-exclusive). This is NOT the Epidemic Sound / Artlist model — those are exclusive catalogues.
  Three consequences, and none of them may be papered over:

  1. **Legally it is fine.** A non-exclusive licence is still "a proper licence". You can only grant
     what you hold, and you hold the right to license these tracks to customers. Pond5, AudioJungle
     and Musicbed all run non-exclusive catalogues. The customer's licence is valid.
  2. **For the MoR application it is a grey area, and it must be answered TRUTHFULLY.** Lemon
     Squeezy's PLR/MRR clause ("a product you have a licence to sell but do not hold the original IP
     rights") can be read to cover a non-exclusive library. Do **not** claim exclusivity that does
     not exist — a false statement to a payment provider is fraud, and it is the kind of thing that
     surfaces later, at the worst moment, with the money frozen. Say plainly: *"non-exclusive
     licences from contracted composers; TV Music Store is the licensor of record to the customer;
     composers do not sell, price, or hold storefronts here."* If that gets rejected, so be it —
     Stripe Tax is the fallback and it works.
  3. **The MARKETING claims must match reality.** The homepage currently says *"Original, not stock:
     every track is made by one of our own composers... not third-party stock"* and *"we are not a
     reseller, marketplace or aggregator"*. If the same track is also on three other stock sites,
     the first claim is misleading to CUSTOMERS — and customer trust is the whole product here.
     Two honest ways out:
     - **(a) Require exclusivity** for tracks in the TVMS catalogue (the composer may keep selling
       his *other* work elsewhere). This is the strongest position: it protects the brand, it makes
       the MoR question disappear, and it is what a boutique library is *for*. Expect to pay a
       better royalty or an advance for it.
     - **(b) Keep non-exclusive** and rewrite those lines: "hand-picked from working composers",
       "licensed directly, with cue-sheet data and claim removal" — all true, all valuable, no
       claim of uniqueness.
     Pick one before launch. (a) is the better business.

  **Therefore: the composer agreement must exist and grant those rights BEFORE applying anywhere.**
  It is also the document the MoR will ask to see.

  **How to present the business in the application** (this is what got Paddle wrong):
  a boutique **production-music publisher** with an exclusive catalogue under contract; TVMS is the
  licensor of record on every licence; composers are contracted suppliers paid royalties by TVMS —
  they do not sell, do not price, do not have storefronts. Never use the word "marketplace"
  anywhere. (The homepage already says, correctly: *"not a reseller, marketplace or aggregator of
  third-party stock"* — that sentence is an asset, quote it.)

  **FastSpring** is the better first bet for this shape: its MoR model is explicitly *"we purchase
  the product from you and resell it to the end customer"* — which is precisely the publisher
  relationship above — and it serves audio/sample companies (e.g. W.A. Production). It is also a
  human application process rather than an automated policy screen, so the model can be explained.
  Downside: heavier onboarding, and pricing is quoted, not published.

  **Fallback that always works: stay on Stripe + Stripe Tax** (~0.5%). Stripe already accepted the
  site and music licensing is not on its restricted list. The cost is that the owner remains merchant
  of record: registration (EU OSS via an EU-facing route, UK VAT) and filing are his, so budget an
  accountant or a filing service.

  Whichever path wins, the ledger needs no change — `tax_cents` is already stored per payment.
  **This is not tax advice — confirm the registration route with an accountant.**

- **Transactional emails — NOT BUILT.** Today the ONLY email the site sends is the login code
  (`functions/api/auth/request-code.ts`). Missing, in priority order:
  1. **Single-licence purchase** → receipt + the licence PDF attached (the PDF generator already
     exists: `functions/api/license-pdf.ts`).
  2. **Subscription started / renewed** → receipt, what the plan covers, how to whitelist channels.
  3. **Refund issued** → confirmation, amount, what it means for the licence.
  4. **Subscription cancelled** → what stays licensed (projects already published), what stops.
  5. **Payment failed (dunning)** → retry link, before the plan drops to Free.
  Resend is already wired (`functions/api/_email.ts`); the root domain must be verified in Resend to
  send from `contact@tvmusicstore.com`.

- **Customer-side refund flow (how it works TODAY).** There is no self-serve refund button, and that
  is normal for digital goods: the customer emails `contact@tvmusicstore.com` (this is written on
  `/refunds`), the owner refunds in the Stripe or PayPal dashboard, and the reversal is booked here
  (Stripe: automatically by webhook; PayPal: the **Refund** button in Admin → Finance).
  A subscriber can **cancel** himself at any time — Account → Billing → Manage billing opens the
  Stripe customer portal. Cancelling stops future charges; it is not a refund of the current period.
  Nice-to-have later: a "Request a refund" button in Account → Billing that opens a prefilled support
  message, so the customer never has to hunt for the email address.
- **VAT collection.** Two paths: a **Merchant of Record** (Paddle, Lemon Squeezy, FastSpring)
  becomes the seller and handles registration, collection and filing for ~5% — no EU
  registration needed; or **Stripe Tax** (~0.5%) which calculates and collects but leaves you
  as the merchant of record, so you register and file yourself. For a solo boutique with low
  volume, MoR is usually cheaper once your own time is counted. **Confirm with an
  accountant** — this document is not tax advice.
  Note: the ledger already stores `tax_cents` per payment, so either path plugs in.
- **Refunds / chargebacks** — the schema has `status='refunded'`; the reversal logic (undo
  allocations if not yet paid, otherwise carry a negative balance into the next month) is not
  written yet.
- **Composer dashboard on live data** — the earnings screen still shows mock numbers; it
  should read `revenue_allocations`.
- **Payout threshold and hold-back** are policy, not code, today. Add them when real money
  starts moving.
- `composers.revenue_weight` exists (a per-composer multiplier). Leave it at 1.0 — weighting
  some composers above others is hard to defend and easy to leak.
