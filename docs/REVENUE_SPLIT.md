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

- **VAT collection — NEXT TASK (2026-07-12).** ⚠️ **Paddle REJECTED the site** (reason not given;
  likely their policy on marketplaces / reselling third-party creators' content — a royalty-free
  music library with multiple composers is exactly the shape MoRs get nervous about). So:
  1. Read the actual acceptable-use / prohibited-business terms of **Lemon Squeezy** (Stripe-owned)
     and **FastSpring** — specifically: do they allow (a) digital music/audio licensing, (b) a
     platform paying out third-party creators, (c) subscription + one-time mixed.
  2. Check the fallback: **Stripe Tax** (~0.5%) — Stripe already works here and did not object;
     the cost is that the owner stays merchant of record and must register/file (EU OSS or a
     provider). Compare total cost incl. the owner's time and an accountant's fee.
  3. Consider a third shape: keep Stripe as the processor, add a tax-compliance service on top
     (e.g. a filing agent) instead of a full MoR.
  Whichever path wins, the ledger needs no change — `tax_cents` is already stored per payment.
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
