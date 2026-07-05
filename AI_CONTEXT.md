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
- **2026-07-05 (waveform tunetank styling + real header logo):** header icon was tiny because
  the owner's icon PNGs have big transparent padding (96px file = 35x32px of actual mark!).
  Generated `public/images/icons/logo-header.png` (mark cropped from the 512px icon + 6% pad,
  128px tall) — Navigation now uses it at h-8/md:h-9. If the owner replaces icons, re-crop.
  Waveform tunetank look: BAR_STEP 4 (bar 3px + 1px gap), unplayed bars opacity 0.3 on idle
  rows / 0.62 on the active (playing) track, played part SOLID gold (opacity 1), per-bar CSS
  transition 0.35s so selecting a track brightens the whole wave smoothly.
- **2026-07-05 (Download options modal):** every Download button (catalog rows main+alt,
  mini-player, track page) now opens the tunetank-style dialog instead of downloading directly:
  `src/components/DownloadOptionsModal.tsx` (mounted globally in App.tsx inside PlayerProvider,
  listens for "tvms:download-options"); `openDownloadOptions(args)` in downloadTrack.ts
  dispatches it. Options: MP3 128 (all), MP3 320 (PRO badge; maps to the same mp3 file until
  320s exist), WAV 44.1 (MAX -> format wav), STEMS (MAX, disabled "SOON" — no stems in R2 yet,
  and /api/download would treat unknown formats as mp3). Plan-locked selection turns the CTA
  into "Upgrade to PRO/MAX" -> /pricing. Footer counter: free "N of 3 left", paid "Unlimited",
  guest hint. Guests can press Download Now -> existing 401 -> auth-modal -> resume flow still
  works (resume downloads directly, skipping the dialog — acceptable). "Include PDF License"
  checkbox NOT added yet (PDF generation not built — add when licenses PDF task lands).
  Remaining backlog: track covers + admin track editor, admin mailbox, licenses from sync_orders
  in Account, license PDFs.
- **2026-07-04 (layout align):** constrained the Navigation header to the same content container as
  <main> (mx-auto max-w-[92rem] px-4 sm:px-6) so logo/search/icons line up with page content;
  indented the catalog hero text (lg:pl-[16.75rem] xl:pl-[17.75rem]) to start at the track play
  column. NOTE: at this handoff, the catalog->API work + player refactor + these align tweaks were
  UNCOMMITTED in the working tree (files: Catalog.tsx, Navigation.tsx, PlayerProvider.tsx,
  TrackRowPlayer.tsx, functions/api/tracks.ts, and NEW src/hooks/useTracks.ts). Run deploy.bat to
  commit+push them. Reminder: only ONE AI should edit these files at a time to avoid clobbering.
- **2026-07-05 (track covers + admin track editor):** tracks got real cover art. DB: lazy
  `ALTER TABLE tracks ADD COLUMN cover` (ensureTrackCoverColumn in admin/content.ts — no manual
  migration); /api/tracks SELECTs cover with a legacy fallback (try/catch) for pre-column DBs.
  Admin API: new action `update_track` (title, use_case/genre/mood, bpm, description, tags[],
  cover) in /api/admin/content. Admin UI: new "Tracks" tab in AdminContent — list with cover
  thumbs, per-track editor: Use Case / Genre / Mood as checkbox chips (canonical lists moved to
  NEW `src/lib/tagOptions.ts`, Catalog imports from there now), BPM, description, extra tags
  (comma input), cover URL + Upload (1000x1000 recommended; reuses /api/admin/upload -> R2
  covers/); saved edits merge into the local list via trackOverrides (no refetch needed). Editing
  is disabled while the catalog is on mock fallback (source !== "api"). Frontend covers:
  `CatalogTrack.cover?` + useTracks maps it; TrackDetail square cover shows real art (placeholder
  kept as fallback); CartItem.cover -> cart rows render art; TrackRow title cell shows a 36px
  rounded thumb when cover exists (grid unchanged — thumb lives inside the title Link, hidden
  <sm). lint 0 errors, tsc clean. Remaining backlog: admin mailbox (Inbox), Account -> Licenses
  from real sync_orders, license PDFs (+ "Include PDF License" checkbox in the download modal).
- **2026-07-05 (Tracks Edit — bulk editor):** owner-approved redesign (tunetank-like screenshot).
  Admin -> Content tab renamed "Tracks Edit"; single-track chip editor replaced by NEW
  `src/components/AdminTracksEdit.tsx`: table (select-all + row checkboxes, play button wired to
  global player, cover thumb, title + inline WaveformPreview, composer, duration, collection/
  playlist counts, trending flame), toolbar (search, All Composers filter, Title A-Z/Z-A sort),
  pagination (Show 10/20/50 per page + numbered pager). "Edit Selected" opens a FIXED RIGHT
  side panel: Usage / Mood / Genre TRI-STATE checkboxes (gold check = on all selected, gold dash
  = mixed; click cycles mixed->off(remove from all)->on(add to all)), Playlists + Collections
  membership (same tri-state, with search inputs), Trending radio (Add/Remove/No Change),
  Reset/Apply buttons; when exactly 1 track selected the panel also shows title/BPM/description/
  extra-tags/cover+Upload fields. Server: new action `bulk_update_tracks` in
  /api/admin/content (facets add/remove per track, playlist/collection membership add/remove
  with INSERT OR IGNORE + max(sort), trendingChange add/remove on site_config, optional `fields`
  for single-track edits; update_track kept for compat). After apply, facet/field changes are
  mirrored locally via trackOverrides; memberships/trending refresh via reload(). NOTE: the
  sandbox<->host sync glitch hit again this session (content.ts truncated + NUL-padded
  sandbox-side) — fixed by re-pushing the whole file via heredoc; ALWAYS verify file tails
  before trusting lint. lint 0 errors, tsc clean. FUTURE (owner asked, agreed to do later):
  editable Use Case / Genre / Mood vocabularies (add/delete values from the admin; store lists
  in site_config, tagOptions.ts becomes the fallback). Rest of backlog unchanged (admin mailbox,
  Account -> Licenses from sync_orders, license PDFs).
- **2026-07-05 (Tracks Edit v2 + categories + stems + admin nav):** owner feedback round.
  (1) Tracks Edit panel is now a PERMANENT sticky right column inside the layout (xl:grid
  1fr/21rem — no fixed overlay, no dead gap, no Edit Selected button; empty-state hint when no
  selection; "N selected — clear" chip in the toolbar). Per-page options now 20/50/200; header
  checkbox selects only the CURRENTLY VISIBLE page rows. (2) CATEGORIES are now real, admin-
  editable curated lists (the 4 homepage chips can become "Best for Trailers" etc.): lazy D1
  tables `categories` + `category_tracks` (created/seeded on first admin GET — 4 legacy
  categories + membership copied from tracks.category), Admin -> Content -> new "Categories"
  tab (add/rename/delete), Categories tri-state section in the Tracks Edit panel
  (categoryChanges in bulk_update_tracks), public /api/content returns categories (homepage
  chips via useCategories, fallback built-ins), /api/tracks returns category_ids (per-track
  fallback [category] until the table exists), Catalog ?category= filters by membership with
  legacy fallback. (3) STEMS: fields.hasStems in bulk_update_tracks (checkbox in single-track
  panel), /api/tracks returns has_stems, CatalogTrack.hasStems, gold STEMS badge next to the
  heart on TrackDetail. (4) ADMIN NAV: /account and /admin sidebars now share Main/Admin
  top-level collapsible groups (admins only; MenuGroupHeader component + src/lib/adminNav.ts
  metadata; cross-links use ?section=… which both pages honor). SYNC GLITCH ESCALATED this
  session: host->sandbox sync kept file CONTENT fresh but LENGTH stale (files truncated at old
  byte size or NUL-padded). Repair recipe that works: rstrip NULs; for truncated files cut at
  last full line and append the missing tail read from the host copy (line numbers align), or
  rewrite whole file sandbox-side. lint 0 errors, tsc clean after repair. NEXT candidates:
  editable tag vocabularies in admin, admin mailbox, Account -> Licenses from sync_orders,
  license PDFs, per-track "add track" upload flow (audio files to R2).
- **2026-07-05 (handoff note — NEXT TASKS, owner-approved):** owner reviewed Tracks Edit v2
  (screenshot): layout is good BUT it's squeezed — /admin main container is `max-w-6xl`, so with
  the sidebar there's a huge empty area to the RIGHT of the edit panel, while the track table
  gets a horizontal scrollbar and the panel gets a vertical one (dragging scrollbars is
  annoying). TODO #1: WIDEN the admin Content/Tracks Edit area — e.g. make /admin container
  max-w-none / w-full (or `max-w-[100rem]`) at least for the Content section, let the table
  take the freed width (no horizontal scroll at normal desktop widths; waveform column can
  grow), and widen the panel column (~24-26rem) so USAGE/MOOD/GENRE chips fit comfortably;
  ideally panel fits without its own scrollbar on tall screens. Remaining queue after that:
  (2) editable Use Case/Genre/Mood vocabularies from admin (site_config lists, tagOptions.ts
  fallback); (3) admin mailbox (Email Worker -> D1 -> Inbox UI + Resend replies, needs root
  domain verified in Resend); (4) Account -> Licenses from real sync_orders; (5) license PDF
  generation + "Include PDF License" checkbox in the download modal; (6) "Add Track" flow in
  admin (upload MP3 previews/WAV masters to R2, create tracks/versions rows); nice-to-haves:
  no-cover/no-tags filter, draft/published toggle, duplicate track, undo last Apply.
- **2026-07-05 (admin width — TODO #1 done):** the /admin main container was `max-w-6xl` for
  every section, squeezing the Content / Tracks Edit area (table got a horizontal scrollbar, the
  edit panel a vertical one, big empty gutter on the right). Fix: `src/pages/Admin.tsx` main
  container is now width-conditional — `max-w-[100rem]` when `section === "playlists"` (the
  Content section), `max-w-6xl` for all other sections (dashboard/finance/etc. stay compact).
  `src/components/AdminTracksEdit.tsx`: right edit-panel column widened `21rem -> 25rem` (grid
  `xl:grid-cols-[minmax(0,1fr)_25rem]`, gap 5->6) so USAGE/MOOD/GENRE chips fit comfortably; the
  in-row waveform max width grows on wide screens (`lg:max-w-[24rem]`). The freed width means the
  track table no longer needs its horizontal scrollbar at normal desktop widths (the
  `overflow-x-auto` + `min-w-[42rem]` wrapper stays as a small-screen safety net). AdminContent
  wrapper has no max-w so the widening flows through. lint 0 errors, tsc clean. Edits made via
  host file tools (no sandbox heredoc), host files verified. Remaining queue: (2) editable
  Use Case/Genre/Mood vocabularies from admin; (3) admin mailbox; (4) Account -> Licenses from
  real sync_orders; (5) license PDFs + "Include PDF License" checkbox; (6) "Add Track" upload flow.
- **2026-07-05 (admin width — owner round 2):** owner wanted the Content area to truly use the
  full screen. Changes: `Admin.tsx` Content container `max-w-[100rem] -> max-w-none` (full-bleed
  to the padding edge). `AdminTracksEdit.tsx`: edit panel column doubled `25rem -> 40rem`
  (`xl:grid-cols-[minmax(0,1fr)_40rem]`); Usage/Mood/Genre facet chips and Categories/Playlists/
  Collections membership grids go `grid-cols-2 -> sm:grid-cols-3` (shorter panel, no vertical
  scroll on normal screens); single-track Description textarea `rows 2 -> 5` (no need to expand it
  each time). Removed the search box from the Collections membership section (few collections —
  search was pointless); dropped the now-unused `collectionSearch` state. Table given more room:
  column template widened `...7rem_4.5rem_4.5rem_4.5rem_4rem -> ...9rem_5.5rem_6.5rem_6.5rem_6.5rem`,
  wrapper `min-w-[42rem] -> min-w-[48rem]`, and the cramped headers spelled out
  (Coll./Playl./Trend -> Collections/Playlists/Trending). Real content lints 0 errors, tsc clean.
  SYNC GLITCH again: the sandbox mirror of AdminTracksEdit.tsx got NUL-padded (eslint "Invalid
  character" at EOF + mid-file) — HOST file verified clean via Read; validated real content by
  linting a NUL-stripped copy (0 errors). deploy.bat runs on the host, unaffected.
- **2026-07-05 (admin width — owner round 3, final):** owner rejected the full-screen stretch.
  Reverted `Admin.tsx` Content container `max-w-none -> max-w-[100rem]` (bounded, not full-bleed;
  other sections stay max-w-6xl). Tracks Edit workspace is now an ADAPTIVE split instead of a
  narrow side panel: `AdminTracksEdit.tsx` grid `xl:grid-cols-[minmax(44rem,1fr)_minmax(32rem,1fr)]`
  — the track table takes the width it needs (min 44rem, no h-scroll) and ALL remaining space in
  the content box goes to the Edit panel (min 32rem, ~half), so Usage/Mood/Genre + Playlist/
  Collection/Category/Trending checkboxes fit without internal scroll (facets/memberships are
  sm:grid-cols-3). Table columns tightened to fit the 44rem min
  (`...8rem_5rem_6rem_6rem_6rem`, wrapper min-w-[44rem]). LOG OUT is now red: Account "Sign out"
  recolored `text-red-400 hover:text-red-300`, and a matching red "Log Out" button ADDED to the
  /admin sidebar (Admin.tsx now imports useNavigate + logout + LogOut; previously /admin had no
  logout button at all). lint: real content 0 errors (tsc 0) — sandbox mirror NUL-glitch again
  gave spurious eslint "Parsing error" lines; host files verified clean via Read, no temp files
  leaked to host (Glob confirmed).
- **2026-07-05 (admin width — owner round 4, Edit fills the leftover):** owner clarified with a
  screenshot arrow: the Edit panel should GROW into the empty space to its right; the track table
  stays compact. Implemented: `Admin.tsx` Content container `max-w-[100rem] -> max-w-none` (full
  available width), BUT only the Tracks Edit tab uses it — `AdminContent.tsx` outer card is now
  `max-w-5xl` for every tab EXCEPT tracks (`tab === "tracks" ? "" : "max-w-5xl"`), so Collections/
  Playlists/Categories/Trending keep a normal reading width (honors "don't full-screen without
  necessity"). `AdminTracksEdit.tsx` grid `[minmax(44rem,1fr)_minmax(32rem,1fr)] ->
  [44rem_minmax(32rem,1fr)]`: track table is a FIXED 44rem column (no longer stretches) and the
  Edit panel is the flexible `1fr` column that absorbs ALL remaining width, filling the formerly
  empty right area. tsc 0; real content lints clean (sandbox NUL-mirror glitch still throws
  spurious eslint "Parsing error" — host verified via Read/Grep, tsc parses fine, no temp files
  leaked to host). The fixed 44rem table width is a one-number tweak if it feels off.
  Next: back to the main plan — (2) editable tag vocabularies,
  (3) admin mailbox, (4) Account->Licenses from sync_orders, (5) license PDFs, (6) Add Track.
- **2026-07-05 (admin nav restructure + Tracks Edit width, owner round 5 — final):** owner: (a) the
  single "Content" sidebar item and its INNER tab bar (Collections/Playlists/Categories/Trending/
  Tracks Edit) are gone — those five are now TOP-LEVEL admin sidebar items; (b) only the Tracks
  Edit view gets a wider but still CENTERED box (never full-screen); every other admin section
  stays centered at the normal `max-w-6xl` like Finance/Tracks. Impl:
  `adminNav.ts` — replaced `{playlists:"Content"}` with 5 items: collections (Library), playlists
  (ListMusic), categories (Tags), trending (Flame), tracksedit "Tracks Edit" (SlidersHorizontal).
  `Admin.tsx` — SectionId + SECTION_IDS extended with those 5 ids; `CONTENT_TAB` maps each section
  to AdminContent's internal view (tracksedit->"tracks"); render is now
  `{CONTENT_TAB[section] && <AdminContent tab={CONTENT_TAB[section]!} />}`; main container is
  `max-w-6xl` for all sections EXCEPT `section === "tracksedit"` which is `max-w-[96rem]` (still
  mx-auto centered — variant B). `AdminContent.tsx` — now takes a `tab` prop (controlled), internal
  `tab` state + the tab-button bar REMOVED (replaced by an `<h2>{tabLabels[tab]}</h2>` header, seed
  button kept); a `useEffect([tab])` resets any open draft on view switch. `AdminTracksEdit.tsx`
  grid back to `[minmax(44rem,1fr)_minmax(32rem,1fr)]` — in the 96rem box both the table (~44rem,
  no h-scroll) and the Edit panel (~32rem+) are roomy. tsc 0. NOTE: stale sandbox-only temp files
  from earlier rounds (`*__v.tsx`, `*__chk.tsx`) linger in the SANDBOX mirror (can't rm — overlay
  perms) but are NOT on host (Glob confirmed) so deploy.bat is unaffected; ignore them in sandbox
  lint output. Back to the main plan next.
- **2026-07-05 (admin left-anchor, no jump + Tracks Edit fills right):** owner: switching to
  Tracks Edit made the whole sidebar/list JUMP left (because `<main>` was `mx-auto` centered and
  the tracksedit box was wider -> re-centered further left). Fix: dropped `mx-auto` from the admin
  `<main>` entirely — the admin is now LEFT-ANCHORED, so the sidebar + track list never move
  between sections. Normal sections keep `max-w-6xl` (now left-aligned instead of centered);
  `section === "tracksedit"` uses `max-w-none` so it extends to the right screen edge, and the
  AdminTracksEdit grid `[minmax(44rem,1fr)_minmax(32rem,1fr)]` splits that width into the track
  table (left) + Edit panel (right), both roomy (checkboxes fit without inner scroll). Trade-off:
  non-tracks admin sections are now left-aligned (empty space on the right on wide screens) — this
  is intentional (standard fixed-sidebar admin layout) and the only way to keep the menu from
  moving; re-add `mx-auto` to the non-tracksedit branch if the owner wants them centered again
  (but that reintroduces the jump). tsc 0.
- **2026-07-05 (admin width — FINAL, sidebar fixed + only Tracks Edit content bleeds right):**
  left-anchoring the whole admin (previous entry) made ALL sections hug the left / feel stretched —
  owner disliked it. Correct solution: `<main>` is CENTERED again for every section
  (`mx-auto w-full max-w-6xl`), so the sidebar sits in the same centered spot on every view (no
  jump) and normal sections look balanced as before. Only the Tracks Edit CONTENT column bleeds to
  the right screen edge, without touching the sidebar: the content `<div>` (sibling of the sidebar
  in the flex row) gets `section === "tracksedit" && xl:mr-[calc((72rem_-_100vw)/2)]` — a negative
  right margin equal to the centered container's right gutter, so the flex-1 content grows past
  main's right edge to ~the viewport edge while the sidebar (also inside the centered main) stays
  put. AdminTracksEdit grid `[minmax(44rem,1fr)_minmax(32rem,1fr)]` then splits that widened area
  into table + Edit panel. `72rem` = max-w-6xl; underscores in the calc are Tailwind's space
  encoding (`72rem - 100vw`), matching the existing `calc(100vh-7rem)` style in the repo. tsc 0.
  NOTE: could not run `vite build` in the sandbox — node_modules were installed on Windows so the
  Linux `@rollup/rollup-linux-x64-gnu` native binary is missing (env-only issue); deploy.bat
  builds on the host. If the right-bleed ever needs a bigger gap from the edge, add a positive rem
  to the calc (e.g. `+2rem`).
- **2026-07-05 (editable tag vocabularies — main plan #2 done):** Use Case / Genre / Mood lists are
  now admin-editable, stored in `site_config` (keys `vocab_use_case` / `vocab_genre` / `vocab_mood`
  as JSON arrays), with `src/lib/tagOptions.ts` as the fallback. Server: `_utils.ts` gained
  `DEFAULT_VOCAB`, `VOCAB_KEY`, `VOCAB_COL`, `VOCAB_FACETS`, `getVocabularies(db)` (reads the 3 rows,
  falls back to defaults, tolerates missing table/bad JSON). `functions/api/admin/content.ts`: GET
  returns `vocabularies`; new POST actions `add_vocab` / `delete_vocab` ({facet, value}) — delete
  also STRIPS the value from every track's joined use_case/genre/mood column. `functions/api/
  content.ts` (public) returns `vocabularies` too. Frontend: `tagOptions.ts` exports
  `defaultVocabularies` + `Vocabularies` type; `useContent.ts` adds `useVocabularies()` (live
  /api/content, fallback). Admin UI: new **Vocabulary** sidebar item (ListFilter icon, between
  Categories and Trending) -> AdminContent `vocabulary` view = 3 sections (Usage/Mood/Genre) of
  deletable chips + an add input each (add_vocab/delete_vocab via run()). AdminTracksEdit now takes
  a `vocabularies` prop and builds its Usage/Mood/Genre checkbox lists from it (FACETS lost its
  hardcoded options; tagOptions import dropped there). Catalog FilterSidebar uses `useVocabularies()`
  for the filter options (the useState initializer still uses the static defaults for URL-param
  normalization — harmless). Frontend tsc 0. NOTE: `functions/` is NOT in the project tsconfig
  (only `src`), and the sandbox mirror NUL-corruption makes sandbox tsc/eslint on functions
  unreliable — host files verified correct via Read; they mirror existing action/handler patterns.
  Owner deploys via deploy.bat (host build). Add/delete only for now (no rename/reorder — matches
  the spec).
  UPDATE same day: added reordering — Vocabulary view now lists each value on its own row
  (Catalog order: Use Case, Genre, Mood) with up/down arrows; new admin action `set_vocab`
  {facet, values[]} replaces the whole ordered list (dedup, case-insensitive) and the arrows
  swap-and-save via run(). tagOptions order/labels in the editor match the catalog filters.
- **2026-07-05 (Account -> Licenses from real sync_orders — main plan #4 done):** Account ->
  Licenses now shows real purchases instead of mockSyncOrders. New `functions/api/licenses.ts`
  (GET, session required) -> `{ licenses: [{ id, trackId, trackTitle, tier, price, hasPdf,
  createdAt }] }` from sync_orders LEFT JOIN tracks, newest first (tier holds personal|commercial|
  professional; hasPdf = license_r2_key present). `useMockData.ts` gained `LicenseEntry` +
  `useMyLicenses()` (live /api/licenses for authed users, mockSyncOrders fallback for dev
  personas — same pattern as useMyDownloads). Account.tsx: dropped the mockSyncOrders import,
  `syncOrders = useMyLicenses()`, and the license rows now show title · tier and a date · $price
  subline. The "License PDF" button is STILL a placeholder — real PDF generation is main-plan #5
  (next); `hasPdf` is already surfaced by the API so #5 can switch the button on/off per row.
  Frontend tsc 0; functions/ (licenses.ts) verified by Read, mirrors downloads.ts.
- **2026-07-05 (license PDFs + Include PDF License — main plan #5 done):** license certificates
  are generated ON THE FLY (no storage, no R2 needed). New `functions/api/_pdf.ts` = a tiny
  zero-dependency single-page PDF generator (Helvetica/Helvetica-Bold standard fonts, Latin1
  bytes, ASCII-sanitized text, hand-built xref) — validated with qpdf (`--check` = no syntax
  errors) and an offset self-check. New `functions/api/license-pdf.ts` (GET, session required):
  `?order=<sync_order_id>` -> certificate for a purchased one-time license (tier name + usage
  terms from a server TIER_INFO map, licensee = user name/email, track title, price, PayPal ref,
  date); `?slug=<track_slug>` -> certificate for the user's current subscription plan (PLAN_INFO
  free/pro/max terms, plan read from subscriptions like me.ts). Returns application/pdf as an
  attachment. Frontend: Account -> Licenses "License PDF" button is now a real
  `<a href="/api/license-pdf?order=ID" target=_blank>` (works for any real sync_order; generation
  is on-demand so no hasPdf gating needed). DownloadOptionsModal gained an "Include PDF License"
  checkbox (authed users only, hidden for the disabled STEMS option); when checked, after the
  audio download it also fetches `/api/license-pdf?slug=...` (attachment header -> downloads the
  cert without navigating). Frontend tsc 0; new server files typecheck clean in isolation + PDF
  output validated by qpdf. Only #6 (Add Track upload flow) remains on the main plan.
