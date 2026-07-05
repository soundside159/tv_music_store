# TV MUSIC STORE — AI Working Context & Progress Log

> **Read this file first.** It is the living handoff for any AI assistant working on this
> project. It tells you (1) how the project works, (2) the current state, and (3) the rules.
> **After you make changes, append them to the "Progress Log" at the bottom of THIS file**
> so the next session can continue seamlessly. The owner re-feeds this file to each new chat.

---

## 1. Project

- **Name:** TV Music Store — cinematic / production-music licensing site (boutique, one composer).
- **Live site:** https://tvmusicstore.com
- **GitHub:** https://github.com/soundside159/tv_music_store
- **Hosting:** Cloudflare Pages, auto-deploys from branch `main` on every push.
- Most active work right now is the **`/catalog` Music Library** page.

## 2. Stack (fixed — do NOT migrate)

React 18 + TypeScript + Vite + Tailwind CSS v3 + shadcn/ui + Framer Motion + React Router + TanStack Query.
Icons: lucide-react. **Do NOT** switch to Next.js / WordPress / Supabase. Use **npm** (not Bun).

## 3. How to run / deploy

```bash
npm install
npm run dev        # local dev
npm run lint       # must pass with 0 errors (warnings are OK)
npm run build      # vite build (no tsc step in the script)
```
Deploy = push to `main`. The repo has **`deploy.bat`** (Windows) which does: git pull --ff-only →
lint → build → git add/commit → git push. Cloudflare then builds ~1-3 min; hard-refresh site (Ctrl+F5).
GitHub auth is configured on the owner's Windows machine — never ask for tokens in chat.

## 4. Ground rules

- Keep changes scoped; follow existing Tailwind / shadcn patterns.
- Never commit secrets, `.env`, tokens, or private master WAV/ZIP audio.
- Full architecture/spec: `AGENTS.md` and `docs/TVMUSICSTORE_MASTER_PLAN.md`. Update `AGENTS.md`
  when routes/services/data/deploy change.
- Note: some source files have mixed CRLF/LF line endings; make targeted edits (don't rewrite
  whole files) and verify `npm run lint` after each change.

## 5. Design system (current)

- **Gold accent color: `#F4C430`** (warm gold). Used for all active/hover/play/waveform accents.
  If the owner wants to retune gold, replace `#F4C430` (and rgba `244,196,48`) across `src/`.
- **Fonts:** Inter for all UI/body; **Playfair Display** (serif) for display headings via
  `--font-display` / `font-display` class. (Cinzel was removed.)
- Palette: dark graphite / white / gold. No cyan/blue accents anymore.

## 6. Key files

- `src/pages/Catalog.tsx` — Music Library page: hero, collection cards, filters, track list,
  waveform player, bottom mini-player. **Most logic lives here.**
- `src/components/WaveformPreview.tsx` — decodes MP3 previews, draws SVG waveform, click-to-seek.
  Played bars are gold `#F4C430`; unplayed bars uniform grey (opacity 0.55).
- `src/components/Navigation.tsx` — fixed header (logo, nav links, account + cart icons).
- `src/pages/Login.tsx` — `/login` sign-in form (UI only).
- `src/data/catalogTracks.ts` — temporary track data (2 real tracks, 6 MP3 preview versions).
- `src/data/musicCollections.ts` — collection cards metadata.
- `src/index.css` — design tokens + `.music-track-grid` (track row grid) + entrance keyframes.
- `src/assets/cinema-hero-wide.png` — hero background photo (cinema hall, ~1983x793).
- `public/audio/previews/` public MP3s; `public/images/collections/` collection covers.

### `.music-track-grid` (in `src/index.css`)
Track rows use an 8-column CSS grid (≥1280px): play / title / **tags(1fr)** / versions /
**waveform (fixed, flexes)** / duration / bpm / **actions**. Waveform width is fixed
(`--track-waveform-col` 18rem→28rem); the title↔versions gap and waveform share leftover space.
Actions column width = `--track-actions-col`.

## 7. Current state of `/catalog` (implemented)

**Hero:** full-bleed cinema background (`cinema-hero-wide.png`), fixed pixel size so it does not
zoom on window resize (`backgroundSize: "2200px auto"`, `backgroundPosition: "100% 48%"`), left
side darkened for text. Eyebrow "Discover"; title "**Premium** Music Library" (Premium in gold,
one line). Hero is static — does NOT change when a collection is selected.

**Collections strip:** parallelogram cards (skewX -9deg), portrait ~180x256, image fades in on
load, gold top-rim + bottom-center glow + warm pool when selected (appears ~75ms after the lamp,
"light from below" feel). Under each card a small amber LED dot: grey when idle, `#F4C430` (glowing)
when selected, centered under the skewed card. Header has "View all collections →" + prev/next
round buttons. No arrow icon on cards.

**Filters sidebar (left):** collapsible groups. **Use Case** open by default; **Genre**, **Mood**
collapsed. "Clear all" appears (right of "Filters") when any filter is active.
- Use Case: Movie Trailer, Film & TV, Documentary, Advertising, Crime & Thriller, Business,
  Video Game, Sports, Technology, Travel, Nature, Luxury.
- Genre: Neo-Classical, Action, Drama, Dark Score, Sci-Fi, Fantasy, Horror.
- Mood: Emotional, Powerful, Inspiring, Suspenseful, Aggressive, Tense, Heroic, Hopeful, Uplifting, Beautiful.

**Search + Sort:** search input (visible border, animates to gold on focus, no extra focus ring).
Sort dropdown: Featured / New / Popular (New = reversed, Popular = by BPM).

**Track rows:** play button with circular **progress ring** (gold, 0-100%) when playing; title +
play + duration/BPM turn gold when playing/hover. Between title and versions: 3 pills showing one
random-but-stable value from Use Case / Genre / Mood. "versions +N" button (no border; gold
underline when expanded, gold text on hover) toggles alternate versions (NOT auto-open on load;
clicking waveform does NOT open versions). Actions (right, each with hover tooltip above):
**Favorite** (heart) · **Similar Tracks** (copy icon) · **Buy License** (cart) · **Download**.
Alternate-version rows: Buy License + Download.

**Bottom mini-player:** distinct `bg-card/95` bar. Play (with progress ring) · track title (gold
when playing) · version label · waveform (shortened, gap before time) · time `0:00/2:06` · BPM ·
**volume slider** · Favorite · Buy License · Download. Volume is perceptual via Web Audio GainNode:
slider default 0.8 = 100% loudness, below fades correctly, above ~0.8 boosts up to ~x1.5 (fallback
to element volume if Web Audio unavailable). Waveform seek paints exactly to click position
(clicking left un-paints to the right); no double-blink on seek/track-switch.

**Page load animation (easeOutExpo):** sections enter in order — breadcrumb → hero → collections
→ filters (slide in from left) → track-list block (fade) → track rows stagger up last. CSS
keyframes in `index.css` (`rise-in`, `slide-in-left`, `fade-in`); re-runs on each visit to /catalog.

**Header:** removed "Contact" and "Get Started". Added account icon (→ `/login`) and cart icon.
Breadcrumb: no "TV" tile; "Home" and "Music Library" are clickable, gold on hover.

## 8. Known pending / TODO

- **Global persistent player — DONE.** Single engine + `<audio>` + persistent bottom bar live in
  `src/components/PlayerProvider.tsx` (mounted in `App.tsx` around `<Routes>`); context/hook in
  `src/components/playerContext.ts` (`usePlayer`). Catalog and `TrackRowList` (home/collections/
  playlists) all consume the shared player, so music keeps playing across page navigation.
  `src/pages/TrackDetail.tsx` is also wired to the global player now (its play buttons feed the
  shared engine; a thin local wrapper still tracks the selected version per track for display).
- **IMPORTANT — backend IS largely built** (this file previously under-stated it). See `functions/api/*`
  (Cloudflare Pages Functions), `migrations/0001_init.sql` (D1 schema), `src/hooks/useAuth.ts`,
  and `docs/SETUP_BACKEND.md`. Working: Google OAuth + email-code auth, sessions, `/api/me`,
  `/api/tracks` (D1), `/api/admin/users`, `/api/health`, Resend login emails. D1 schema is broad
  (subscriptions, download_log, composer payouts, sync orders, etc.).
- **Frontend still reads mock `src/data/catalogTracks.ts`, NOT `/api/tracks`.** Wiring catalog /
  track / collections to the live API is the main open gap.
- No `/api/download` + R2 delivery/gating yet (table `download_log` exists).
- No Stripe/checkout/webhook functions yet (tables `subscriptions`/`plan_config` exist).
- Cart / Download / Favorite / Similar Tracks buttons are still UI placeholders.
- Confirm exact gold hex with owner (`#F4C430` is an estimate from a screenshot).
- NOTE: this repo is large and evolving (another AI added many pages/backend). Re-scan
  `functions/`, `migrations/`, `src/pages/`, `src/hooks/` before assuming what exists.

## 9. How to continue (for the next AI)

1. Read this file, then `AGENTS.md`, then `docs/TVMUSICSTORE_MASTER_PLAN.md` if you need depth.
2. Make scoped edits, run `npm run lint` (0 errors).
3. **Append a dated entry to the Progress Log below** describing what you changed and any new
   pending items. Keep sections 5-8 above updated if the design system / state changes.
4. Owner deploys via `deploy.bat`.

---

## Progress Log

- **2026-07** — Catalog redesign session: fonts (Inter + Playfair), gold accent unified to
  `#F4C430`, hero cinema background, parallelogram collection cards + amber LEDs, collapsible
  filters + Clear all + new Use Case/Genre/Mood lists, sort dropdown, waveform recolor + seek fix,
  play progress rings, per-track Use Case/Genre/Mood pills, action icons (Favorite/Similar/Buy/
  Download) with tooltips, perceptual volume slider, staggered page-load animation, header
  account/cart icons + `/login` page. Pending: global persistent player (see §8).
- _(next AI: add your entry here)_
- **2026-07-04 (global player):** lifted the audio engine into a global `PlayerProvider` above the
  router; extracted `playerContext.ts`; added volume control to `useTrackAudioEngine`; removed the
  duplicate inline engine + bottom bar from `Catalog.tsx`; switched `TrackRowList` to the shared
  player. Bottom mini-player now persists and keeps playing across pages. TrackDetail's own player
  is still independent (pending).
- **2026-07-04 (unify player):** Navigation header links were plain `<a href>` (full page reload
  killed playback on nav) -> switched to `<Link>`. Wired `TrackDetail` to the global player too.
  Player is now single/global across the whole site. Minor leftover `<a href>` in AuthModal /
  NotFound (rare, non-critical).
- **2026-07-04 (catalog -> live API):** decoupled the player from mock data (engine now stores the
  active track/version objects; PlayerProvider reads those instead of looking up catalogTracks).
  Extended /api/tracks to return collection_ids. Added src/hooks/useTracks.ts (fetch /api/tracks ->
  map to CatalogTrack, fallback to mock catalogTracks when API is down or DB empty). Wired Catalog
  to useTracks(). Still on mock (to convert next): TrackDetail, Index, CollectionDetail,
  PlaylistDetail — they still import catalogTracks directly.
- **2026-07-05 (real downloads):** new `functions/api/download.ts` — POST, session required,
  enforces plan gates (Free: 3 mp3/month via download_log count; WAV only for Max), logs every
  download to `download_log`, streams the file (R2 `r2_key_wav` for WAV when the bucket is bound;
  otherwise fetches the public preview mp3 same-origin; mock-catalog fallback accepts client `src`
  only if it matches `/audio/previews/*.mp3`). Frontend: `src/lib/downloadTrack.ts`
  (`downloadTrackVersion` + sonner toasts: 401 → dispatches `tvms:open-auth` which Navigation
  listens for to open AuthModal; `limit`/`plan` codes → toast with "See plans" action). Wired all
  Download buttons: TrackRowPlayer main row + alt versions, PlayerProvider mini-player. Also added
  `cache-control: no-store` to the API `json()` helper (stale cached /api/health confused us), R2
  typings in `_utils.ts` Env, and fixed two pre-existing tsc errors from the last session: missing
  `useRef` import in Catalog.tsx (runtime crash risk) and missing `styleOf`/`priceFrom` in
  useTracks mapTrack. Pending: Account → Downloads history for live users (useMyDownloads returns
  [] when authed — needs a /api/me/downloads endpoint), R2 bucket binding + master uploads, Stripe.
- **2026-07-05 (auth UX + logo):** Google OAuth now returns to the page the user started from
  (`?next=` → `tvms_oauth_next` cookie, validated, cleared on callback); download clicked as guest
  is stored in sessionStorage and auto-resumed after any sign-in (resume hook lives in
  Navigation). Fixed Cyrillic mojibake in Google names (id_token payload now decoded as UTF-8);
  existing users get their name re-synced from Google on next login. New brand logo:
  `public/logo.svg` (gold soundwave→play, #F4C430) + regenerated `public/favicon.ico`, favicon
  links added to index.html, logo image added before the wordmark in Navigation.
- **2026-07-05 (tunnel alignment):** owner's canon: the HOME content width (`max-w-7xl`) is the
  "100% tunnel". Navigation header container and the bottom mini-player are now `max-w-7xl` so
  header icons/logo line up with home content and never jump between pages. Catalog: at
  `min-[1800px]` the main container becomes `max-w-7xl`, the content column (hero, search, tracks)
  is centered on the SCREEN at tunnel width, and FilterSidebar is absolutely positioned to the
  LEFT of the tunnel (outside it, not counted in centering); hero indent removed at that width.
  Below 1800px there is no horizontal room for that, so the previous sidebar+content grid inside
  `max-w-[92rem]` is kept as fallback. Logo: owner wants his exact PNG instead of the redrawn
  logo.svg — waiting for him to drop `logo.png` into `public/`; then switch Navigation img,
  favicon links (index.html) and regenerate favicon.ico from it.
- **2026-07-05 (download history):** new GET `/api/downloads` (user's last 100 download_log rows,
  LEFT JOIN tracks for titles, slug prettified as fallback). `useMyDownloads` now fetches it for
  live sessions (mock personas unchanged); `DownloadLogEntry` gained optional `trackTitle`;
  Account renders `d.trackTitle ?? trackTitle(d.trackId)`. Account → Downloads + Overview recent
  list now show real history. "Re-download" button is still a placeholder. NEXT BIG STEP: Stripe
  (waiting for the owner to register stripe.com and add STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
  to Cloudflare), then admin Content editor per PAGES_SPEC 4.1.
- **2026-07-05 (admin content editor, phase 1):** Admin -> "Content" section (replaces the mock
  Playlists module) = `src/components/AdminContent.tsx` + `functions/api/admin/content.ts` +
  auto-generated `functions/api/admin/_seed_data.ts`. Tabs: Collections / Playlists / Trending.
  Live CRUD against D1 (upsert/delete collections & playlists, set_tracks membership with click
  order, set_trending -> site_config key trending_track_ids; site_config table is created lazily).
  Track picker has inline preview via the global player. "Load demo catalog into DB" button
  (action seed_catalog, idempotent) copies the 16 mock tracks + versions + 7 collections into D1 —
  after that /api/tracks serves real rows and the catalog switches off mock fallback by itself.
  NOT DONE YET (next steps): (1) public pages still read mock collections/playlists/trending —
  need public endpoint(s) (/api/content or extend /api/tracks) + wire Index (Trending block),
  Catalog collections strip, Collections/CollectionDetail/Playlists/PlaylistDetail pages;
  (2) cover image UPLOAD needs an R2 bucket binding (R2) + small /api/admin/upload — currently the
  form takes an image URL/path only; (3) tags (use case / genre / mood) editing per track — spec
  4.1. Stripe still waiting for owner registration.
- **2026-07-05 (storefront -> live content):** new public GET `/api/content` (collections,
  playlists, trending — what Admin -> Content edits) + `src/hooks/useContent.ts`
  (`useCollections`, `useTrendingTracks`; module-level fetch cache, mock fallback when API down
  or DB empty). Wired: Index "Trending tracks" block (admin-picked order, fallback first 8),
  Catalog (activeCollection lookup + collections strip), Collections page, CollectionDetail
  (tracks now from useTracks too). STILL ON MOCKS: Playlists / PlaylistDetail pages (wire to
  /api/content playlists next), TrackDetail (still imports catalogTracks directly) — UPDATE same
  day: DONE. Playlists + PlaylistDetail use usePlaylists() (live /api/content, slug=id for live
  rows, mock fallback), TrackDetail + PlaylistDetail use useTracks(). The whole storefront now
  follows Admin -> Content edits. Also pending:
  cover upload via R2, per-track tag editing (spec 4.1), Stripe (owner registration).
- **2026-07-05 (R2 + panel images prep):** owner created R2 bucket **tvmusicstore-files**
  (public access disabled — correct). NEXT AI: (1) tell owner to bind it in Pages: Workers &
  Pages -> tv_music_store -> Settings -> Bindings -> Add -> R2 bucket, variable name **R2**,
  bucket tvmusicstore-files, then deploy; (2) build `/api/admin/upload` (admin-only PUT image ->
  R2 key covers/...) + public `/api/file/[[path]].ts` serving R2 objects, wire an Upload button in
  AdminContent cover field; (3) later WAV masters go to R2 keys stored in
  track_versions.r2_key_wav (download.ts already reads them). Homepage 3 panel cards now take
  background images from `/images/panels/{catalog,collections,playlists}.png` (800x168, graceful
  if missing) — owner will drop the PNG files into public/images/panels/ himself; lucide icon in
  those cards is hidden when backgrounds land (class "hidden").
- **2026-07-05 (Stripe + R2 uploads):** STRIPE IS CODED. `functions/api/stripe/`: `_stripe.ts`
  (REST client via fetch, webhook HMAC verify, upsertSubscription — lazily adds
  subscriptions.stripe_customer_id), `checkout.ts` (POST {plan,interval} -> Checkout URL;
  products/prices auto-created on first call and cached in plan_config.stripe_price_*),
  `webhook.ts` (checkout.session.completed, subscription.updated/deleted, invoice.payment_failed
  -> subscriptions table; deleted -> plan 'free'), `portal.ts` (billing portal URL).
  Frontend: `src/lib/billing.ts` (startCheckout/openBillingPortal, 401 -> tvms:open-auth);
  Pricing cards wired (Select plan -> checkout, current -> portal, free -> catalog/login);
  Account: Manage billing button (Overview) + Billing section wired to portal (placeholder gone).
  No publishable-key/Stripe.js needed (redirect via session.url). R2 UPLOADS: `POST
  /api/admin/upload?filename=` (admin, raw image body, 8MB max -> covers/<name>-<uuid>.<ext>),
  `GET /api/file/[[path]]` (serves ONLY covers/ + images/ prefixes — never audio masters),
  Upload button next to cover URL field in AdminContent. health.ts now also reports
  stripe_webhook + r2. Panel images renamed to public/images/panels/{catalog,collections,
  playlists}.png (were "catalogue (final).png" etc). OWNER STEPS PENDING: (1) STRIPE_SECRET_KEY
  secret in CF (live /api/health said stripe:missing before this deploy), (2) R2 binding var R2 ->
  tvmusicstore-files, (3) after deploy create webhook in Stripe dashboard -> STRIPE_WEBHOOK_SECRET
  secret, (4) test-mode card 4242... end-to-end test. NOTE: sandbox<->host file sync glitched this
  session (5 edited files truncated sandbox-side); host files verified whole; lint 0 errors.
- **2026-07-05 (track page + cart + PayPal):** live /api/health confirmed stripe:configured,
  r2:bound (webhook secret still pending on owner). NEW single-track licensing (owner-approved
  prices): Personal $29 / Commercial $89 / Professional $249 — `src/lib/licenses.ts` (tiers,
  formats, Usage Terms lists) + server copy in `functions/api/paypal/_paypal.ts` (NEVER trust
  client prices). TrackDetail fully redesigned tunetank-style: left card = square cover
  PLACEHOLDER (real artwork comes later with track upload; recommend 1000x1000 covers) + title/
  author/duration/BPM + play/heart/share + gold Download + tag pills + About; right = 3 license
  tier cards -> Usage Terms grid -> price + Add to Cart; below: main waveform card + Versions/
  Similar tabs (License tab removed — old $39/$99/$299 tiers deleted). CART: `src/hooks/useCart.ts`
  (localStorage tvms_cart_v1, one line per track, tier switch replaces), `/cart` page (tier
  dropdowns, order summary, PayPal Buttons via JS SDK; graceful "checkout being set up" note when
  PayPal env vars absent), Navigation cart icon -> /cart with count badge. PAYPAL backend:
  /api/paypal/config|order|capture; order validates+prices items server-side, custom_id=user id;
  capture re-reads the order, captures, writes rows to sync_orders (tier=personal|commercial|
  professional, stripe_session_id column = PayPal order id, idempotent per order). Env (in
  _utils.ts): PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV (live default | sandbox). OWNER: has a
  UK PayPal used for stock payouts — needs Business upgrade + REST app on developer.paypal.com,
  then add the two secrets. TODO NEXT: (1) Download-options modal like tunetank (MP3 128/320,
  WAV=Max, STEMS=Max, "Include PDF license", "N of 3 free downloads left") replacing direct
  download on click; (2) square cover upload (1000x1000) when adding tracks + auto thumbnails,
  show real art on TrackDetail/cart/rows; (3) Account -> Licenses should list real sync_orders
  purchases (still mocks); (4) license PDF generation after purchase. WARNING for AI: cowork
  sandbox<->host sync truncates EDITED files sandbox-side this machine; after editing, re-push
  file content into the sandbox via heredoc before trusting lint.
- **2026-07-05 (email polish + task backlog):** Stripe subscriptions CONFIRMED WORKING end-to-end
  in test mode (owner paid with 4242, plan appeared in Account — webhook is live). Owner added
  PAYPAL_CLIENT_ID/PAYPAL_SECRET but /api/paypal/config still said configured:false — vars need a
  fresh deploy to apply; told him to check names + redeploy. Login-code email improved: reply_to
  removed from sendEmail (pure no-reply), dark footer added with "Need help? Contact us at
  contact@tvmusicstore.com" + copyright. Owner set up Cloudflare Email Routing:
  contact@tvmusicstore.com -> forwards to tvmusicstore@gmail.com (catch-all Drop).
  NEW TASK BACKLOG (owner-requested, in priority order):
  (1) CATALOG LOAD ORDER BUG: waveforms/tracks visibly load bottom-up or in random order after
  admin reorders content (e.g. rows 5-9 render before 1-4). Investigate /api/tracks ORDER BY +
  how WaveformPreview instances fetch/decode concurrently; ensure deterministic sort and ideally
  top-down loading priority (queue by row index / IntersectionObserver).
  (2) WAVEFORM BARS: bars are too thin and their width SCALES with window width (bars count is
  fixed, e.g. bars={360}). Wanted: fixed bar width (thicker), bar COUNT adapts to container width
  on resize (recompute buckets from decoded peaks; ResizeObserver). Applies to track rows, track
  page, bottom mini-player.
  (3) ADMIN MAILBOX (owner's plan is correct): Email Routing rule contact@ -> Email WORKER (needs
  a small separate Worker — Pages Functions can't receive email; bind same D1) -> store inbound
  in D1 (new tables: mail_threads, mail_messages) -> Admin "Inbox" section: thread list + dialog
  view; if sender email matches users table show name/plan/purchases; Reply sends via Resend
  FROM "TV Music Store <contact@tvmusicstore.com>" — REQUIRES verifying root domain
  tvmusicstore.com in Resend (currently only e.tvmusicstore.com is verified) -> store outbound in
  same thread. Keep the gmail forward as backup copy (Email Routing can do worker+forward).
  (4) Still pending from earlier: Download-options modal (tunetank style), 1000x1000 cover upload
  + thumbnails, Account->Licenses from real sync_orders, license PDFs.
- **2026-07-05 (icons + waveform queue):** PayPal checkout CONFIRMED WORKING live. Owner added
  proper icon set to public/images/icons/ (favicon.ico, favicon-96x96.png, apple-touch-icon.png,
  web-app-manifest-192/512.png). Wired: index.html favicon links -> /images/icons/* (svg icon
  links removed), Navigation header logo -> favicon-96x96.png (was distorted logo.svg), root
  public/favicon.ico replaced with the new one, login email header now shows the 192px logo image
  (hosted URL) above the wordmark. CATALOG LOAD ORDER FIXED: WaveformPreview now runs all
  fetch+decode through a FIFO queue (QUEUE_CONCURRENCY=4) — rows mount top-down, so waveforms
  appear top-down regardless of sort; backlog item (1) done. Still open from backlog: waveform
  bar width fix (2), admin mailbox (3), download-options modal / covers / licenses-from-D1 /
  license PDFs (4). EMAIL REPLIES interim solution recommended to owner (no code): verify root
  domain tvmusicstore.com in Resend -> Gmail "Send mail as" contact@tvmusicstore.com via
  smtp.resend.com:465 (user "resend", password = Resend API key); inbound already forwards
  contact@ -> gmail via Email Routing. In-site admin Inbox stays a future task.
- **2026-07-05 (entrance stagger fix + bigger header logo):** the "holes on filter toggle" bug
  was NOT waveform loading — it was the framer-motion row entrance (delay 0.55 + index*0.06 on
  every mount): retained rows repositioned instantly, newly mounted ones sat invisible waiting
  for their staggered slot. Fix: `useEntranceStagger()` hook in TrackRowPlayer.tsx (ref flips
  after 1.6s window); Catalog + TrackRowList pass `entranceDelay={done ? 0 : 0.55+index*0.06}`
  to TrackRow — first page load keeps the cinematic stagger, later filter changes fade rows in
  immediately (0.25s, no delay). Header logo bumped to h-8/w-8 (md: h-9/w-9). BIMI explicitly
  skipped per owner. NOTE: waveform FIFO queue from previous entry stays — it handles the
  decode order; this entry handles the visibility holes.
- **2026-07-05 (catalog pagination + skeletons):** owner confirmed the filter-toggle holes are
  fixed; the remaining "weird load" on first open was the mock->API row swap. Catalog now:
  (1) `useTracks` exposes `isLoading` (true until /api/tracks settles); (2) Catalog shows 8
  tunetank-style skeleton rows (pulsing thumb + bar) while loading, no more mock flash;
  (3) PAGINATION: PAGE_SIZE=15, filters/search/sort always run over the FULL track list first,
  then slice; numbered pager (1 … n with ellipses, prev/next) below the list, page resets to 1
  on any filter/search/sort/collection change, page switch smooth-scrolls to the list top
  (`scroll-mt-24` for the fixed header); (4) catalog rows no longer use the staggered rise-in —
  `entranceDelay={0}`, quick 0.25s fade (homepage/collections TrackRowList keeps its first-load
  stagger via useEntranceStagger). AnimatePresence key includes the page number so page flips get
  the same soft transition.
- **2026-07-05 (waveform fixed-width bars + bigger header logo):** WaveformPreview rewritten:
  bar COUNT is now computed from the measured inner container width (ResizeObserver, width
  quantized to 20px), bars have FIXED on-screen size — BAR_STEP=5px slot, BAR_WIDTH=3px,
  viewBox width = count*STEP so resizing re-buckets instead of stretching (tunetank look).
  The `bars` prop is deprecated/ignored (call sites still pass it — harmless, remove when
  convenient). Peaks re-bucket per width from the cached decoded AudioBuffer (cache key
  src:barCount). FIFO decode queue kept. Header logo icon: h-10 w-10 (md: h-11 w-11) — owner
  wanted tunetank-sized. Backlog item (2) waveform bars — DONE.
- **2026-07-04 (layout align):** constrained the Navigation header to the same content container as
  <main> (mx-auto max-w-[92rem] px-4 sm:px-6) so logo/search/icons line up with page content;
  indented the catalog hero text (lg:pl-[16.75rem] xl:pl-[17.75rem]) to start at the track play
  column. NOTE: at this handoff, the catalog->API work + player refactor + these align tweaks were
  UNCOMMITTED in the working tree (files: Catalog.tsx, Navigation.tsx, PlayerProvider.tsx,
  TrackRowPlayer.tsx, functions/api/tracks.ts, and NEW src/hooks/useTracks.ts). Run deploy.bat to
  commit+push them. Reminder: only ONE AI should edit these files at a time to avoid clobbering.
