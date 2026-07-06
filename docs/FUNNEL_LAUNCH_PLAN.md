# TV Music Store — Funnel Launch Plan (step by step)

> The actionable sequence for turning the site into a customer machine. Companion
> to `GROWTH_FUNNEL.md` (strategy). This one is "do this, then this".
> Legend: **[build]** = code, **[content]** = make assets, **[ops]** = account/manual.

## The one number

Track **Free signups → paid conversion %** and **new MRR**. Everything below exists
to move those two. Pick a first target, e.g. 100 signups/month and 3–5% → paid.

---

## Phase 0 — Foundations (before driving any traffic)

Don't send traffic to a leaky bucket. Finish these first:

1. **[build]** Welcome email on signup (Resend already wired) — see Phase 2.
2. **[build]** Newsletter capture (footer + a homepage strip) → store emails, with
   unsubscribe. Needed both for leads and GDPR compliance (Privacy Policy already
   promises opt-out).
3. **[ops]** Legal live: publish `/license-terms` + `/privacy` (pages built), add
   the correspondence address, restore live prices.
4. **[ops]** Payments verified end-to-end (Stripe + PayPal live keys), certificate
   emails/downloads working.
5. **[content]** 8–12 strong tracks with clean titles, tags (genre/mood/use-case),
   cover art, and previews. Quality over quantity at launch.

Exit criteria: a stranger can land → preview → sign up → download → get a
certificate → receive a welcome email, with no dead ends.

---

## Phase 1 — Acquisition (get the right strangers)

Prioritized by fit for this niche. Do 1–2 well, not all six poorly.

1. **[content] YouTube channel = the #1 channel.** Upload tracks (or 1-min
   previews) over simple visuals; every description links to the track page and to
   "download free". Creators literally search YouTube for music. This compounds.
2. **[build/content] Track-page SEO.** Each page targets "<mood/genre> royalty-free
   music" and "music for <use case>" (trailers, vlogs, ads, gaming). Fast pages,
   good titles/meta, sitemap. Slow but compounding organic traffic.
3. **[content] Free tools / helper pages** (the tunetank playbook): small utilities
   creators search for (a YouTube tag/description helper, a "Content ID claim
   explainer"). They rank and funnel to signup.
4. **[ops] Composer cross-promo.** Our 3 composers post/collab to their audiences —
   pre-qualified fans.
5. **[content] Short-form** (YT Shorts / Reels / TikTok): 15–30s track clips over
   stock video, link in bio.
6. **[ops] Communities** (Discord/Reddit/creator forums) — be useful, not spammy.

---

## Phase 2 — Capture & Activate (visitor → engaged account)

1. **[build]** Gate downloads behind a free account (already the model) — the
   download IS the signup.
2. **[build]** **Welcome email** (send once on account creation): thank them,
   1-2-3 of how licensing works, attribution note (Free), and what upgrading
   unlocks (unlimited, WAV/stems, whitelisting). One clear CTA.
3. **[build]** Make the first download frictionless; surface the **certificate** +
   "we clear Content ID claims" — this trust signal is our biggest differentiator
   vs. random free music.
4. **[build]** Newsletter opt-in at signup (checked-by-default is not allowed under
   GDPR — use a clear opt-in) so we can market later.

Activation metric: % of signups who complete a first download within 24h.

---

## Phase 3 — Convert (free → paid)

Convert with **friction upgrading removes**, shown at the moment of need — not nags:

1. **[done]** Free download limit (3/month) + "Upgrade for unlimited" in the
   download modal.
2. **[build]** Paid-only unlocks surfaced contextually: WAV + stems, no attribution
   required, and **channel whitelisting** (built) — show these on the track/pricing
   pages and when a Free user hits a wall.
3. **[build/ops]** One-time **sync licenses** for people who need one track once and
   won't subscribe — capture that intent too (already have tiers).
4. **[content]** Keep pricing/licensing dead simple (pages exist).

Conversion metric: free→paid % and time-to-convert.

---

## Phase 4 — Retain & Expand (where the profit is)

1. **[build] Taste-segmented new-release emails** — the payoff of the CRM: segment
   customers by the genres/moods they download (already visible in the customer
   profile) and email them relevant new tracks/albums (epic fans → new epic album).
   Needs the campaign sender + unsubscribe.
2. **[build]** Plan upgrade prompts (Pro→Max) when needs grow (client work, more
   channels).
3. **[build]** Win-back email for cancelled subscribers.
4. **[msg]** Lean on the perpetual-license promise ("keep your licenses forever")
   to reduce cancel anxiety and churn.

Retention metrics: churn %, repeat-purchase rate, LTV.

---

## Build vs. content vs. ops — what code is actually needed

- **[build] Welcome email** on signup (Resend). — small
- **[build] Newsletter list** + capture UI + unsubscribe endpoint. — small/medium
- **[build] Campaign sender** (admin): pick a taste segment → send via Resend, with
  unsubscribe links + send log. — medium (the CRM already gives the segments)
- **[build] SEO polish** on track pages (meta/sitemap). — small/medium
- Everything else in Phases 1 is **content/ops** (YouTube, tools, composer promo).

Suggested code order: Welcome email → Newsletter capture + unsubscribe → Campaign
sender. That gives a full lifecycle: capture → activate → market → convert.

---

## First 30 days (concrete sequence)

1. Week 1: finish Phase 0 (welcome email + newsletter capture + publish legal +
   verify payments + restore prices).
2. Week 1–2: launch the YouTube channel with the first 8–12 tracks; link every
   description to its track page.
3. Week 2: turn on SEO basics (titles/meta/sitemap) for track pages.
4. Week 3: first free tool / helper page for organic traffic.
5. Week 3–4: build the campaign sender; send the first taste-segmented new-release
   email to whoever has signed up.
6. Ongoing: watch signups → activation → conversion weekly; double down on the
   acquisition channel with the best LTV.
