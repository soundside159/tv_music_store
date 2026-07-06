# TV Music Store — How the business works (read this end to end)

A plain-language explainer of the whole product: what every promise, page and plan
row actually means, and the logic behind them. Written for the owner, as if someone
were walking you through the business. (Full legal text isn't here — see
`/license-terms` and `/privacy`.)

---

## 1. What TV Music Store is (the model in one page)

It's a **curated library of cinematic / production music** for video creators,
editors, agencies and game developers. Every track is written by a **real composer**
(modern score, thriller, game OST, production music), comes with **alternate
versions**, a **clear license**, a **PDF certificate**, and **YouTube Content ID
protection**.

The money model has three doors:
- **Free plan** — a few downloads a month. This is the hook: it costs us almost
  nothing, captures the customer's email, and turns strangers into a pool we can
  upsell and market to.
- **Subscription (Pro / Max)** — recurring monthly/annual money for unlimited
  access + the good stuff (WAV/stems, commercial rights, channel whitelisting).
- **One-time license** — for someone who needs one track for one project and won't
  subscribe. Bought per track (Personal / Commercial / Professional).

Everything else on the site exists to move a visitor along that path: discover →
sign up → download → hit a limit → upgrade → come back.

---

## 2. The four promises on the homepage — what each really means

**"Content ID protected — every track is registered, claims removed within 24h."**
YouTube's Content ID automatically scans videos and flags ones using our music (a
"claim"). Because our catalog is registered in that system, unlicensed users get
claimed — which protects the music from theft. For **legitimate** customers we
*remove* the claim so their video is clean. "Within 24h" is the service promise: how
fast we clear it. Two mechanisms (see §5): channel whitelisting (subscribers) and
per-video removal via the certificate (one-time buyers).

**"Real composers — three composers, one curated catalog, no AI-generated filler."**
The music is human-made by a small, hand-picked group (3 to start). This is a
trust/quality signal: buyers know it's original, properly owned (the composers
warrant that in the Composer Agreement), and safe to license — not scraped or
AI slop. "Curated" = we choose quality over a giant messy catalog.

**"Versions included — cut-downs and alternate mixes with every track."**
A "cut-down" is a shorter edit (e.g. 15s / 30s / 60s) so a creator can fit the music
to their video length without editing it themselves. "Alternate mixes" = different
intensity versions (e.g. no-drums, underscore, full). This saves creators huge time
and is a big reason to pick a store over random free music. *(Build note: the track
data model supports multiple versions; the upload flow currently creates one "main"
version — multi-version upload is a to-do before real catalog loading.)*

**"License instantly — clear license, PDF certificate right after download."**
The moment they download, they get a **License Certificate (PDF)** — a branded
document proving exactly what they're allowed to do, with a unique License Number.
No lawyers, no waiting. This is their proof if anyone (YouTube, a client, a platform)
questions their right to use the track.

---

## 3. The site map — what each area is for

**Discover / browse**
- **Music Library** (`/catalog`) — the full searchable catalog with a player, filters
  by genre / mood / use-case. The main place people find tracks.
- **Collections** — themed groupings of tracks (curated bundles).
- **Playlists** — ready-made sequences for a vibe/use.

**Licensing (understand + buy)**
- **Pricing & Plans** (`/pricing`) — the Free / Pro / Max comparison + one-time
  license prices. The conversion page.
- **How Licensing Works** (`/licensing`) — a plain table of what each plan/use is
  allowed, plus FAQ. Removes confusion (a common reason people don't buy music).
- **Sync Licensing** (`/sync`) — for one track in one production (film, series,
  trailer, campaign) — the pro/one-off route.
- **Custom Music** (`/custom`) — request a bespoke or adapted track from a composer.

**Company**
- **Contact** (email), **License Terms**, **Privacy Policy** — trust + legal.

---

## 4. The plans, row by row (the core of the business)

Reference table (from the site):

| Feature | Free | Pro | Max |
|---|---|---|---|
| Music downloads | 3 / month | Unlimited | Unlimited |
| WAV format + stems | — | ✓ | ✓ |
| Personal projects & social media | ✓ | ✓ | ✓ |
| Small teams (up to 5 people) | — | ✓ | ✓ |
| Paid ads & sponsored content | — | — | ✓ |
| Client & commercial work | — | — | ✓ |
| Whitelisted YouTube channels | — | 3 | 10 |
| Claim removal within 24h | ✓ | ✓ | ✓ |
| Priority support | — | ✓ | ✓ |

What each row **means** and the logic:

- **Music downloads (3/mo → unlimited).** The Free limit is the main upgrade lever:
  a hobbyist can taste the catalog; a working creator hits 3 fast and upgrades for
  unlimited. Simple, honest friction — not a nag.
- **WAV format + stems (paid only).** Free gives MP3 (fine for YouTube). **WAV** is
  uncompressed, higher quality (for pro editing/mastering). **Stems** are the track
  split into layers (drums, strings, etc.) so an editor can remix/duck parts. Serious
  users need these, so they're a paid unlock. *(Stems delivery is a to-do — see §7.)*
- **Personal projects & social media (all plans).** Even Free can use tracks in
  personal, non-commercial videos and post them on social/YouTube. This is what makes
  Free useful enough to attract people. (On Free they must credit us — that's the
  trade for free music.)
- **Small teams (up to 5).** Paid plans cover a small org/team using one account —
  not just a single solo user. Positions Pro/Max for small studios/agencies.
- **Paid ads & sponsored content (Max).** Using a track in a *paid advertising*
  campaign or sponsored post is a higher-value commercial use → reserved for Max.
- **Client & commercial work (Max).** Making videos *for clients* (agency work,
  paid deliverables) is the top commercial tier → Max. This is where the real B2B
  money is.
- **Whitelisted YouTube channels (— / 3 / 10).** Paid users register their channel(s)
  so we clear Content ID claims on them automatically while subscribed. Pro = up to 3
  channels, Max = up to 10. It's a concrete, sticky benefit that also reduces churn.
- **Claim removal within 24h (all).** Even Free users, if they get a claim on a
  legitimate use, can have it removed — we just do it per-video (they send the link +
  their certificate) rather than via channel whitelisting.
- **Priority support (paid).** Paying customers get faster help. Standard SaaS lever.

**One-time licenses** (not in the table, sold per track) are the alternative for a
single project without a subscription:
- **Personal** — personal, non-commercial.
- **Commercial** — client/commercial use in **one** online project.
- **Professional** — adds TV/radio/film broadcast + games/software, one project.

---

## 5. Content ID & claim removal — the mechanics

This is the store's biggest differentiator, so it's worth understanding fully:

- Our tracks are registered in **YouTube Content ID** (via composers / a rights
  administrator like Identifyy). Any video using them gets an automatic **claim**
  (usually just a monetization/notice flag, not a strike).
- **Subscribers → channel whitelisting.** They add their channel(s) in their account
  (up to the plan limit). While subscribed, we clear claims on those channels' videos
  that use our music. Videos published *after* they cancel aren't covered — but
  anything published while active stays cleared (licenses are perpetual, see §6).
- **One-time / single claim.** They send us the **License Number** from their
  certificate + the video link, and we release that specific claim.
- In your **admin** you see whitelisted channels and (with a YouTube API key) can pull
  each channel's new videos, copy the links, send them to the Content ID provider for
  removal, and mark them done.

---

## 6. The rules that make it fair (and defensible)

- **Perpetual.** A license never expires for the project it was used in. Cancelling a
  subscription doesn't make old videos infringing — it only stops you licensing new
  tracks. (Reduces cancel-anxiety and churn.)
- **Non-exclusive.** The same track can be licensed to many people; you can't resell
  or redistribute the music itself.
- **Attribution.** Required on **Free** (credit us in the description) — that's the
  price of free. Optional on paid plans.
- **The certificate** is the proof of all of the above, per track, per customer.
- **IP stays ours** (and the composers'). Buyers get a limited right of use only.

Full wording is on `/license-terms` — don't rely on this summary for legal.

---

## 7. Honest status — what's real vs. what's still a promise

So you don't over-promise on the site before it's wired:
- **Built:** catalog/player/collections/playlists, accounts (email code, password,
  Google), Free/Pro/Max (Stripe), one-time licenses (PayPal), certificates (new
  design + your seal) with License Numbers, download limits, channel whitelisting +
  admin claim workflow, admin CRM customer profiles, funnel (newsletter + welcome
  email + taste-targeted campaigns), legal pages.
- **Still to build before a real catalog load:** **stems (ZIP) upload + delivery**
  (the "stems" promise), **multiple versions per track** (the "versions included"
  promise — only a single "main" version uploads today), and a **purchase/receipt
  email**. See `NEXT_STEPS.md` / `BACKLOG.md`.
- **Owner setup before public launch:** correspondence address, effective dates,
  restore live prices, social URLs, `YOUTUBE_API_KEY` + `LICENSE_SIGNING_SECRET` in
  Cloudflare, lawyer review of the legal drafts. See `DEPLOY_CHECKLIST.md`.

---

## 8. How to use this doc

Read each section against the live site and your intentions. Where the site claims
something we haven't built (stems, multi-version), either build it (see §7) or soften
the claim until it's true. Where the rules don't match what you want, change the
product first, then update `/license-terms` + the certificate to match.
