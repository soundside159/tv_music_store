# TV Music Store — Site Overview (read this end to end)

A plain-language "mini book" of the whole product, so you can check every part and
decide what to adjust. Written for the owner. Reflects what's built as of July 2026.

---

## 1. What this is

TV Music Store is a boutique **royalty-free / production-music** store. Creators
come, find a track, download it, and get a **License Certificate (PDF)** proving
they're allowed to use it. Money comes from **subscriptions** (recurring) and
**one-time licenses** (per track). Music is supplied by a small set of **composers**
(3 to start). The whole thing runs on Cloudflare (Pages + D1 database + R2 storage),
with Stripe for subscriptions and PayPal for one-time sales.

Who it's for: YouTubers, filmmakers, editors, agencies, podcasters, game/app makers
— anyone who needs music they can legally use in their content.

---

## 2. The user's journey (start to finish)

1. **Discover** — lands on the homepage or a track page (often from YouTube/Google).
   Browses the **Music Library** (`/catalog`), **Collections**, **Playlists**,
   filters by genre / mood / use-case, previews tracks in the player.
2. **Sign up** — to download, they need a free account (email code, email+password,
   or Google). Signing up = the first step into the funnel.
3. **Welcome email** — one branded email explains how it works and what upgrading
   unlocks.
4. **Download** — they download a track. Every download comes with a **License
   Certificate (PDF)** — their proof of the right to use it.
5. **Use it** — within their plan's scope (see Plans). On the Free plan they must
   credit TV Music Store.
6. **Hit a wall → upgrade** — free has limits (e.g. 3 downloads/month, no WAV/stems,
   no channel whitelisting). Wanting more nudges them to a paid plan, or to buy a
   one-time license for a single project.
7. **Content ID peace of mind** — if a YouTube Content ID claim lands on a licensed
   use, they resolve it (via their certificate, or channel whitelisting on paid
   plans — see §6).
8. **Come back** — we email them about new releases that match their taste, they
   upgrade/renew, and reuse the library.

---

## 3. What a customer can do on the site

- **Browse & preview**: Music Library, Collections, Playlists, search, filters,
  a persistent audio player that keeps playing across pages.
- **Track page**: details, license options, add to cart, download.
- **Account area** (`/account`):
  - **Profile** — name, email.
  - **Notifications** — choose which emails they get (marketing vs. other).
  - **Plan & Billing** — current plan, upgrade, manage billing.
  - **Whitelisting** — add YouTube channels (paid plans) for Content ID clearing.
  - **Licenses** — every track they've licensed, with PDF certificate + receipt.
  - **Downloads** — download history, re-download, get a plan license PDF.
  - **Copyright Claims** — track the status of claim removals they've asked for.
- **Cart & checkout**: one-time license purchases via PayPal.
- **Sync / Custom** pages: request sync licensing or custom/adapted music.

---

## 4. Plans & licenses (what they get)

### Subscriptions (recurring, Stripe)
- **Free** — personal, non-commercial use; YouTube & social; must credit us;
  limited downloads; no WAV/stems; no whitelisting.
- **Pro** — monetized content on all platforms, one channel/brand, WAV/stems,
  channel whitelisting (a few channels), no attribution required.
- **Max** — commercial & client work, paid ads & broadcast, multiple channels/brands,
  more whitelist channels.

### One-time licenses (per track, PayPal)
- **Personal** — personal, non-commercial projects.
- **Commercial** — client & commercial use in one online project.
- **Professional** — adds TV/radio/film broadcast and games/software, one project.

### Key promises
- **Perpetual**: a license never expires for the project it was used in. Cancelling
  a subscription doesn't invalidate videos you already published while subscribed —
  it only stops you licensing new tracks.
- **Certificate**: every license has a PDF with a unique License Number, the track,
  licensee, scope (permitted / not permitted), and a YouTube Content ID note.
- **Non-exclusive**: the same track can be licensed to others; you can't resell or
  redistribute the music itself.

(Full legal wording lives on `/license-terms`, drafts in `docs/`.)

---

## 5. The License Certificate (PDF)

Generated on demand, branded: dark header with logo + your gold seal, a big
**License Number**, license details (payment reference, issued date, order, type),
licensed-to (name/email), licensed track (title, composer, track-page link), a
**scope** line, **PERMITTED / NOT PERMITTED** lists, a **YouTube Content ID** box,
and a footer referencing License Terms v1.0. Two identifiers: the License Number
(what the customer quotes) and a payment reference (ties to the PayPal/Stripe
transaction). Subscription certificates carry a signed, verifiable code
(`TVMS-YYYY-MMDD-XXXX`).

---

## 6. YouTube Content ID (the big differentiator)

Our catalog is protected in YouTube's Content ID system, so unlicensed use gets
claimed. For legitimate customers we clear claims two ways:
- **Subscription plans → channel whitelisting**: the customer adds their channel(s)
  in their account (up to a per-plan limit). While their subscription is active, we
  clear Content ID claims on those channels' videos that use our music. Videos
  published after they cancel aren't covered.
- **One-time / single claim**: they send us their License Number + video link and we
  release that specific claim.

In the **admin**, you see whitelisted channels and (with a YouTube API key) can pull
each channel's new videos to clear claims. (Improvements to this workflow are
planned — see `NEXT_STEPS.md`.)

---

## 7. Emails the customer receives

- **Login code** — to sign in (this is also the registration confirmation).
- **Welcome** — once, on sign-up.
- **Campaign** — marketing about new releases, only if they opted into the
  newsletter, always with an unsubscribe link. Can be targeted by taste (genre/mood).
(Full detail: `EMAIL_LIFECYCLE.md`.)

---

## 8. What you (owner/admin) can do

Admin (`/admin`):
- **Dashboard / Finance** — overview + money.
- **Catalog**: Tracks, Tracks Edit (bulk), Collections, Playlists, Categories,
  Vocabulary (editable genre/mood/use-case lists), Trending — manage everything the
  storefront shows. "Add Track" uploads audio to R2 and creates the track.
- **Customers** — every registered user; click one to open a **profile**:
  subscriptions, purchases, download **taste** (top genres/moods), whitelisted
  channels, recent downloads.
- **Licenses** — every license issued (one-time + subscription), searchable by code /
  buyer / track; open any certificate PDF.
- **Whitelisting** — customers' whitelisted channels + pull their new videos.
- **Campaigns** — email the newsletter list (optionally by taste) with unsubscribe.
- **Requests** — whitelist/claim/brief requests (some still mock; see NEXT_STEPS).

Deploy = `deploy.bat`. Secrets/bindings in Cloudflare (see `DEPLOY_CHECKLIST.md`).

---

## 9. Composers' side

Music is supplied by composers under a **Composer Agreement** (draft): they warrant
they own their tracks and indemnify us, so the IP risk sits with them. Revenue is
shared (%, TBD). Licensing to us is non-exclusive. There's a composer dashboard and
payout tracking in the backend.

---

## 10. Business & legal framework

- **Entity**: UK general partnership of Stanislav Barantsov & Maryna Huz, trading as
  TV Music Store. Governing law: England & Wales.
- **Payments**: Stripe (subscriptions) + PayPal (one-time). Cards never touch our
  servers.
- **Refunds**: final + a technical-defect window + UK download-waiver at checkout.
- **VAT**: not registered yet (under UK £90k). EU sales will need OSS or a
  Merchant-of-Record (Paddle) later — see `VAT_READINESS.md`.
- **Docs to finalise (drafts in `docs/`)**: License Terms, Privacy Policy, Composer
  Agreement. Fill placeholders (address, effective date), restore live prices, and
  have a lawyer review before public launch.

---

## 11. What's built vs. pending (quick status)

**Built**: catalog/player/collections/playlists, accounts + 3 sign-in methods,
Free/Pro/Max subscriptions (Stripe), one-time licenses (PayPal), certificates (new
design + your seal), subscription license codes + admin lookup, downloads + limits,
channel whitelisting (Phase 1 + on-demand video monitoring), admin CRM customer
profiles, funnel (newsletter capture + welcome email + taste-targeted campaigns),
legal pages (`/license-terms`, `/privacy`), footer redesign.

**Pending / next** (see `NEXT_STEPS.md`, `BACKLOG.md`): whitelist claim workflow
polish (copy/copy-all/handled), header user menu + admin nav cleanup, campaign
batching, purchase/receipt email, filling legal placeholders + live prices, and the
owner setup steps in `DEPLOY_CHECKLIST.md`.

---

## 12. How to review this

Walk each section above against the live site. Where the site doesn't match what you
want, note it — then we (or the next AI) adjust the product and, if the rules change,
update the License Terms + certificate to match.
