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

- **HOW TO TALK TO THE OWNER:** plain, simple language — he designs the product logic himself
  but is NOT a coder. Big-picture things (which technology/service to pick, general terms) are
  fine; do NOT walk him through implementation internals (file names, hooks, endpoints, column
  names etc.) in chat. Explain WHAT changed for the user/site and what HE needs to do — keep the
  deep technical detail in this file's Progress Log, not in the conversation.
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
- **2026-07-05 (Add Track upload flow — main plan #6 done; PLAN COMPLETE):** admins can create a
  track from the UI. Server: `functions/api/file/[[path]].ts` now also serves the `previews/`
  prefix publicly (masters/ stays private — download.ts only). New
  `functions/api/admin/upload-audio.ts` (admin, `?kind=preview|master&filename=`): preview MP3 ->
  R2 `previews/<base>-<uuid>.mp3` (returns public `/api/file/...` path), master MP3/WAV -> R2
  `masters/...` (returns key only, 95 MB cap under CF's ~100 MB body limit; preview cap 25 MB).
  New `create_track` action in `admin/content.ts`: unique slug from title, INSERT tracks (composer
  NULL, category default "production", tags JSON, has_stems, cover) + one `main` track_version
  (preview_src = uploaded preview path, r2_key_wav = master key or null); validates title +
  previewSrc (must be a /api/file/previews or /audio/previews path). Frontend: `useTracks` now
  exposes `reload()`; `AdminContent` got an `uploadAudio()` helper; new
  `src/components/AddTrackModal.tsx` (title/bpm/duration/description/tags, category select,
  Use Case/Genre/Mood chips from live vocabularies, stems flag, cover + preview + master uploads)
  opened by a gold "+ Add Track" button in the Tracks Edit header (only when the catalog is
  DB-backed, source === "api"); on success it reloads content + /api/tracks so the new row appears.
  Frontend tsc 0, lint clean (only NUL-mirror Parsing noise); upload-audio.ts typechecks clean,
  create_track host block verified. OWNER: needs the R2 binding (already bound) — WAV masters up
  to 95 MB; larger masters would need a different upload path (multipart/direct-to-R2) later.
  MAIN PLAN (1-6) is now COMPLETE. Nice-to-haves left from PAGES_SPEC: draft/published toggle,
  duplicate track, multi-version tracks (only a single "main" version is created here), admin
  mailbox (still a future task), rename/reorder vocab already partly done.
- **2026-07-05 (license polish: test prices, admin lookup, download-license button):** owner
  round on licenses. (1) TEMPORARY TEST PRICES: sync tiers set to $1/$2/$3 in BOTH
  `functions/api/paypal/_paypal.ts` (LICENSE_PRICES, authoritative) and `src/lib/licenses.ts`
  (display) so the owner can buy each tier for a few dollars to test PayPal + PDF end-to-end —
  clearly commented TODO to restore 29/89/249 before launch. (2) ADMIN LICENSE LOOKUP: new
  `functions/api/admin/licenses.ts` (GET admin, all sync_orders JOIN users+tracks, newest 500,
  optional `?q=`) + new **Licenses** admin sidebar item (adminNav, FileText icon, between Customers
  and Requests) + `Admin.tsx` `licenses` section: search box (filters by License ID / PayPal
  reference / buyer email/name / track title, client-side over the fetched list) and a table
  (License ID as a link to its PDF, buyer, track, tier, $price, date). So a customer's certificate
  number resolves to who bought what, when, for how much. (3) The License ID printed on every sync
  certificate IS the sync_orders.id (unique) — already there; the admin table links each id to its
  PDF. (4) DOWNLOAD-LICENSE for subscription downloads: `license-pdf.ts` now also accepts
  `?track=<track_id>` (resolves the track by id, same plan-based certificate as `?slug=`), and
  Account -> Downloads got a "Download License" link next to Re-download
  (`/api/license-pdf?track=<trackId>`) so customers can grab a plan license PDF for any past
  download (e.g. for a YouTube Content ID dispute). Frontend tsc 0, lint clean; new/edited server
  files typecheck clean (host verified past NUL-mirror noise).
- **2026-07-05 (PayPal "Could not start checkout" diagnostics):** owner hit a generic "Could not
  start checkout" on the /cart PayPal button. Root cause hidden because `functions/api/paypal/
  order.ts` did NOT wrap paypalToken/paypalCall in try/catch — any PayPal failure (auth 401, env
  mismatch, restricted account) threw -> Pages Function 500 with no JSON -> frontend fell back to
  the generic message. Fix: wrapped the order creation in try/catch returning
  `{ error: "PayPal: <real reason>", env }` (502); Cart's `post()` already reads `error` on
  non-2xx and createOrder throws it into onError -> the real reason now shows in the toast.
  MOST LIKELY cause given config reports configured:true (both keys set) but the call fails:
  a sandbox/live mismatch — sandbox REST-app credentials while PAYPAL_ENV is unset (=> code uses
  the LIVE api-m.paypal.com base -> auth 401). Fix path: for sandbox testing set PAYPAL_ENV=sandbox
  AND use sandbox app credentials AND pay with a sandbox buyer account; for live, use live-app
  credentials with PAYPAL_ENV unset. (capture.ts left un-wrapped for now — the failing step is
  order/createOrder.) Note test prices $1/$2/$3 are unrelated (valid amounts).
- **2026-07-06 (license PDF redesign — DONE + next task documented):** the plain black-and-white
  certificate was restyled into a branded one. `functions/api/_pdf.ts` extended: RGB fill colors,
  filled rectangles, lines, Courier/Courier-Bold fonts, and ONE embedded RGBA image (FlateDecode
  RGB XObject + grayscale SMask for transparency) — object numbering kept stable (fonts F3/F4 at
  obj 9/10, image at 7, SMask at 8). New `functions/api/_logo.ts` (auto-generated from
  `public/images/icons/logo-header.png`, 137x128) holds the gold soundwave logo as zlib-compressed
  RGB + alpha base64. `functions/api/license-pdf.ts` fully redesigned: dark graphite header band
  (#121317) with the logo + "TV MUSIC STORE" wordmark + letterspaced "LICENSE CERTIFICATE" + ISSUED
  date, gold 4px rule under the header, big license-name title with a gold underline, licensee /
  track blocks, a gold-bulleted USAGE RIGHTS list, a warm-panel LICENSE CODE box (gold left bar,
  courier code, + a 3-row meta panel: Type/Price/Reference for one-time, Type/Track/Status for
  subscription), and a footer rule + contact line. Brand gold #F4C430 throughout. VERIFIED: both
  variants (one-time Commercial + subscription Max Plan) render as valid PDFs (qpdf --check: no
  syntax/stream errors) with the logo embedded; rasterized previews looked correct. deploy via
  deploy.bat (host build). NOTE the usual sandbox-mirror truncation hit `_pdf.ts` + `license-pdf.ts`
  again — host files are whole (verified via Read); to render in the sandbox I copied host content
  into /tmp (the `_logo.ts` mirror synced whole, the other two did not). NEXT TASK (owner deferred,
  written up): subscription certificates still print a static "MAX PLAN" instead of a real unique
  code — spec to mint/store/show a persistent plan license code + admin lookup is in
  `docs/TODO_PLAN_LICENSE_CODES.md` (new `plan_licenses` table, get-or-create per user/track/plan,
  extend admin/licenses.ts + /admin Licenses to cover both one-time and subscription codes). The PDF
  template itself needs no further redesign for that task — it already renders the code panel.
- **2026-07-06 (subscription license codes + admin lookup — DONE):** subscription (plan) certificates
  now carry a real, persistent, tamper-evident code instead of the static "MAX PLAN" label. New
  `functions/api/_licenses.ts`: Crockford base32, WebCrypto HMAC-SHA256 signing, lazy
  `plan_licenses` table, `getOrCreatePlanLicense` (ONE stable code per user+track+plan — re-downloads
  reuse it, a plan upgrade mints a new one), `verifyCode`. Code format `TVMS-<PLAN>-XXXX-XXXX-YY`
  (YY = 2-char HMAC check, e.g. TVMS-MAX-CYCR-54TT-DH). `license-pdf.ts`: the `?slug=`/`?track=`
  subscription branch mints/reuses the code, prints it under a LICENSE CODE label, and shows meta
  Type / Plan / Valid until (from subscriptions.current_period_end); issue date is the code's stored
  created_at so re-downloads stay consistent. Added an admin-only `?code=` branch (opens any
  customer's subscription cert by its code) and relaxed `?order=` so admins can open any buyer's
  one-time cert (customers still restricted to their own via user_id). `functions/api/admin/
  licenses.ts` rewritten to UNION one-time (sync_orders) + subscription (plan_licenses) licenses with
  a `kind` field, newest first, still `?q=` searchable. `src/pages/Admin.tsx`: Licenses table gained
  Kind / Plan / Issued / Valid-until columns and per-kind PDF links (?order= / ?code=), heading now
  "Licenses". `migrations/0001_init.sql`: plan_licenses table + indexes. `_utils.ts` Env gained
  LICENSE_SIGNING_SECRET. VERIFIED in the sandbox: code-gen + signature round-trip unit test (valid
  true, tampered false, wrong-secret false), subscription PDF re-rendered with a real code (qpdf
  clean, no layout overlap). NOTE: usual sandbox-mirror truncation hit license-pdf.ts + admin/
  licenses.ts (host files whole via Read; _licenses.ts synced whole so its logic was testable). tsc/
  lint not runnable in the Linux sandbox (Windows node_modules) — reviewed types manually; authoritative
  lint+build runs on the host via deploy.bat. OWNER STEP: set LICENSE_SIGNING_SECRET (any long random
  string) in Cloudflare Pages env vars + redeploy so the HMAC is owner-specific; codes still work
  without it (admin lookup is authoritative), the signature just isn't secret-bound until then.
- **2026-07-06 (license PDF v3 — premium redesign to owner's mockup):** owner supplied a richer
  certificate mockup (certified seal, usage-rights icon grid, details table with a status pill,
  dual footer with Certificate ID). Rebuilt to match. NEW `functions/api/_assets.ts` (auto-generated,
  ~99KB): a circular "TV MUSIC STORE / LICENSED & CERTIFIED" seal + 16 line icons + header deco,
  each stored as zlib RGB+alpha base64 (generated with cairosvg in the sandbox; regen script pattern
  in the session, not committed). `_pdf.ts` upgraded: dynamic object numbering, MANY embedded images
  (was 1), rounded-rectangle fills (`rrect`), polygons (`poly`, for the gold notches), and text
  `align` — still zero-dependency/latin1 for the Workers runtime. `license-pdf.ts` `buildCertificate`
  fully rewritten to the mockup layout: dark header band + faint gold deco arcs + logo + ISSUED,
  gold divider with a downward notch, big two-tone title ("MAX PLAN" bold + "LICENSE" light), licensee
  block, certified seal on the right, USAGE RIGHTS as a 3-5 column icon grid (icons auto-picked from
  each term via `iconForTerm`, labels word-wrapped), a light details panel (gold left bar) with rows
  Plan/Type/Track/[Valid until]/License Code/Status, the Status row rendered as a gold pill with a
  cart icon ("ACTIVE" for subscriptions, "PURCHASED" for one-time), footer note + dark footer bar with
  globe/mail icons and a right-aligned CERTIFICATE ID. `buildCertificate`'s fields changed
  (title/licenseeName/licenseeEmail/terms/rows/issued/certificateId/statusText + new CertRow type);
  all three call sites (admin ?code=, ?order=, subscription ?slug=/?track=) updated, with a shared
  `planRows()` helper. CODE FORMAT changed to match the mockup: `TVMS-YYYY-MMDD-XXXX` (issue date +
  4-char tail = 2 random + 2 HMAC-check chars) in `_licenses.ts` mintCode/verifyCode (still bound to
  user+track+plan+date; one-time certs keep their sync_orders id as the code). VERIFIED in sandbox:
  both variants render, qpdf clean, previews match the mockup; code-format round-trip test passes
  (valid ok, tampered/wrong-track rejected). NOTE: sandbox-mirror truncation again — host files whole
  via Read; assets written straight to the mount (intact). tsc/lint run on the host via deploy.bat.
  Owner deploys as usual; no new owner step beyond the earlier LICENSE_SIGNING_SECRET.
- **2026-07-06 (license PDF v4 — content redesign + owner's seal + legal docs):** owner supplied a
  reference (tunetank/vicate-style) and his own seal PNG. Certificate rebuilt from an icon-grid into a
  content-rich document. `functions/api/_assets.ts`: owner's seal added as key "sign" (background
  keyed to transparent + downscaled from public/images/pdf sign/pdf sign.png). `_pdf.ts`: sanitizer
  now maps common Unicode punctuation (– — ' ' " " … · • x) to ASCII so it renders in the standard
  fonts (was showing "?"). `license-pdf.ts` `buildCertificate` fully rewritten (new `CertData`
  interface): dark header (logo + "Music License Certificate" + ISSUED), LICENSE NUMBER box, two-col
  LICENSE DETAILS (Purchase Code / Issued / Order / Type) + LICENSED TO (Licensee / Email), LICENSED
  TRACK (Track / Composer / Track Page link), LICENSE SCOPE & RESTRICTIONS with a scope line +
  PERMITTED USES (green checks) / NOT PERMITTED (red crosses) drawn as vector marks, a YouTube
  Content ID callout (per-claim release, NO channel whitelisting), and a footer referencing License
  Terms v1.0. The owner's seal sits top-right. Removed the misleading "ACTIVE" status pill (a PDF
  can't know live status). TIER_INFO/PLAN_INFO gained scope + permitted[]/notPermitted[] (original
  wording). Two identifiers: License Number (big, = our code / sync id) + Purchase Code (payment ref
  = PayPal order id). Call sites now also fetch track slug + composer (JOIN composers) and build via
  `orderCert`/`planCert` helpers. `paypal/order.ts`: every order tagged `invoice_id: TVM-XXXXXXXX`
  for CSV filtering in the shared PayPal. VERIFIED: both variants render, qpdf clean, punctuation
  fixed, seal keyed clean. Owner deploys via deploy.bat.
  DOCS DRAFTED (all in docs/, owner review — NOT legal advice): `LICENSE_TERMS_DRAFT.md`,
  `COMPOSER_AGREEMENT_DRAFT.md`, `PRIVACY_POLICY_DRAFT.md`, `VAT_READINESS.md` (planned). Decisions
  locked: UK general partnership (Stanislav Barantsov & Maryna Huz, trading as TV Music Store),
  governing law England & Wales, perpetual licenses (no expiry shown), refunds final + defect window
  + UK download-waiver, Free-plan attribution required, Content ID per-claim only, composer licensing
  non-exclusive. Open: correspondence address (virtual office), live prices (still on test $1/$2/$3),
  composer revenue %. Payments staying on Stripe+PayPal for now; Paddle (MoR) noted as a future
  option to offload global VAT/OSS.
- **2026-07-06 (footer redesign + legal pages):** replaced the old "Let's Create Together" contact-form
  footer (`src/components/Footer.tsx`) with a tunetank-style multi-column footer built from our content:
  brand block + Music / Licensing / Company columns + bottom bar with socials (YouTube, Instagram, X
  [inline SVG — lucide has no X brand], Facebook; hrefs are `#` placeholders). Owner's names moved OFF
  the footer into the Terms/Privacy pages (disclosure required somewhere consumer-facing, not
  specifically the footer). NEW public pages `src/pages/LicenseTerms.tsx` (/license-terms) and
  `src/pages/Privacy.tsx` (/privacy), routed in App.tsx, rendering finalized draft content (EFFECTIVE +
  ADDRESS constants at top of each to edit later). `docs/VAT_READINESS.md` + `docs/BACKLOG.md` created
  (admin CRM customer-profile idea; owner to-dos: rent address, social URLs, restore live prices,
  composer %, lawyer review). KNOWN CONFLICT: `src/pages/Licensing.tsx` still advertises "channel
  whitelisting" (Pro 3 / Max 10) + FAQ saying whitelisting auto-clears claims — contradicts the new
  per-claim-only Content ID policy in Terms/certificate/privacy. Needs reconciling.
- **2026-07-06 (Content ID model reconciled + whitelist spec + funnel doc):** owner clarified the
  intended Content ID model: subscriptions DO offer **channel whitelisting**, but manual +
  subscription-bound (customer adds channel URLs up to a plan limit; owner clears claims on those
  channels while the sub is active; videos published after cancellation aren't covered). One-time
  licenses use per-claim release by License Number. Reconciled: LicenseTerms.tsx §6 + LICENSE_TERMS_
  DRAFT.md §6 rewritten to this two-path model; Licensing.tsx Content ID FAQ updated (was "whitelist
  auto-clears in 24h" -> "on a paid plan we clear claims on your whitelisted channels while active,
  or send a link+License Number for a one-off"). NEW `docs/WHITELIST_SYSTEM.md` — full spec (Phase 1
  manual: whitelist_channels D1 table + account "My Channels" + admin Whitelist view; Phase 2:
  scheduled worker polls channels via YouTube Data API and surfaces new post-subscription videos in
  admin; caveat that true auto-whitelisting needs the Content ID provider's allowlist API). NEW
  `docs/GROWTH_FUNNEL.md` — acquisition/funnel plan (Free plan as lead magnet; YouTube + track-page
  SEO + free tools for traffic; activation via easy first download + certificate trust; Free->paid via
  limits/WAV/whitelisting; retention via taste-segmented new-release emails = the admin CRM idea;
  metrics). Owner flagged "no funnel = no point" — this doc is the starting plan. Whitelist per-plan
  limits still reference the /licensing table (Pro 3 / Max 10) — owner to confirm final numbers.
- **2026-07-06 (channel whitelisting — Phase 1 manual, BUILT):** owner-approved limits Free 0 / Pro 3
  / Max 10. NEW `whitelist_channels` D1 table (id, user_id, channel_url, channel_ref, added_at) in
  0001_init.sql + lazy `ensureWhitelistTable`. NEW `functions/api/whitelist.ts` (customer): GET list
  (+plan/limit/used), POST add (validates a YouTube channel URL, enforces active-paid plan + per-plan
  limit + dedupe), DELETE remove; `effectivePlan` = latest subscription only if status active, else
  free. NEW `functions/api/admin/whitelist.ts` (admin): all channels JOIN users + latest subscription,
  with an `active` flag (paid + status active), active-first, `?q=` search. Frontend: NEW
  `src/components/MyChannels.tsx` (account "Whitelisting" section — live add/remove, shows N of limit,
  upgrade CTA when limit 0) replaced the old mock whitelist UI in Account.tsx (dropped
  mockWhitelistChannels + the `whitelists` var). NEW `src/components/AdminWhitelist.tsx` + admin nav
  item "whitelist" (Youtube icon) + Admin.tsx section — table of channels with Active/Inactive status,
  clickable channel link, customer, plan, added date; owner opens Active channels and clears claims
  manually. Backend files node --check clean; frontend follows existing patterns (real lint/build on
  deploy.bat). Phase 2 (YouTube API monitoring of new post-subscription videos) still per
  WHITELIST_SYSTEM.md, not built.
- **2026-07-06 (admin CRM — customer profiles, BUILT):** click a customer in /admin -> Customers or a
  buyer in /admin -> Licenses to open a profile modal. NEW `functions/api/admin/customer.ts` (GET
  ?id=, admin-only): identity + subscription history (subscriptions) + purchases (sync_orders) +
  recent downloads (download_log, 100) + total + whitelisted channels + **taste** = top genres/moods/
  use-cases tallied from tracks the customer downloaded or bought (splits the " / "-joined tag columns,
  counts, top 6 each). `admin/licenses.ts` now also returns `userId` (added to both queries + the
  AdminLicenseRow type) so the Licenses buyer is clickable. Frontend: NEW `AdminCustomerProfile.tsx`
  modal (identity, copy-email, taste chips, purchases w/ PDF links, sub history, channels, recent
  downloads); Admin.tsx gained `profileUserId` state, made the Customers name + Licenses buyer
  clickable (buttons), added `userId` to its AdminLicense type, renders the modal. No new schema — all
  from existing tables. Backend node --check clean. Powers the taste-segmented marketing idea from
  BACKLOG/GROWTH_FUNNEL. Not yet: actually sending campaigns (needs an email-campaign flow).
- **2026-07-06 (funnel: welcome email, BUILT):** first funnel code piece per FUNNEL_LAUNCH_PLAN.md.
  NEW `functions/api/_email.ts` — shared branded email shell (matches the login-code email: dark
  header + 192px logo, white body, dark footer) + `sendWelcomeEmail(env, to, name)` (greeting, how-it-
  works 1-2-3, upgrade unlocks incl. whitelisting, "Browse the music library" CTA; never throws).
  Wired into all three signup paths so it fires ONCE on new-account creation: `auth/verify.ts`
  (email-code), `auth/register.ts` (email+password), `auth/google/callback.ts` (Google) — skips
  admins. Resend already configured; degrades gracefully without a key. Backend node --check clean.
  Also wrote `docs/FUNNEL_LAUNCH_PLAN.md` (step-by-step launch sequence: Phase 0 foundations ->
  acquisition (YouTube/SEO/tools) -> capture+activate -> convert -> retain via taste emails; build-vs-
  content-vs-ops split; first-30-days). Next funnel code: newsletter capture + unsubscribe, then the
  taste-segmented campaign sender (uses the CRM).
- **2026-07-06 (funnel: newsletter capture + unsubscribe, BUILT):** NEW `newsletter_subscribers` D1
  table (id, email UNIQUE, token, source, subscribed_at, unsubscribed_at) in 0001_init.sql + lazy
  `ensureNewsletterTable`. NEW `functions/api/newsletter.ts` (POST subscribe — validates email,
  idempotent, re-subscribes a previously-unsubscribed email, mints an unsubscribe token, never reveals
  prior existence). NEW `functions/api/newsletter/unsubscribe.ts` (GET ?token= -> marks unsubscribed +
  returns a branded HTML confirmation page; note file + folder share the `newsletter` base name — both
  route fine in Pages Functions). Frontend: NEW `src/components/NewsletterSignup.tsx` (email + Subscribe,
  success/err states) added to the Footer brand block ("New tracks in your inbox"). GDPR: explicit
  opt-in + unsubscribe link for every future campaign. Backend node --check clean. Campaign sender
  (next) will read this list + tokens to email taste segments from the CRM.
- **2026-07-06 (whitelist Phase 2 — video monitoring, BUILT on-demand):** Pages has no cron, so instead
  of a background poller: NEW `functions/api/admin/whitelist-videos.ts` (admin, GET ?id=<channel>) —
  resolves the whitelisted channel via YouTube Data API v3 (@handle / channel/UC / user / best-effort
  /c/), pulls the uploads playlist, returns videos published AFTER the channel's added_at, only while
  the owning customer's subscription is active (else {inactive:true}). `_utils.ts` Env gained
  `YOUTUBE_API_KEY`. `AdminWhitelist.tsx`: each row got a "New videos" expander that lazy-loads and
  lists videos (title + date + link) so the owner opens each and clears the claim. OWNER STEP: set
  YOUTUBE_API_KEY in CF Pages env. Backend node --check clean. Campaign sender deferred to BACKLOG.md.
  A true background poller would need a separate Worker (Pages can't cron) — noted in
  WHITELIST_SYSTEM.md.
- **2026-07-06 (funnel: campaign sender, BUILT — funnel loop closed):** admin can email the newsletter
  list, optionally narrowed to a CRM taste tag. NEW `functions/api/admin/campaign.ts` (POST, admin):
  `{preview:true}` -> {count}; else sends. Audience = active `newsletter_subscribers`, and with a
  `tag` = only those whose matched account taste (download_log/sync_orders JOIN tracks, genre/mood/
  use_case LIKE %tag%) includes it. Sends via Resend in batches of 10, cap 300/campaign, each email
  gets an unsubscribe link (newsletter token); logs to NEW `email_campaigns` table (migration + lazy).
  `_email.ts` gained `sendCampaignEmail` (admin body -> paragraphs, "Listen now" CTA, unsubscribe
  footer, HTML-escaped). Frontend: NEW `AdminCampaign.tsx` (audience toggle + taste tag, subject,
  body, "Preview count" -> then "Send campaign" with confirm) + admin nav item "campaigns" (Send icon)
  + Admin.tsx section. Backend node --check clean. Funnel now end-to-end: newsletter capture -> welcome
  email -> CRM taste -> targeted campaign (all built). Larger lists need batching/queue later (cap 300).
- **2026-07-06 (FIX: /api returned HTML "<!DOCTYPE" — newsletter file/folder conflict):** live site
  showed `Unexpected token '<' ... is not valid JSON` on /api/whitelist (and likely all /api) — the
  Functions layer wasn't routing, so /api/* fell back to the SPA index.html. Root cause suspected: a
  file `functions/api/newsletter.ts` AND a folder `functions/api/newsletter/` with the same base name
  (a Pages Functions build hazard). Fixed by consolidating into the folder: NEW
  `functions/api/_newsletter.ts` (shared `ensureNewsletterTable` + email regex), NEW
  `functions/api/newsletter/index.ts` (the POST subscribe handler), deleted `functions/api/
  newsletter.ts` (used the cowork file-delete permission — sandbox `rm` was blocked). Updated imports
  in `newsletter/unsubscribe.ts` and `admin/campaign.ts` to `../_newsletter`. All parse clean.
  OWNER: redeploy (deploy.bat), then verify by opening /api/whitelist logged-out — expect
  `{"error":"Not signed in"}` JSON. If it STILL returns HTML, check the Cloudflare Pages deployment
  build log for a Functions error (possible other causes: functions bundle size from _assets.ts, or a
  CF build/config issue) and report it.
  RESOLVED: real cause was NOT the newsletter conflict (that build succeeded) — it was a runtime 500.
  Real-time Logs showed `D1_ERROR: no such column: channel_ref` in whitelist.ts listResponse: the prod
  `whitelist_channels` table pre-existed WITHOUT `channel_ref`, and `CREATE TABLE IF NOT EXISTS` never
  alters an existing table. Fix: `ensureWhitelistTable` now also runs a guarded `ALTER TABLE
  whitelist_channels ADD COLUMN channel_ref TEXT` (try/catch), self-healing on next request (same
  pattern as ensureTrackCoverColumn). Diagnostic lesson: a 500 from a Pages Function returns an HTML
  error page → "Unexpected token '<' ... <!DOCTYPE" on the client; check Real-time Logs for the real
  exception, and use `git show origin/main:<file>` + Routing config to rule out deploy/routing.
  DEEPER ROOT CAUSE: the ORIGINAL 0001_init.sql already had a legacy `whitelist_channels` table
  (id INTEGER AUTOINCREMENT, user_id, channel_url, status, created_at) — my Phase-1 whitelisting reused
  that name, so on prod `CREATE TABLE IF NOT EXISTS` kept the legacy schema (missing channel_ref +
  added_at) -> 500s. FINAL FIX: renamed my table to **`wl_channels`** everywhere (whitelist.ts,
  admin/whitelist.ts, admin/whitelist-videos.ts, admin/customer.ts, migration + index
  idx_wl_channels_user); the legacy whitelist_channels row in the migration is left untouched (unused
  by my code). Lesson: check the ORIGINAL migration for existing table names before adding a lazily-
  created table. Verified no other new table (plan_licenses/newsletter_subscribers/email_campaigns)
  collides with legacy. Owner: redeploy — wl_channels is created fresh, whitelisting works.
  CONFIRMED WORKING: owner added a channel, admin "New videos" showed it. Owner then asked for docs
  only (next work with a fresh AI). NEW `docs/NEXT_STEPS.md` — detailed hand-off spec: (1) whitelist
  claim workflow (All-new-across-channels endpoint, Copy / Copy All, checkboxes + wl_handled table +
  "mark as sent" + Show-handled strikethrough), (2) tunetank-style header account dropdown (plan
  badge + Upgrade + quick links + download counter) + slimmer dashboard nav, (3) admin audit /
  consolidation proposal (group 14 flat admin items into Overview / Catalog / Customers / Briefs;
  drop the redundant mock "Whitelist requests"; turn "Claim removals" into a real Copyright Claims
  admin view). NEW `docs/SITE_OVERVIEW.md` — owner-facing "mini book": what the product is, full user
  journey, what customers can do, plans & licenses, certificate, Content ID model, emails, admin
  capabilities, composer side, business/legal, built-vs-pending. Owner will review SITE_OVERVIEW and
  drive the NEXT_STEPS build with the next AI.
- **2026-07-07 (live PayPal prices + Stripe paused + upload polish):** owner is about to sell a
  one-time license to a real customer. (1) LICENSE PRICES set to LIVE: Personal $15 / Commercial
  $79 / Professional $249 in BOTH `functions/api/paypal/_paypal.ts` (LICENSE_PRICES, authoritative)
  and `src/lib/licenses.ts` (display) — removed the temporary $1/$2/$3 test-price TODOs.
  (2) STRIPE SUBSCRIPTIONS PAUSED (migrating to Paddle later): new `BILLING_ENABLED = false` flag in
  `src/lib/billing.ts`; `startCheckout`/`openBillingPortal` now short-circuit with a "coming soon"
  toast instead of hitting /api/stripe/*. Pricing paid-plan buttons show "Coming soon" (disabled);
  Account hides "Manage billing"/"Manage subscription" and shows a "billing moving to a new provider"
  note. Stripe backend functions are untouched — flip the flag (or swap in Paddle) to re-enable.
  One-time PayPal track licenses (/cart) are unaffected. (3) ADD-TRACK: duration now auto-fills from
  the uploaded preview MP3 (client-side `readAudioDuration` via HTMLAudioElement metadata, m:ss;
  field still editable as a fallback) in `src/components/AddTrackModal.tsx`. Edits verified whole via
  host Read; the usual sandbox-mirror truncation hit the edited TSX again (spurious tsc "unclosed
  tag" noise) — authoritative lint+build runs on the host via deploy.bat.
  CLEANUP TODO: stray temp files linger in src on the HOST this time (not just the sandbox):
  `src/components/AdminContent__v.tsx`, `AdminTracksEdit__chk.tsx`, `AdminTracksEdit__v.tsx`,
  `_lintcheck.tsx`, `src/pages/Account__chk.tsx`, `Admin__chk.tsx`, `Admin__v.tsx` — old
  NUL-truncated snapshots, unused (not imported), safe to delete; remove before they confuse lint.
  DOWNLOAD FORMATS NOTE for the pending track upload: the backend only distinguishes mp3 vs wav —
  "MP3 128" and "MP3 320" both stream the SAME uploaded preview file (whatever bitrate it is; no
  separate 320 render exists yet), and WAV is served from the uploaded master (r2_key_wav, Max only).
  So upload a 320 kbps preview if you want the "320" option to truly be 320, and upload a WAV master
  for the WAV option to work.
- **2026-07-07 (WAV-first upload pipeline: browser transcode + WAV zip + real 128/320):** reworked
  the whole track-upload/delivery model per owner. Owner now uploads WAV files only and picks the
  main version; the BROWSER does everything (Cloudflare Workers can't run ffmpeg): decode WAV via
  WebAudio, encode MP3 320 (site preview + 320 download) and MP3 128 (128 download) with **lamejs**
  (`@breezystack/lamejs`, pure JS — NO ffmpeg.wasm, NO COOP/COEP headers, so PayPal/YouTube embeds
  are unaffected), pack all WAVs into one `.zip` with **fflate**, and make a cover thumbnail via
  `<canvas>`. Non-main WAVs become additional versions (each gets its own 320/128 for the existing
  on-site version previews — the multi-version UI is kept, NOT simplified). NEW deps in package.json:
  `@breezystack/lamejs` + `fflate` (verified their ESM named exports: `Mp3Encoder`, `zip`). NEW
  `src/lib/audioEncoding.ts` (decodeAudio/encodeMp3/wavToMp3Pair/zipWavs/makeThumbnail/formatDuration).
  `AddTrackModal.tsx` fully rewritten: multi-WAV list + main star + per-version labels, per-version
  encode+upload with a progress line, WAV zip upload, cover+thumbnail. Backend: `admin/upload-audio.ts`
  now accepts kinds preview|preview128 (public mp3) + wavzip (private .zip in masters/) + master;
  `admin/content.ts` `create_track` takes `versions[]` (previewSrc 320 + preview128) + `wavZipKey` +
  `coverThumb`, inserts N track_versions (version_id main, v2, v3…); `ensureTrackCoverColumn` now also
  lazily adds `tracks.cover_thumb`, `tracks.r2_key_wav_zip`, `track_versions.preview_128`; migration
  0001_init.sql updated (+ the previously-missing `cover` column). `download.ts` now takes `quality`
  (128→preview_128 else preview_src) and serves `tracks.r2_key_wav_zip` for WAV as a `.zip`
  (`Track (WAV 44.1-16).zip`), with defensive column fallbacks so existing tracks/DBs keep working
  (legacy per-version r2_key_wav still honored). `/api/tracks` returns cover_thumb (two-tier fallback);
  `/api/downloads` returns track slug. Frontend: DownloadOptionsModal passes quality; downloadTrack
  DownloadArgs gains quality + names WAV downloads `.zip`; CatalogTrack/useTracks gain coverThumb;
  TrackRowPlayer row thumb uses coverThumb||cover; Account → Downloads replaces "Re-download" with
  "MP3 320" + "WAV 44/16 zip" buttons (need trackSlug, main version). Deleted 7 stray NUL-truncated
  snapshot files from src (host).
  OWNER STEPS: (1) run `npm install` once (adds lamejs + fflate) BEFORE deploy.bat, or the local
  vite build fails on the new imports; (2) deploy.bat as usual (R2 already bound). CAVEATS: encoding
  a long WAV can freeze the admin tab ~10-30s (client-side, admin-only); WAV-zip download is still
  Max-plan gated in download.ts — wiring one-time PayPal license buyers to the WAV zip is a separate
  TODO the owner deferred. Couldn't run vite build in the sandbox (Windows node_modules + the usual
  mirror truncation of edited files) — logic reviewed by hand + dep exports verified in an isolated
  install; authoritative lint+build runs on the host via deploy.bat.
- **2026-07-07 (delete tracks from admin):** there was no way to delete a track — added it so the
  owner can clear test/demo tracks and manage the catalog. NEW `delete_track` action in
  `functions/api/admin/content.ts` (accepts `trackIds[]` or single `id`, up to 200): deletes the
  track's `track_versions`, `collection_tracks`, `playlist_tracks`, `category_tracks` (guarded),
  strips the ids from the trending `site_config` list, then deletes the `tracks` rows (download_log /
  sync_orders history left intact — LEFT JOINs tolerate the missing track). Frontend: `AdminTracksEdit`
  lifts its selection up via new props `onSelectionChange` + `selectionResetKey` (clears selection when
  the parent bumps the key); `AdminContent` shows a RED **Delete (N)** button next to "+ Add Track" in
  the Tracks Edit header, visible only when ≥1 track is selected — confirm dialog, then delete +
  reload() + reloadTracks() + clear selection. NOTE: when the DB has zero tracks, the catalog falls
  back to the 16 bundled mock tracks (by design) until the first real track is added. Reminder for the
  owner: run `npm install` before deploy.bat (lamejs + fflate from the previous entry still need it).
- **2026-07-07 (Buy License popup wired to the cart icon):** the ShoppingCart "Buy License" action
  icon (track rows main + alt versions, and the bottom mini-player) had no onClick — now it opens a
  global license picker. NEW `src/components/LicenseModal.tsx` (mounted in App.tsx next to
  DownloadOptionsModal, inside PlayerProvider/BrowserRouter): listens for `tvms:buy-license`, shows
  the SAME one-time license tiers as the solo track page (reuses `licenseTiers` from `lib/licenses.ts`
  — currently $15/$79/$249, so it stays in sync automatically), the Usage Terms grid, price, and
  "Add to Cart" (uses existing `addToCart`), then closes. NEW `openLicenseModal(args)` +
  `BuyLicenseArgs` in `hooks/useCart.ts`; wired the three cart icons (`TrackRowPlayer` ×2,
  `PlayerProvider` mini-player) to call it with the track's {trackId, slug, title, artist, cover}.
  Mirrors the DownloadOptionsModal event pattern. (Owner's reference screenshot showed $29/$89/$289 —
  that's tunetank; ours shows the licenses.ts prices.)
- **2026-07-07 (track-row polish: cart on versions, tooltip clip, resume-to-popup, no email autofocus):**
  four small UX fixes in `TrackRowPlayer.tsx` + auth. (1) Removed the "Buy License" cart icon from
  ALTERNATE version rows — the license is track-level (main + versions are one purchase), so it only
  lives on the main row + mini-player now. (2) The expanded-versions `motion.div` was `overflow-hidden`
  (needed while the height animates) which CLIPPED the first version row's upward "Download" tooltip;
  now it flips to `overflow-visible` after the open animation (`onAnimationComplete` + a
  `versionsOverflowVisible` state, reset to hidden on collapse via effect), and the ActionIcon tooltip
  got `z-20`. (3) `resumePendingDownload` (downloadTrack.ts) now RE-OPENS the Download options popup for
  the pending track after sign-in (`openDownloadOptions`) instead of auto-downloading — guest clicks
  Download → 401 → auth → back to the same popup to finish. (4) Removed `autoFocus` from the EMAIL
  input in `AuthModal.tsx` + `Login.tsx` (kept it on the 6-digit CODE input) so opening auth doesn't
  grab the email field — most users click Continue-with-Google.
- **2026-07-07 (Pick-a-plan popup + free-download attribution popup):** two tunetank-style popups,
  both global + event-driven like the other modals (mounted in App.tsx). (1) NEW
  `src/components/PlanModal.tsx` — "Pick a plan" popup with a Monthly/Annual toggle and the paid
  cards (Pro / Max, Max = Most Popular), reuses `usePlans`/`useSubscription`; CTA mirrors the Pricing
  page (`startCheckout`, or "Coming soon" disabled while `BILLING_ENABLED` is false), "Full pricing
  details →" links to /pricing. Opened via NEW `openPlanModal()` in `lib/billing.ts` (event
  `tvms:pick-plan`). Account → Overview "Upgrade" button now opens this popup instead of navigating
  to /pricing. (2) NEW `src/components/AttributionModal.tsx` — "Say thanks!" popup with ready-to-copy
  credit text ("Royalty Free Music from tvmusicstore.com / Track: <title> by <artist> / <origin>/track/
  <slug>"), Copy button, a "download the audio file" fallback link (re-runs the download), and a "Want
  studio WAV, 320 Kbps and no attribution? See plans" link that opens PlanModal. Opened via NEW
  `openAttribution()` in `lib/downloadTrack.ts` (event `tvms:attribution`). Trigger: `downloadTrackVersion`
  now RETURNS a boolean (success), and `DownloadOptionsModal` opens the attribution popup only when an
  authed FREE-plan MP3-128 download actually succeeded (not on 401/limit). Free-plan attribution matches
  the license terms. NOTE: while Stripe is paused the plan popup's Get-plan buttons show "Coming soon";
  flip BILLING_ENABLED (Paddle) to activate.
- **2026-07-07 (download filenames + clean version labels):** owner downloaded MP3s named
  "Opening Up Space (Opening Up Space (short version)).mp3" — the title was duplicated because version
  labels defaulted to the full WAV filename (which contains the title). Fixes: (1) NEW helpers in
  `lib/downloadTrack.ts`: `cleanVersionLabel(label,title)` strips the track title out of a version
  label ("Opening Up Space (short version)" -> "short version"; main/full/original/"==title" -> ""),
  `downloadFileName(title,label,fmt)` = `tvmusicstore.com_<Title> (<suffix>).mp3` (no suffix for main),
  `wavZipFileName(title)` = `tvmusicstore.com_<Title>.zip`. Site-prefixed, tunetank-style. Used in the
  blob `a.download`. (2) Server `functions/api/download.ts` builds the same site-prefixed
  content-disposition (own `cleanVersionSuffix`), so even already-uploaded tracks download cleanly.
  (3) `AddTrackModal`: version labels now auto-strip the track title for DISPLAY + storage (VersionRow
  gained `edited`; `labelOf()` shows `cleanVersionLabel(filename,title)` until the owner edits it; main
  shows placeholder "Main"), and `create_track` stores the cleaned labels ("Main"/"short version"/…).
  NOTE for the owner: his ALREADY-uploaded test track keeps its ugly stored version labels on-site
  (download names are fixed regardless) — delete + re-upload that track to get clean on-site labels too.
  (WAV→MP3 is expected: the site serves MP3 made from the WAVs; the WAVs themselves live in the zip.)
- **2026-07-07 (admin mailbox / Inbox — BUILT):** the long-pending admin Inbox is done. Read + reply
  to contact@tvmusicstore.com from `/admin → Inbox`. Since Pages Functions can't receive email, inbound
  goes through a SEPARATE Cloudflare **Email Worker** (`mail-worker/` — `src/index.ts` parses mail with
  postal-mime, `wrangler.toml` binds the same D1, `package.json`) that writes into new D1 tables
  `mail_threads` + `mail_messages` (in 0001_init.sql + lazy `ensureMailTables`). Pages side:
  `functions/api/_mail.ts` (shared `ensureMailTables` + `recordMessage` upsert-thread-per-person),
  `functions/api/admin/mail.ts` (GET threads / GET ?id detail+customer & mark-read / POST reply|
  mark_read|archive|delete; reply sends via Resend from contact@tvmusicstore.com with reply_to). UI:
  `src/components/AdminInbox.tsx` (thread list + conversation + reply box + customer plan/purchases/
  downloads chip) + nav item "Inbox" (Mail icon) + Admin.tsx `mail` section. One thread per
  correspondent; sender matched to users for the CRM chip. Verified postal-mime's `PostalMime.parse`
  API in isolation. OWNER SETUP (docs/ADMIN_MAILBOX.md): (1) `cd mail-worker`, put the D1 id in
  wrangler.toml, `npm install`, `npx wrangler deploy`; (2) Email Routing: route contact@ → Worker
  `tvms-mail-worker` (keeps optional Gmail forward via FORWARD_TO); (3) verify ROOT domain
  tvmusicstore.com in Resend so replies from contact@ send (reading works without it; replying fails
  with a toast until then). The mail worker is a separate deploy — NOT part of deploy.bat.
  UPDATE (owner confirmed mail works, in+out): Inbox got (a) a **search** box in the header — new `?q=`
  on `GET /api/admin/mail` searches email/name + message subject/body (LIKE, incl. archived, DISTINCT
  threads), debounced client input in AdminInbox; (b) the conversation header name/email is now
  **clickable** when the correspondent is a registered user → opens AdminCustomerProfile (Admin passes
  `onOpenCustomer={setProfileUserId}`), same as Customers/Licenses.
- **2026-07-07 (track codes — tunetank-style unique numbers):** every track now gets a RANDOM unique
  public code 1000-9999 (owner's choice over sequential — can't read catalog size off the numbers),
  used in the URL and filenames. NEW `functions/api/_codes.ts`: `generateTrackCode(db)` (random,
  uniqueness-checked, scan fallback, null if all 9000 taken) + `ensureTrackCodes(db)` (lazy `ALTER
  TABLE tracks ADD COLUMN code`, backfills any code-less track and PREFIXES its slug with the code).
  `admin/content.ts` `create_track` mints a code and sets `slug = <code>-<title>` (e.g.
  `1042-opening-up-space`) — the old title-only dedup loop is gone (code guarantees uniqueness); returns
  507 if codes are exhausted. `/api/tracks` calls `ensureTrackCodes` (idempotent) and returns `code`;
  migration 0001_init.sql gained `tracks.code`. Frontend: `CatalogTrack.code` + useTracks map it;
  `TrackDetail` resolves by the LEADING code (`/track/1042-anything` works, text can change without
  breaking the link; exact-slug fallback kept). Filenames now include the code:
  `downloadFileName`/`wavZipFileName` take a code (parsed from the slug via new `codeFromSlug`), and the
  server `download.ts` content-disposition matches → `tvmusicstore.com_1042_Opening Up Space.mp3` /
  `_1042_...zip`. All `/track/${track.slug}` links pick up the code automatically (slug now carries it).
  Existing/test tracks get codes + coded slugs on the next /api/tracks load (their old code-less URLs
  change — fine at this stage). LATER (documented, tasks open, docs/CATALOG_SORTING.md): (a) smart
  catalog ordering — default "Recommended" = featured (daily-shuffled) pinned + genre/mood round-robin
  diverse mix with a daily seed; New by date; Popular by real download_log later; (b) after the big
  import, a 1-10 star "newness" rating per track with same-tier cross-composer round-robin to seed New.
  Owner: build codes now (done) → sorting next → staging after the bulk import.
- **2026-07-07 (account dashboard declutter: Plan & Billing + YouTube Whitelisting redesign):** trimmed
  the customer dashboard. (1) Removed the **Overview** section entirely (nav item + section + the
  "Your plan"/"Recent downloads" cards) — plan now lives in Plan & Billing, downloads in Downloads
  (removed the now-unused `useDownloadsRemaining`). (2) **Plan & Billing** rebuilt tunetank-style
  (`section === "billing"`): page header "Plan & Billing / Manage your subscription", a SUBSCRIPTION
  card (green dot, "<Plan> Plan" + a plan-specific subtitle + "↗ Upgrade plan" opening the plan popup,
  hidden on Max; Manage-billing shown only when BILLING_ENABLED), and a BILLING INFORMATION card
  (purple dot, name + email). (3) **YouTube Whitelisting**: nav renamed "Whitelisting" → "YouTube
  Whitelisting"; `MyChannels.tsx` fully rebuilt to the mockup — header + subtitle + a `used/limit
  channels` shield badge, existing-channels list, an Add-channel card (add form when the plan has free
  slots; otherwise a dashed "Upgrade your plan to whitelist channels" card that opens the plan popup),
  a "Channels per plan" block (Pro 3 / Max 10, current plan marked, others open the popup), and a
  "Need more channels?" banner — the per-plan block + banner hide on Max. (4) The plan popup now takes
  an optional context: `openPlanModal({title, subtitle})` (billing.ts) → PlanModal shows a custom
  heading; whitelisting passes "Upgrade to protect channels / YouTube channel protection is included
  with Pro and Max". (Get-plan buttons still show "Coming soon" while Stripe is paused.)
- **2026-07-07 (admin panel consolidation + plan-popup fixes):** owner-approved audit of the admin
  sidebar. PlanModal fixes first: the Monthly/Annual toggle overlapped the label — rebuilt as a
  standard `inline-flex` switch (w-12 track, translate-x-1/7, gap-x-3, justify-center) so it no longer
  collides; and the popup now centers vertically (`items-center` + inner `max-h-[90vh] overflow-y-auto`)
  instead of hugging the top. Admin nav: `adminNav.ts` flat `adminNavItems` replaced by
  **`adminNavGroups`** (4 always-visible, non-collapsible groups — owner didn't want collapsible):
  **Overview** (Dashboard) · **Catalog** (Tracks [was "Tracks Edit"], Collections, Playlists,
  Categories, Vocabulary) · **Customers** (Customers, Inbox, Licenses, Campaigns, Whitelisting) ·
  **Requests** (Briefs). `adminNavItems` kept as `adminNavGroups.flatMap(...)` for the account page's
  secondary Admin menu. REMOVED FROM THE MENU (dups/mock): **Finance** (mock payouts), the old mock
  **Tracks** (moderation queue — the real manager is Tracks Edit, now just "Tracks"), **Trending** (a
  per-track flag already lives in the Tracks manager), and the mock **Whitelist requests** inside
  Requests. Admin.tsx renders the grouped nav; the **Dashboard** now shows REAL numbers computed from
  the already-loaded live users (Customers, Paid subscribers Pro/Max, Downloads all-time, Paid share)
  instead of mock MRR/revenue/funnel (placeholder note for revenue "once billing goes live"); the
  **Requests** section trimmed to just the Briefs card. NOTE: the Finance / old-Tracks / Trending
  section render code is retained but unreachable from the menu (kept in SectionId/SECTION_IDS) so it
  can be re-enabled easily; a few now-unused mock imports remain (harmless — deploy.bat runs vite build
  only, no lint/tsc). DEFERRED (owner to decide later): a real "Copyright Claims" admin view (replacing
  the removed mock Claim-removals), and wiring Dashboard revenue once Paddle/billing is live.
- **2026-07-07 (admin nav spacing fix + auto-subscribe + Notifications page + live download counter):**
  (1) MENU SPACING BUG: switching the Admin/Main menus left the item spacing wrong until a click — the
  `nav` was `flex flex-col gap-1` and its Main/Admin blocks toggle in/out, hitting the Chromium
  "`gap` not recalculated until reflow" bug. Fixed by `gap-1` → `space-y-1` (margin-based) on the Admin
  page nav. (2) AUTO-SUBSCRIBE: new-account signups now auto-join the newsletter — extracted
  `subscribeEmail`/`unsubscribeEmail`/`isSubscribed` into `functions/api/_newsletter.ts`, called from
  all three signup paths (verify/register/google callback, admins skipped); `newsletter/index.ts`
  simplified to use it. Opt-out lives in the new **Account → Notifications** page
  (`NotificationsSettings.tsx`, nav item Bell): a real Marketing toggle ("Promotions & offers") backed
  by NEW `GET/POST /api/my-newsletter` (per-account subscribe/unsubscribe; named my-newsletter to avoid
  a me/ route clash), plus an "Other" group (Downloads/Recommendations/Notifications) stored in
  localStorage as placeholder prefs (not yet wired to real emails). ⚠️ COMPLIANCE: auto-opt-in to
  marketing for free signups is riskier than soft opt-in under UK GDPR/PECR — recommended adding a
  consent line at signup + a lawyer check (noted in docs/EMAIL_LIFECYCLE.md). (3) FREE-DOWNLOADS
  COUNTER: the "N of 3 free downloads left" in DownloadOptionsModal was static (session not refetched)
  — now calls `refreshSession()` after a successful download so the number updates; and the counter is
  hidden entirely for paid plans (was "Unlimited downloads on your plan").
- **2026-07-07 (signup consent line + SEO pass):** (1) CONSENT: added a signup consent line ("By
  creating an account you agree to receive occasional emails … unsubscribe anytime") under the email
  form in `AuthModal.tsx` and `Login.tsx`, to make the auto-subscribe defensible. (2) SEO: the site is
  a Vite React SPA (near-empty static HTML) — Google/Bing render JS so they see content, but JS-less
  bots (GPTBot/ChatGPT, social/link crawlers) only saw the shell, and every route shared the homepage
  title. Fixes: enriched `index.html` (title/description/canonical/OG/Twitter + **JSON-LD**:
  Organization, WebSite+SearchAction, Product with Pro/Max Offers, and a FAQPage covering usage/
  plan-diff/formats/whitelisting/one-time licenses — readable by all bots); updated `public/robots.txt`
  (blocks /account /admin /cart /login, points to sitemap); new `public/sitemap.xml` (main routes); new
  zero-dep `src/hooks/useSeo.ts` (per-route title/description/canonical/OG + route JSON-LD) wired on
  **Pricing** and **TrackDetail** (per-track title/desc + MusicRecording JSON-LD). Documented state +
  next steps in `docs/SEO.md`. NEXT (owner sign-off): wire useSeo on the remaining pages; a Function-
  generated `/sitemap-tracks.xml` from D1; and prerendering/dynamic-rendering for full JS-less coverage
  (the real fix for ChatGPT/social bots on every page — bigger, needs build changes + testing).
- **2026-07-07 (de-tunetank pass — Level 1 microcopy + download-modal look):** owner wanted to feel less
  like tunetank without changing the layout/style he likes (Levels 2/3 declined). Reworded the
  verbatim/near-verbatim strings into our own cinematic voice, structure unchanged: DownloadOptionsModal
  format descriptions ("Light file for rough cuts…", "Full-quality MP3 for your final edit", "Uncompressed
  master…", "Separated layers to remix…") AND replaced the tunetank-style **gold radio dot** with a gold
  **check on the right** (card already highlights) — same minimalist rows, different signature;
  AttributionModal "Say thanks!" → "Credit the composer" (+ subtitle, "Copy attribution"→"Copy credit",
  "no attribution"→"no credit line"); PlanModal card subtitles "For everyday creators/…agencies" → "For
  solo creators & channels" / "For studios, brands & client work" and default subtitle reworded off the
  "Higher plans give you…" phrasing; LicenseModal "Buy a license" → "License this track" + reworded
  subtitle; NotificationsSettings marketing subtitle reworded; `lib/licenses.ts` usage-term bullets
  rephrased (meaning-preserving, no new scope claims — kept "Lifetime license" consistent with the
  perpetual-license docs). Structure/logic untouched; owner keeps the visual style.
- **2026-07-07 (signup consent + fixes batch + priority support tickets):** (1) SIGNUP CONSENT LINE
  added under the email form in AuthModal + Login. (2) DownloadOptionsModal subtitle no longer
  duplicates the title (uses `cleanVersionLabel`). (3) Download history track titles are now links to
  `/track/<slug>`. (4) Pricing intro reworded to a benefit line. (5) De-tunetank tweaks: Plan&Billing
  section dots recolored to gold + labels "Your plan"/"Account details"; Notifications group headers
  got a gold accent bar; YouTube Whitelisting reworded ("we take care of Content ID claims on your new
  videos… set it once and relax"), the N/limit badge moved INTO the Add-a-channel card, the "Need more
  channels?" banner removed, and the Crown icon dropped. (6) **PRIORITY SUPPORT (new):** Account →
  Support (`SupportSection.tsx`) — Free shows the contact email + an "Upgrade for priority" prompt;
  Pro/Max get an **internal ticket chat** backed by NEW `functions/api/support.ts` (GET the user's own
  thread, POST a message). It reuses the mailbox tables: a support message is a `mail_messages` row
  (direction 'in') on the user's thread with `mail_threads.priority=1` (new column, lazy ALTER +
  migration + `_mail.ts recordMessage` gained a `priority` flag, MAX-merged). Admin **Inbox** now sorts
  priority threads first and shows a gold **PRO** badge; admin replies (existing Inbox reply → Resend
  email + stored 'out' message) appear back in the customer's Support thread, so it's a two-way
  internal chat + email notification. NOTE: reverted an accidental "Unlimited MP3 → Unlimited" Pro edit
  (WAV stays Max-only). Owner: mail worker deploy already covers the schema (priority ALTER self-heals).
- **2026-07-07 (PDF-license gating + homepage convergence hero):** (1) The "Include PDF License"
  checkbox in DownloadOptionsModal is now shown/honored only for **Pro/Max** (plan !== "free") — free
  plan doesn't get a subscription license cert (one-time solo licenses still get their own cert via
  Account → Licenses). (2) HOMEPAGE "Trust" section redesigned from a flat 4-column grid into a
  **convergence graphic** (Gyanaguru-style): the four pillars (Content ID protected / Real composers /
  Versions included / License instantly) sit as cards on the left, four gold gradient light-beams
  (inline SVG, `#trustBeam` gradient, a pulsing SMIL convergence node) fan into a bright point, and
  flow into a right-side **TV MUSIC STORE** brand node (glow + a purple→gold→cyan gradient bar +
  "Cinematic music, licensed clean."). Beams are desktop-only (`hidden lg:block`); on mobile the cards
  stack above the brand node. Pure CSS/SVG, no deps. `Index.tsx` trust section only.
- **2026-07-07 (live moods on home + gold menu bars + skeuomorphic toggle):** (1) Homepage "Browse by
  mood" used a hardcoded `moods` array, so admin-added moods showed in Catalog but not on Home — now
  it reads the live vocabulary (`useVocabularies().mood`) so it stays in sync. (2) Added the gold
  accent bar (from the Notifications group headers) in front of every sidebar group label in the
  Account and Admin menus (both the account groups and the admin groups). (3) Redesigned the on/off
  Toggle (NotificationsSettings) into a skeuomorphic button: a dark grip-dot knob that slides, with a
  glowing **"ON"** / dim **"OFF"** label revealed on the opposite side. Used the brand **gold** glow
  (not the blue from the owner's reference screenshot) to stay on-theme — trivial to switch to blue if
  he prefers. Pure inline styles, no deps.
- **2026-07-07 (toggle tweak + waveform dimming):** (1) Toggle no longer slides the knob — the grip
  knob stays fixed left, the ON/OFF label stays fixed on the right, and only the glow + word change;
  widened to `w-20` so "OFF" fits. (2) WaveformPreview unplayed-bar opacity lowered: idle rows
  `0.3 → 0.18` (darker when not playing) and the active/playing track `0.62 → 0.42` (was too bright
  when a track started). UPDATE: the gold (played) bars now dim WITH the grey — `played ? (active ? 1
  : 0.5) : active ? 0.42 : 0.18` — so on idle rows the whole waveform (gold + grey) is muted and lights
  up together (0.35s transition) when the track plays.
- **2026-07-07 (gold bars moved to content headers + admin menu paint fix):** the gold accent bar was
  meant for CONTENT section headers (like Notifications' Marketing/Other), NOT the sidebar nav group
  labels. Reverted the sidebar group-label bars (Admin + Account) and instead: `SectionCard` (Account)
  now renders a gold `h-4 w-1` bar before its `<h2>` (covers Profile / Downloads / Licenses "What your
  plan covers" & "One-time sync licenses" / Claims), and the Plan & Billing "Your plan" / "Account
  details" dots became matching gold bars. ADMIN MENU PAINT BUG: opening the Admin menu showed the
  group labels (Overview/Catalog/Customers/Requests) blank until a click — the blocks were conditionally
  mounted (`{menu === 'admin' && …}`) and the freshly-mounted subtree wasn't painted until a reflow.
  Fixed by always rendering both menu blocks and toggling visibility with `hidden`/`flex` instead of
  mount/unmount, so everything is painted up front.
- **2026-07-07 (cover becomes the play button):** the track-row play control is now the cover art
  itself. Replaced the circular play button (col 1) with the square cover thumbnail (bigger — the
  `.music-track-grid` play column went 2.75rem → 3.5rem in all breakpoints; image `h-12 w-12`), and
  removed the duplicate thumb from the title cell. On hover the cover dims and shows a play triangle
  (or pause while playing) — icon appears ONLY on hover (`group/cover` + opacity). No-cover tracks show
  a Music2 placeholder square. The circular progress ring became a **square progress border** around
  the cover: an SVG `<rect>` (rounded, `pathLength=100`, gold stroke, dashoffset = 100−progress) layered
  OUTSIDE the `overflow-hidden` image so it isn't clipped. Alt-version rows keep the small circular
  PlayProgressRing (they share the track's cover, no separate art).
- **2026-07-07 (admin menu jump — real fix):** the earlier fix only removed `gap` from the `nav` but
  the two menu BLOCKS still used `flex flex-col gap-3`, so switching Admin↔Main still left the group
  spacing/sizes wrong until a click forced a reflow (Chromium flex-`gap` recalc bug on
  dynamically-shown containers). Changed both blocks `gap-3 → space-y-3` (margin-based) so no flex gap
  remains anywhere in the sidebar; combined with the always-rendered `hidden/flex` toggle the menu now
  lays out correctly the instant it's shown. (Account page menu already used margin-based `md:mb-5`,
  so it wasn't affected.)
- **2026-07-07 (Support copy-email + Refund Policy page for Paddle):** (1) Removed the "Upgrade for
  priority" button from Account → Support; replaced with a **Copy email** button (copies contact@).
  (2) Paddle verification requires linked Terms/Privacy/Refund pages — we had /license-terms and
  /privacy but no refund page. NEW `src/pages/Refunds.tsx` (`/refunds`, routed in App.tsx, linked in
  the Footer Company column + sitemap) — a proper Refund Policy consistent with the License Terms
  (digital-goods download waiver, faulty-file/duplicate refunds, subscription cancellation, chargeback
  note). For Paddle: Web domain = tvmusicstore.com, Pricing = /pricing, Terms = /license-terms,
  Privacy = /privacy, Refund = /refunds. (Owner ordered a London correspondence address — pending;
  the EFFECTIVE/ADDRESS placeholders in Privacy/LicenseTerms can be filled once it arrives.)
- **REMINDER (owner-requested, before spending on ads): FUNNEL AUDIT.** Walk the whole funnel and patch
  drop-off holes so paid traffic converts. Biggest hole today: subscriptions can't be purchased
  (Stripe off / Paddle not yet live → "Coming soon"), so the whole subscription conversion path is dead
  until Paddle is wired — must be live before ads. Also verify: one-time PayPal license checkout works
  end-to-end; free download flow (3/mo, login-resume, attribution); signup friction; catalog has real
  tracks with working previews; mobile layout of hero/catalog/pricing/track pages; no dead placeholder
  CTAs; pricing clarity (Pro vs Max); landing-page meta for shared ad links.
- **2026-07-07 (Paddle rejected domain → first-party repositioning):** Paddle declined tvmusicstore.com
  under their Acceptable Use Policy, flagging "reselling/redistribution of third-party content" (music
  licensing sites read as stock-media marketplaces). Owner chose to REPOSITION + resubmit. Reworded the
  site to clearly present TV Music Store as an INDEPENDENT MUSIC HOUSE selling its OWN original music,
  not a reseller/aggregator: Index hero ("Original music, composed in-house by our own composers and
  licensed directly by us"), trust point "Real composers → Original & exclusive" ("…never third-party
  stock"), the "What is TV Music Store?" about paragraph ("independent music house… we own and control
  the music we license… not a reseller or aggregator of third-party stock"), Footer brand line,
  Catalog subtitle ("our full catalog of original tracks"), index.html Organization JSON-LD
  description, and License Terms §8 (changed "licenses each track ON BEHALF OF its composer" → "holds
  the rights needed to license every track and grants all licenses directly as the licensor and rights
  holder… not a reseller or marketplace for third-party stock content"). OWNER: deploy so the new copy
  is live, then hit "Resubmit domain for review" in Paddle (and, if there's a note field, state the
  music is original/first-party). FALLBACK if Paddle rejects again: Stripe/PayPal direct (both already
  coded; no MoR content restriction) + a tax tool for VAT.
  ACCURACY CORRECTION (owner flagged): the first pass overclaimed ownership ("rights holder", "we own
  the music", "composed in-house") — but the owner is NOT the copyright owner of composers 2 & 3's
  tracks. Reworded to be truthful AND non-reseller: TV Music Store is an independent music house whose
  own roster of composers create original music FOR the catalogue and AUTHORISE us to license it; we
  grant customer licenses **directly, as the authorised licensor**, and copyright stays with "TV Music
  Store and/or the relevant composer". Dropped "in-house/rights holder/we own"; kept "original, from
  our own composers, not a reseller/marketplace/aggregator of third-party stock". Applied on Index
  (hero, trust point "Original, not stock", about paragraph), Footer, Catalog, index.html Org
  description, and License Terms §8. (Note for Paddle strength: exclusive composer agreements read
  stronger than non-exclusive, but that's a business decision, not a copy change.)
- **2026-07-08 (Favourites + Similar Tracks + header account menu):** (1) FAVOURITES made real —
  `functions/api/favourites.ts` (D1 `favourites` table, GET/POST/DELETE, 401 for guests), client store
  `src/lib/favourites.ts` (`useFavourites` via useSyncExternalStore, optimistic toggle, guest→open-auth
  event + toast). Heart wired in TrackRowPlayer rows, PlayerProvider mini-player, and TrackDetail
  (fill #F4C430 when active). New `FavouritesSection.tsx` in the account under Downloads
  (adminNav + Account SectionId "favourites"). (2) SIMILAR TRACKS — TrackRowPlayer row "Similar"
  action navigates `/catalog?genre=&mood=` from the track's first genre+mood; TrackDetail
  similarTracks scored genre*2 + mood*2 + useCase overlap, top 6, fallback first 4. (3) HEADER ACCOUNT
  MENU — clicking the person icon while logged in now opens a dropdown (Navigation.tsx: acctOpen state,
  click-away ref, close on route change) instead of jumping to the dashboard: Profile / Plan & Billing /
  Downloads / Favourites / Licenses / Support, divider, then Log out (calls logout()+navigate("/")).
  Items link to `/account?section=<id>`; Account.tsx got a useEffect to sync the active section from
  the query param live (so switching works when already on /account). Same items inlined in the mobile
  burger for logged-in users; guests still get the auth modal. Renamed account "Sign out" → "Log out".
  Build ✓. STILL LATER: smart popularity ranking (anti-gamed) #30, funnel audit #26.
- **2026-07-08 (WAV zip + 320 unlocked for one-time license buyers):** closed the "sold WAV but
  couldn't download it" gap — `/api/download` only honored the Max plan; sync_orders was never
  checked. SERVER: `download.ts` reordered (track resolved BEFORE the gates), new `hasLicense` =
  `sync_orders WHERE user_id AND track_id IN (track.id, slug)` (slug covers the PayPal-capture
  fallback that stored a slug as track_id); a license bypasses BOTH the WAV Max-gate and the free
  3/month limit for that track; such downloads are logged `plan_at_download='license'` and excluded
  from the free-limit COUNT (same exclusion added to `/api/me` downloadsUsedThisMonth). WAV-gate
  error text now mentions the license path. `licenses.ts` returns `trackSlug` (JOIN tracks.slug).
  FRONTEND: `downloadTrack.ts` gained `fetchMyLicenseFor(slug)` (`OwnedLicense {id,tier}`, 30s
  module cache, maps both trackSlug and trackId; non-ok NOT cached so login→resume isn't stale) +
  the "plan" toast retitled "Not included in your plan". `DownloadOptionsModal` fetches the license
  when opened (authed): unlocks WAV + MP3 320 (`locked = planRank check && !license`), badges show
  LICENSED, gold footer note "You own a license for this track", attribution popup SKIPPED for
  licensed free-plan downloads, "Include PDF License" checkbox now also shows for free-plan license
  owners and fetches `?order=<sync_id>` (purchase cert) instead of `?slug=` when licensed.
  `LicenseEntry` gained `trackSlug`; Account → Licenses rows got MP3 320 + WAV zip buttons (same
  pattern as Downloads history; versionId "main"). NOTE: STEMS stays SOON/disabled; server treats
  any tier as WAV-unlocking (all three tiers advertise WAV). Sandbox VM didn't start this session —
  no sandbox checks at all; all edits made+verified via host Read (whole-file reads of download.ts
  and DownloadOptionsModal.tsx), authoritative lint/tsc/build = deploy.bat on the host.
- **2026-07-08 (catalog sorting #30 — Recommended/New/Popular BUILT):** implemented
  docs/CATALOG_SORTING.md modes 1-3 (spec file updated with a STATUS block; star-rating staging
  stays a post-import task). SERVER `/api/tracks`: now returns `created_at` (added to all three
  defensive SELECT tiers) and `downloads` = per-track COUNT from download_log (single GROUP BY
  query, guarded). CLIENT: `CatalogTrack` + useTracks mapTrack gained `createdAt`/`downloads`.
  NEW `src/lib/catalogSort.ts`: mulberry32 PRNG + FNV-1a `dailySeed()` (local date → order stable
  within a day, refreshes daily), `buildRecommendedRank(tracks, featuredIds)` (featured =
  admin trending ids, seed-shuffled among themselves, pinned first; the rest grouped by primary
  genre — first "/"-segment, fallback mood — groups + contents seed-shuffled, then dealt
  round-robin one-per-group so single-genre batches spread out), `sortTracks(list, mode, rank)`.
  `useContent.ts` gained `useTrendingIds()` (raw trending id list). `Catalog.tsx`: sort renamed
  "Featured" → **"Recommended"** (new default), New = createdAt DESC (mock fallback keeps the old
  reverse() since mocks have no dates; NOTE pre-code-system live rows may share created_at — ties
  break by the mix), Popular = real `downloads` DESC with ties falling back to the Recommended mix
  (was the BPM placeholder). recommendedRank computed once per tracks+trendingIds via useMemo;
  filtering preserves it, pagination unaffected. Sandbox VM still down — verified via host reads;
  lint/build = deploy.bat. LATER: anti-gamed popularity (weight by unique users/time window),
  star-rating "newness" staging after the bulk import.
- **2026-07-08 (admin side panels on the public track page):** owner request (was told to a
  previous AI but never built; not in docs before now): as ADMIN, opening /track/:slug shows two
  extra sticky side columns so a track can be curated while listening, without going to /admin.
  NEW `src/components/AdminTrackPanel.tsx`: `useAdminTrackContent(enabled)` (GET /api/admin/content
  once + `run()` POST helper), LEFT `AdminTrackTagsPanel` = collapsible Use Case / Genre / Mood
  checkbox groups from live vocabularies (toggle → bulk_update_tracks facets add/remove for this
  track, then reloads /api/tracks so the page pills refresh) + a **Trending tracks box** (ordered
  list with titles, current track highlighted gold, ↑/↓ arrows + X per row, "+ Add this track"
  button — all via set_trending with optimistic local state; same list drives the homepage block);
  RIGHT `AdminTrackCollectionsPanel` = Collections + Playlists lists (cover thumb + title + button:
  grey PLUS when not a member → adds; green CHECK when member → hover red, removes; via
  bulk_update_tracks collectionChanges/playlistChanges, optimistic trackIds update). TrackDetail.tsx:
  `useCurrentUser` + `useTracks().source`; panels render ONLY for role=admin AND source==="api"
  (mock-fallback edits would no-op against D1); admin layout = main widens max-w-7xl→max-w-[110rem],
  content wrapped in `xl:grid-cols-[17rem_minmax(0,1fr)_19rem]` (panels stack above/below content
  under xl); customers see the unchanged centered page. No new backend — reuses the admin content
  API as-is. Verified via host reads (sandbox VM still down); lint/build = deploy.bat on the host.
- **2026-07-08 (track-panel polish + inline admin on Playlists/Collections pages):** owner round 2.
  (1) TRACK PANEL: right-panel Collection/Playlist titles are now Links to /collection/:id //
  playlist/:id; Trending rows got a play button + a WaveformPreview (h-5) under each title (wired
  to the global player, click-to-seek). `AdminContentItem` gained shortTitle/description.
  (2) INLINE ADMIN ON PUBLIC CONTENT PAGES — NEW `src/components/AdminInlineContent.tsx`:
  `useContentAdmin()` (role=admin && useTracks().source==="api"; reuses useAdminTrackContent),
  `AdminAddItem` ("+ Add playlist/collection" inline title form next to the H1),
  `AdminItemBar` (gold bar under every card: ↑↓ reorder / ✎ rename [collections also sync
  shortTitle] / 🗑 delete with confirm; hidden for mock rows), `AdminItemEditor` (detail pages:
  title/image URL/description form + Save, red Delete → navigates back, and a "Tracks in this
  {kind}" list with per-track X = set_tracks without that id). Wired into Playlists.tsx /
  Collections.tsx (cards wrapped in a div so the bar sits under the Link) and PlaylistDetail /
  CollectionDetail (editor card under the header; CollectionDetail passes reloadTracks since its
  rows come from /api/tracks collectionIds). (3) BACKEND: new `reorder_content` action in
  admin/content.ts ({kind, values: ordered ids} → UPDATE sort). (4) LIVE REFRESH: useContent.ts got
  `refreshContent()` (drops the module cache + notifies `contentListeners`); ALL content hooks
  (useCategories/useVocabularies/useCollections/usePlaylists/useTrendingIds/useTrendingTracks) now
  subscribe and refetch, so admin edits repaint the public pages instantly. KNOWN EDGE: hooks keep
  the last non-empty list, so deleting the LAST playlist/collection leaves its card until a page
  reload (the guards that power mock-fallback also skip empty live lists). Verified via host reads;
  lint/build = deploy.bat.
- **2026-07-08 (inline admin v2 — owner feedback round):** (1) Detail pages: the bulky
  "Admin — edit this {kind}" card is GONE. Replaced by in-place editing: `AdminEditableText`
  (click the H1 title or the description paragraph → input/textarea in place, Enter/blur saves,
  Esc cancels; empty description shows a clickable italic placeholder) + `AdminCoverControl`
  (hover the 40x40 header cover → Upload button [file picker → POST /api/admin/upload → upsert
  image] and a Trash button to clear it) + small red `AdminDeleteItemButton` under the header.
  (2) REMOVE-TRACK X moved onto the track rows themselves: `TrackRowList` gained optional
  `adminRemove?: (trackId) => void` (renders a slim X column right of each row);
  `makeRemoveTrackHandler(kind, id, admin, onTracksChanged?)` (NOT a hook) feeds it on both detail
  pages; the old side "Tracks in this…" list is gone with the editor card. (3) DRAG & DROPP
  reorder on /playlists and /collections: `useAdminDragReorder(kind, admin)` (native HTML5 DnD,
  no deps) → spread `dragProps(id)` + `dragClass(id)` on each card wrapper; dragged card dims,
  drop target gets a gold ring; arrows removed from `AdminItemBar` (now grip-hint + rename +
  delete). (4) NO-F5 FIX: membership toggles + trending saves in AdminTrackPanel now call
  `refreshContent()`, so adding a track from its page and opening the playlist immediately shows
  it. (5) Track-page membership thumbs use the public fallback cover
  (/images/collections/orchestral.jpg) with a Music2 placeholder behind onError, so playlist
  minis are never blank. `AdminItemEditor` component deleted. Verified via host reads; lint/build
  = deploy.bat.
- **2026-07-08 (cover-flash fix + parallelogram playlist cards + playlist THEMES):** (1) FLASH BUG
  (owner: "открываю плейлист — картинка на весь экран, потом уменьшается"): `AdminCoverControl`
  returned bare children (no sized wrapper) until the admin data loaded / for non-admins, so the
  h-40 w-40 header cover painted full-width for a moment. Now it ALWAYS renders
  `<div className={className}>` around the children. (2) /playlists redesigned: cards are
  PARALLELOGRAMS in the catalog-strip language (`skewX(-9deg)` box h-64, counter-skewed image
  scale(1.32) with opacity fade-in on load, dark bottom gradient, title + "N tracks" + gold
  hairline + arrow inside; new `PlaylistCard` in Playlists.tsx; grid 2/3/5/6 cols). (3) PLAYLIST
  THEMES (sections like tunetank's Featured/Fashion/Podcast): new lazy `playlists.theme` column
  (`ensurePlaylistThemeColumn` in admin/content.ts — ALTER try/catch, called from GET + upsert);
  `upsert_playlist` accepts `theme` BUT leaves it untouched when the field is absent (so the old
  /admin editor can't wipe it); admin GET + public /api/content return `theme` (public select has
  a legacy fallback); `LivePlaylist.theme` + `AdminContentItem.theme`; upsertPayload resends it.
  /playlists groups cards into theme sections (themeless first without a header, then themes in
  global drag-order of first appearance; h2 per section). Theme is set from the card's admin bar:
  new **Tags button** (gold when a theme is set) → same inline input saves the theme (empty
  clears). DnD reorder still works inside/across sections (it edits the one global sort).
  Migration 0001_init.sql NOT updated with theme (lazy ALTER covers prod; add on next migration
  touch). Verified via host reads; lint/build = deploy.bat.
- **2026-07-08 (modern loading + theme-first creation UX — owner round):** owner flagged mock-data
  flashes on F5 ("collection pics load then vanish", "Playlist not found flashes before content").
  (1) NEW `useContentReady()` in useContent.ts (module `settled` flag — false until the first
  /api/content attempt finishes). `refreshContent()` reworked to STALE-WHILE-REVALIDATE: it no
  longer nulls the cache; it refetches, swaps the cache in, THEN notifies hooks — and returns a
  Promise so flows can await fresh data before navigating. `useCollections`/`usePlaylists` now
  lazy-init their state from the module cache (no mock flash on SPA navigation) via extracted
  `mapCollections`/`mapPlaylists`. (2) SKELETONS: /playlists shows pulsing parallelogram
  placeholders until ready; /collections pulsing 4:3 cards; PlaylistDetail + CollectionDetail
  show a full header+rows skeleton and render "not found" ONLY after `ready` — no more flash.
  (3) PlaylistDetail header cover is now a PARALLELOGRAM (skew wrapper via AdminCoverControl
  className `[transform:skewX(-9deg)]`, counter-skewed img, fade-in onLoad). Breadcrumb eyebrow
  shows "Playlist · <Theme>". (4) CREATION UX redesigned (owner: "готовый продукт, не тесты"):
  the top "Add playlist" button is GONE from /playlists; every theme section (incl. themeless)
  ends with an admin-only dashed GHOST parallelogram card "+ New playlist in <theme>" → inline
  title input → creates via new `admin.call()` (returns the created id; `useAdminTrackContent`
  gained `call`, `run` now wraps it) → AWAITS refreshContent()+reload → navigates to the new
  /playlist/<id> where the owner uploads the cover (hover) and clicks the description in.
  Page bottom: admin-only "+ New theme" button → adds a client-side draft section (empty sections
  persist only once a playlist is created in them; drafts list in page state). Collections page
  keeps AdminAddItem (no themes there). Verified via host reads; lint/build = deploy.bat.
- **2026-07-08 (card hover feng-shui + playlist preview play):** (1) Playlist cards got a HOVER
  PREVIEW: soft black/45 overlay fades in with a centered gold play button — clicking it plays the
  playlist's FIRST playable track via the global player WITHOUT navigating (preventDefault/
  stopPropagation inside the Link); while that track plays the overlay stays visible with a Pause.
  `useTracks` is called ONCE in Playlists and passed into PlaylistCard as a prop (per-card hook
  instances would each refetch /api/tracks). Bottom title block is pointer-events-none so it
  doesn't block the button. (2) Removed the gold hover BORDER highlight from playlist (skewed
  edges looked aliased/"low-poly") and collection cards. (3) Collections hover zoom de-jittered:
  img now `transform-gpu will-change-transform [backface-visibility:hidden] duration-700 ease-out
  group-hover:scale-[1.06]` (GPU compositing kills the sub-pixel jump at animation start/end).
  Verified via host reads; lint/build = deploy.bat.
- **2026-07-08 (track-row tag pills clipping):** the third Use Case/Genre/Mood pill could get
  hard-clipped under the "+N versions" button — the pills container got `pr-4` + a right-edge
  fade via CSS mask (`[mask-image:linear-gradient(to_right,#000_calc(100%-1.25rem),transparent)]`)
  so an overflowing pill fades out instead of cutting. PADDLE STATUS (owner): after the copy
  repositioning the domain was resubmitted; owner also ADDED the domain a second time in
  Checkout → Website Approval — now one row "Unapproved" (the old verdict) + one "Pending"
  (stuck ~4h; the first automated review had answered in minutes, manual re-reviews take days).
  Advice given: delete the duplicate row, keep ONE, wait 1-2 business days, then contact Paddle
  support via the dashboard Help widget / sellers@paddle.com referencing the review email and
  stating the catalog is original first-party music licensed directly (not third-party stock
  resale). Billing stays paused (BILLING_ENABLED=false) until Paddle approves or the
  Stripe/PayPal fallback is chosen.
- **2026-07-08 (whitelist claim workflow — NEXT_STEPS §1 DONE):** the owner's morning claim-removal
  routine is now one screen. BACKEND: new `functions/api/admin/_whitelist.ts` (shared ytChannel/
  ytUploads/channelNewVideos + `ensureWlHandled` + `handledMap`); `whitelist-videos.ts` refactored
  onto it and now returns `handled`/`handledAt` per video; NEW `whitelist-videos-all.ts` (GET,
  admin) = new uploads across ALL active channels (JOIN users + latest sub, sequential YT calls,
  cap 50 channels) grouped `{channelId, channelUrl, channelTitle, userId, customer, plan,
  videos[{...,handled,handledAt}]}`; NEW `whitelist-handled.ts` (POST {videos:[{videoId,userId,
  channelId,url,title}]} → INSERT OR IGNORE into new `wl_handled` table; DELETE ?videoId= →
  un-mark). `wl_handled` added to 0001_init.sql + lazy-created. FRONTEND: `AdminWhitelist.tsx`
  got two tabs — **"All new videos"** (default): toolbar with "N new · M handled" counter,
  Select all/none, **Copy all/selected** (newline-joined URLs → clipboard, ready for the provider's
  bulk tool), gold **Mark as sent (N)** (optimistic local update), **Show handled** toggle
  (handled rows struck through with an "undo" button), Refresh, per-video Copy + per-group
  "X new · Y handled"; and **"Channels"** = the original table (its expander now strikes handled
  videos too). No new owner steps (YOUTUBE_API_KEY already set; wl_handled self-creates).
  Verified via host reads; lint/build = deploy.bat.
- **2026-07-08 (STEMS upload + BULK UPLOAD with drafts — mass-import plan stages 1+2):** owner's
  bulk-import plan agreed (4 stages, owner-approved): 1) stems, 2) bulk WAV upload as drafts,
  3) metadata via CSV export→match→import (unified column format; AI merges the composers' own
  spreadsheets), 4) composer accounts/panel + admin uploads with a composer picker + nicknames.
  STAGES 1+2 BUILT THIS SESSION:
  **STEMS:** upload-audio.ts gained kind=stems (private masters/stems-*.zip); lazy
  `tracks.r2_key_stems` column; bulk_update_tracks `fields.stemsKey` (sets key + has_stems=1) and
  `fields.status`; download.ts serves format=stems (Max/licensed gate like WAV, filename
  `tvmusicstore.com_<code>_<Title> STEMS.zip`); DownloadArgs gained `hasStems` — all four
  openDownloadOptions call sites pass track.hasStems and the modal's STEMS option is enabled
  per-track (SOON only when no stems uploaded); AdminTracksEdit single-track panel got an
  "Upload stems ZIP" button (AdminContent.uploadStems: upload → fields.stemsKey → override).
  **DRAFTS:** create_track accepts status:"draft" (bulk uploads hidden from customers);
  /api/tracks honors ?drafts=1 for ADMIN sessions only (returns `status` too);
  useTracks({drafts:true}) used by AdminContent; DRAFT amber badge in the AdminTracksEdit table;
  gold **Publish (N)** button next to Delete (bulk_update_tracks fields.status=published).
  **BULK UPLOAD:** NEW `src/components/AdminBulkUpload.tsx` + admin nav item "Bulk Upload"
  (Catalog group, UploadCloud icon) + Admin.tsx section `bulkupload`. Drop/browse many WAVs →
  grouped by filename base ("Epic Battle (short).wav" → suffix "short"); LONGEST version becomes
  Main (owner's choice); sequential queue (encode 320/128 via the existing audioEncoding.ts
  pipeline → upload previews → zip WAVs → create_track as draft), per-track status line
  (queued/working/done/error, errors don't stop the queue, re-Start retries failed, "Stop after
  current", "Clear done"); advice in UI: batches of ~20-30, keep the tab open. NEXT (stage 3):
  CSV export/import of track metadata (fixed column format), then stage 4 composers.
- **2026-07-08 (link-preview og:image fix):** owner: Telegram preview of tvmusicstore.com showed
  the Epic Adventure collection photo (it was hardcoded as og:image in index.html; crawlers don't
  run JS so per-route useSeo doesn't matter to them). index.html now points og:image +
  twitter:image at the square gold logo `/images/icons/web-app-manifest-512x512.png`
  (+og:image:width/height 512) and twitter:card switched summary_large_image → **summary**
  (compact logo card, like tunetank/vicate previews). UPGRADE PATH (commented in index.html):
  when the owner makes a bold 1200x630 branded banner (dark graphite bg + big gold logo +
  wordmark, e.g. in Canva), drop it as public/images/og-cover.png, point both image tags at it
  and switch back to summary_large_image. NOTE: Telegram caches previews — after deploy, paste
  the URL to @WebpageBot in Telegram to force-refresh. Track pages keep their per-track og:image
  via useSeo (only matters for JS-running crawlers).
- **2026-07-08 (London correspondence address LIVE):** owner bought Ghost Mail's Sole Trader
  package (order ROG003227); assigned mailing address = **TV Music Store, 5 Brayford Square,
  London, E1 0SG, United Kingdom**. Filled the ADDRESS constants in `LicenseTerms.tsx` (+
  "Correspondence address:" prefix in §15 Contact) and `Privacy.tsx`; EFFECTIVE bumped to
  8 July 2026 on both. OWNER STEPS PENDING: (1) reply to the Ghost Mail order email confirming
  the business name "TV Music Store"; (2) complete the TrustID identity check when their email
  arrives (mail forwarding is blocked until then). This address is also what goes to Paddle if
  they ask for a business address. NOTE: it's a mail-forwarding address for a sole-trader/
  partnership — NOT usable as a Companies House registered office if a Ltd is ever formed.
- **2026-07-08 (bulk upload v2 — folders, star-Main, clean labels + delete on track page):** owner
  test feedback (grouping missed when files were added after a group finished; wanted visible/
  overridable Main; wanted folder-based import). `AdminBulkUpload.tsx` REWRITTEN:
  (1) **Folder = track**: drop folders (webkitGetAsEntry traversal, chunked readEntries, nested
  dirs keep the TOP folder name) or use the new "Select folder" button (`webkitdirectory` input,
  React attr cast) — folder name = title, every WAV inside = a version; loose files still group
  by "(suffix)" filename parsing, and later drops MERGE into an existing queued group by title.
  (2) Groups whose track is already CREATED (status done) reject new files with a toast (no
  duplicate tracks); "working" groups can't be modified mid-flight (was the Action Pulse bug —
  files added to a running/finished group were silently mishandled).
  (3) Each group lists its files: **star = Main override** (default auto: longest, shown as
  "main: longest (auto)"), X removes a file from the group.
  (4) Version labels now run through `cleanVersionLabel(fileBase, title)` — "Opening Up Space
  (middle version).wav" → site label "middle version" (Main falls back to "Main").
  (5) TRACK-PAGE DELETE: `AdminTrackTagsPanel` header (PanelShell gained `headerAction`) got a
  small trash button → confirm → `delete_track {id}` → refreshContent + navigate to /catalog.
  Composer pseudonyms (artist is still hardcoded "TVMUSICSTORE" in useTracks.mapTrack) = plan
  stage 4, next.
- **2026-07-08 (per-version management on the track page — owner-approved design):** decision:
  admin Tracks stays the MASS tool (tags/publish/delete in bulk); everything per-track lives on
  the track page's admin panels. NEW left-panel **Versions block** (`VersionsBlock` in
  AdminTrackPanel.tsx, between facets and Trending): each version row = ★ (gold = Main; click
  another star → `set_main_version`), play (global player), label (✎ inline rename →
  `rename_version`), duration, X (delete → `delete_version`; Main and the last version are
  protected), and a gold **+ Add** button (pick a WAV → browser encodes MP3 320/128 via
  audioEncoding → uploads previews → `add_version`). WAV BUNDLE REBUILD: new admin-only
  `GET /api/admin/master?track=<id>` streams the private zip; the panel unzips it (new
  `unzipBlob`/`zipEntries` in audioEncoding.ts, fflate), adds/removes the file (delete matches
  the zip entry by normalized label — warns and leaves the zip untouched when no match), re-zips
  (store level 0), uploads a new wavzip and passes `wavZipKey` to the action. SERVER
  (admin/content.ts): new actions `add_version` (next free vN id, sort=max+1, optional
  wavZipKey), `delete_version` (main + last-version guards), `rename_version`,
  `set_main_version` (rewrites all rows — chosen first as version_id "main"/sort 0, rest v2+;
  tracks.duration follows the new main; PKs are trackId:versionId so rows are re-inserted).
  ALSO: TrackDetail now loads `useTracks({drafts: user.role==="admin"})` so DRAFT track pages
  open for the admin (they 404'd before — broke curating bulk drafts) + an amber DRAFT badge
  next to the title (admin only). Body type in content.ts gained versionId/label/preview128.
- **2026-07-08 (Tracks Edit v3 — track-page-style layout, owner-approved):** owner disliked the
  bulky right panel; restructured `AdminTracksEdit.tsx` to mirror the track page. LAYOUT: with a
  selection, TWO slim sticky gold-bordered columns appear LEFT of the table — "Add to"
  (Collections / Playlists / Categories tri-state membership; Collections leftmost per owner) and
  "Tags" (Use Case / Genre / Mood tri-state); with EXACTLY ONE track selected a compact fields
  panel appears on the RIGHT (title / BPM / extra tags / description / cover+Upload / stems
  toggle+ZIP upload + link to the track page) — grid
  `[16rem_16rem_minmax(0,1fr)_21rem]` (or without the last col for multi-select; plain 1-col when
  nothing selected). The old monolithic right panel + its footer are gone; **Apply/Reset moved to
  the table toolbar** ("N selected ✕ · Reset · Apply Changes", one Apply saves panels + fields).
  VERSIONS IN THE TABLE: new "Ver." column (×N button) → expander row listing versions with
  ★ set_main_version / play / X delete_version (main+last protected; NOTE: table delete does NOT
  rebuild the WAV zip — full tools incl. bundle rebuild live on the track page, expander links
  there). New `onTracksReload` prop from AdminContent refetches /api/tracks after version ops.
  ALSO: AdminContent header buttons Publish/Delete/+Add Track grouped in one right-side cluster
  (no more spreading); track-page admin panel: trash now says "Delete track", Trending box shows
  "This track is in Trending — position #N" instead of the Add button when already listed.
- **2026-07-08 (Tracks Edit v4 — owner polish round):** (1) PANEL ORDER changed to owner's:
  table · Track details · Tags · Add to (grid `[minmax(0,1fr)_21rem_16rem_16rem]`), and ALL
  panels are ALWAYS rendered — panels that don't apply to the selection are DIMMED
  (`opacity-40 pointer-events-none` via `dimIf`): Tags/Add-to dim with no selection, Track
  details dims unless exactly one track is selected (shows a hint then). (2) Track details
  fields: BPM got its own labeled row; EXTRA TAGS grew from a small input into a 4-row TEXTAREA
  below Description. (3) STEMS handling: the Ver. button shows `×N +S` (gold) when the track has
  a stems bundle (col widened 3.5→4.5rem); the versions expander got a "Stems ZIP attached" row
  with an X → new `fields.clearStems` in bulk_update_tracks (NULLs r2_key_stems + has_stems=0);
  after removal onApplyOverrides flips hasStems locally + onTracksReload. NOTE: clearing does not
  delete the zip object from R2 (orphan files are harmless; R2 cleanup = maybe later).
- **2026-07-08 (version rename in table + footer discipline + account menu paint fix):**
  (1) Tracks Edit versions expander: DOUBLE-CLICK a version label → inline input →
  `rename_version` → onTracksReload (Esc cancels). (2) FOOTER: owner complained short pages pull
  the footer up mid-screen; wanted tunetank behavior (always below the fold, revealed by
  scrolling). ONE global CSS rule in index.css @layer base instead of touching 17 pages:
  `.min-h-screen:has(> footer)` becomes flex-column and its direct `> main` gets
  `flex:1 0 auto; min-height:100vh` — footer always sits below the viewport, scroll reveals it;
  pages without a Footer (catalog, track) untouched; needs :has() (all evergreen browsers).
  (3) ACCOUNT PAGE MENU FIX (owner screenshots): /account still conditionally MOUNTED its menu
  blocks (`{menu === "admin" && …}`) → Chromium "no paint until reflow" bug (blank/flat items
  until a click), and its Admin submenu was the FLAT adminNavItems list without group headers.
  Now: both blocks always rendered, toggled hidden/flex, and the Admin submenu renders
  **adminNavGroups** with Overview/Catalog/Customers/Requests headers — identical to the /admin
  sidebar (adminNavItems import dropped). /admin itself was already fixed earlier.
- **2026-07-08 (track-page admin top bar + cover overlay):** (1) NEW `AdminTrackTopBar` (in
  AdminTrackPanel.tsx, rendered in TrackDetail under the breadcrumb, admins only): "Admin" label +
  status chip (amber "Draft — hidden from customers" / green "Published") + gold **Publish** (or
  subtle **Unpublish** back to draft; bulk_update_tracks fields.status) + red **Delete track**
  (moved here FROM the left panel header — deleteTrack/headerAction removed from
  AdminTrackTagsPanel). (2) NEW `AdminTrackCoverOverlay`: hovering the track-page cover square
  (now `group/cover`) shows Upload + Remove buttons — upload sends the image to /api/admin/upload,
  auto-generates a row thumbnail via makeThumbnail (uploaded separately, non-fatal on failure) and
  saves via bulk_update_tracks fields {cover, coverThumb}; remove clears both. Server: `fields`
  gained `coverThumb` (→ cover_thumb). Works for tracks with no cover yet (placeholder hover).
- **2026-07-08 (sidebar spacing unified — /account and /admin identical rhythm):** the "spacing
  shifts on click" was TWO different sidebars: clicking an admin item on /account navigates to
  /admin whose sidebar used its own scale (nav space-y-1, blocks space-y-3, labels pb-1 /50
  opacity) vs /account (groups mb-5, labels pb-1.5 /70). BOTH now use ONE scale: group blocks
  `md:mb-5`, group labels `px-3 pb-1.5 …/70`, item lists `md:space-y-1`, margin-based spacing
  only (no flex `gap` anywhere in either sidebar — Chromium's gap-recalc bug), both menu blocks
  always rendered + hidden/flex toggling on both pages.
- **2026-07-08 (admin Playlists grouped by theme + DnD):** the /admin → Playlists view now
  mirrors the public /playlists page: playlists render inside THEME sections (themeless first =
  "No theme (top of the page)"), each section header shows the count + ↑↓ buttons that move the
  WHOLE theme (its playlists travel with it), and every playlist row (grip icon + 36px cover
  thumb) is native-DnD draggable — drop on another row inserts before it, drop on a section's
  empty area appends; dropping into a different theme also updates that playlist's `theme`
  (upsert_playlist with full current fields) before `reorder_content` persists the flattened
  global order; then reload() + refreshContent() so the public page follows instantly.
  ContentItem/emptyDraft gained `theme`; the playlist EDIT form got a "Theme" input (empty = no
  section) and the upsert sends it (collections unaffected — their flat list kept). All layout
  ops disabled while busy. Also: /admin Log-out button unified with /account ("Log out", no mt-1)
  so it doesn't shift between pages.
- **NEXT SESSION — STAGE 4 "COMPOSERS", owner-approved spec (2026-07-08). Build this next:**
  (1) Roles & pseudonyms: admin sets a user's role to composer + a display pseudonym; the site
  shows the pseudonym as the track artist everywhere (replace the hardcoded "TVMUSICSTORE" in
  useTracks.mapTrack; `composers` table + tracks.composer_id already exist in the schema).
  (2) Admin composer picker: when the OWNER uploads (Bulk Upload + Add Track) he picks the
  composer from a list (including himself/his pseudonym).
  (3) **Composer Panel upload — owner's exact UX** (composers get NO Bulk Upload, one simple
  "Add track" flow): opening it shows a Bulk-style drop zone "drop WAV files here" — several
  WAVs = versions of ONE track; then ONLY these fields: Title, BPM, Description, Extra Tags,
  Stems ZIP (optional) — **NO category field**; the stems CHECKBOX does not exist — has_stems
  flips automatically when a stems zip is attached (checkbox is redundant; consider removing the
  manual checkbox from the admin panels too for the same reason); the composer can star which
  WAV is the Main version; one "Upload" button at the bottom.
  (4) **Review queue**: composer uploads are created with `moderation_status='pending'` (column
  already in schema; /api/tracks filters approved only) → the track lands in the ADMIN for
  review, where the owner adds the rest (Use Case/Genre/Mood, cover, collections…) and
  approves/publishes. Composers see only their own tracks in their panel.
  THEN STAGE 5 (former 3): CSV metadata export → match with composers' spreadsheets → import.
- **2026-07-08 (STAGE 4 "COMPOSERS" — built per the spec above):**
  **(1) Roles & pseudonyms:** `/api/admin/users` GET now returns `pseudonym` (LEFT-join-style
  subquery on composers.user_id); PATCH accepts `{userId, role?, pseudonym?}` — pseudonym upserts
  a `composers` row (newId cmp_, unique slug w/ suffix on collision). Admin → Customers: when a
  user's role is composer, a small "Pseudonym…" input appears under the role select (saves on
  Enter/blur). `/api/tracks` joins a composers id→display_name map and returns `artist` per track;
  `useTracks.mapTrack` uses `t.artist || "TVMUSICSTORE"` (hardcode replaced).
  **(2) Composer picker on uploads:** `/api/admin/content` GET returns `composers`
  [{id,userId,displayName}]. AddTrackModal got a "Composer" select (default = house/TVMUSICSTORE)
  → `create_track` accepts validated `composerId`. AdminBulkUpload fetches the list itself and has
  a batch-wide Composer select in the toolbar (every track of the run gets it). Also in
  AddTrackModal: the stems CHECKBOX was removed per the spec — replaced by an optional "Stems ZIP"
  picker; `create_track` now accepts `stemsKey` (sets r2_key_stems + has_stems=1 automatically).
  **(3) Composer Panel:** NEW `src/components/ComposerUpload.tsx` (default export = the exact-UX
  Add-track flow: WAV drop zone (several files = versions of ONE track, title auto-suggested from
  the first filename), star = Main override (default longest), fields ONLY Title/BPM/Description/
  Extra tags + optional Stems ZIP, one gold Upload button; encodes MP3 320/128 in-browser, zips
  WAVs — same pipeline as admin) + named export `useComposerTracks(enabled)` (profile + own
  tracks). NEW endpoint `functions/api/composer/tracks.ts`: GET = own tracks (status,
  moderation_status, versions/downloads counts) + composer profile; POST = create track with
  composer_id = own profile, status='draft' + moderation_status='pending'. Requires a composers
  row linked to the user (clear error message otherwise). `/api/admin/upload-audio` now allows
  role=composer for preview/preview128/wavzip/stems (master stays admin-only). `/composer` page:
  Upload section renders ComposerUpload; "My tracks" shows LIVE own rows (pending review / draft /
  published / rejected badges) for real composer accounts, mock personas keep demo data; gate no
  longer locks out live composers without a mock profile (dashboard/earnings sections still mock —
  stage 5+).
  **(4) Review queue:** `/api/tracks?drafts=1` (admin) now returns ALL rows incl.
  moderation_status='pending' (+ the `moderation_status` field; public WHERE unchanged:
  published+approved only). CatalogTrack gained `moderation`. Admin Tracks table shows an orange
  REVIEW badge (pending) alongside the amber DRAFT badge; the track-page admin top bar shows
  "Pending review — <pseudonym>". Publishing APPROVES: bulk_update_tracks `fields.status=
  'published'` also sets moderation_status='approved' (+ explicit `fields.moderationStatus` and
  `fields.composerId` reassignment are supported).
  NOTE: cowork sandbox VM would not start this session — `npm run lint`/tsc were NOT run here;
  code was verified by careful read-through of host files. Run deploy.bat (it lints + builds) and
  fix anything it flags before pushing further work.
  NEXT: STAGE 5 — CSV metadata export → match composers' spreadsheets → import. Nice-to-haves
  spotted: composer select in the Tracks Edit single-track panel (reassign is API-ready via
  fields.composerId), "Reject" button UI for the review queue (API ready via
  fields.moderationStatus='rejected'), composer dashboard/earnings off mocks.
- **2026-07-08 (composer panel discoverability):** owner test: gave a user role composer + the
  pseudonym, but "nothing appeared" — the panel worked, there was just NO LINK to /composer
  anywhere in the UI (only the route existed). Fix: `composerNavItems` in adminNav.ts
  (Dashboard / Upload track / My tracks); /account sidebar now shows a "Composer" group with
  those links for `role === "composer"` (static links, always rendered — same spacing scale as
  the other groups); links go to `/composer?section=…` and Composer.tsx now honors `?section=`
  on load (same pattern as /admin). Tell composers to open Account → Composer → Upload track.
  [SUPERSEDED same day — see next entry: the studio moved INSIDE /account.]
- **2026-07-08 (composer studio inside /account + customers by role — owner feedback round):**
  (1) UPLOAD FORM: ComposerUpload shows ONLY the drop zone until WAVs are added — the version
  list, Title/BPM/Description/Tags/Stems and the Upload button appear after the first drop.
  (2) NO SEPARATE PANEL: composer sections moved into /account. NEW
  `src/components/ComposerPanel.tsx` (all six sections — dashboard / tracks / upload / earnings /
  requests / profile — ported from the old Composer page; exports ComposerSectionId +
  COMPOSER_SECTION_IDS; prefers the LIVE profile over mock personas, so an admin with a composers
  row sees his real pseudonym; dashboard shows live download/published totals when live).
  Account.tsx: SectionId gained `composer-*` ids; sidebar "Composer" group renders them in-page
  (for role composer: divider + plain group under Main; for admins: a third Main/Composer/Admin
  MenuGroupHeader toggle; ?section=composer-… auto-opens the right menu). composerNavItems now =
  the 6 sections. `/composer` route = redirect to /account?section=composer-… (old links keep
  working). /admin sidebar got the same Composer toggle (links to /account). ComposerPanel's
  profile section: pseudonym is read-only text (owner edits it in Customers), bio/payout fields
  still mock. (3) LOG OUT removed from BOTH /account and /admin sidebars (header avatar popup
  already has it). (4) ADMIN → CUSTOMERS: one table → three role groups (Admins / Composers /
  Customers, each with count); the pseudonym input now also shows for ADMINS (the owner composes
  too — set his pseudonym there so he appears in upload pickers and gets his own composer studio);
  changing a role INTO or OUT OF admin asks window.confirm first. NOTE: sandbox VM still down —
  lint/tsc not run here; verified by read-through, deploy.bat validates on the host.
- **2026-07-08 (Users manager v2 — composer is a FLAG, ⋯ row menu, owner round):** owner: "how do
  I make MYSELF a composer while staying admin?" — the single role select couldn't express that,
  and the grouped tables + native select looked "Windows 98". REWORK:
  **Model:** being a composer = having a `composers` profile row (pseudonym), INDEPENDENT of the
  role; role is now effectively admin|customer ('composer' role = legacy, still honored).
  Permissions updated: /api/admin/upload-audio + /api/composer/tracks allow anyone with a
  composer profile (or admin/legacy role); /account shows the Composer menu group when a profile
  exists (Account probes /api/composer/tracks for plain customers; admins/composer-role always
  see it). PATCH /api/admin/users gained `removeComposer: true` — deletes the profile but
  REFUSES while the composer still has tracks (no orphans), and downgrades legacy role composer
  → customer.
  **UI (Admin → "Users", renamed from Customers):** filter tabs All / Users / Composers / Admins
  (counts; composers = has pseudonym or legacy role), ONE table with role PILLS (gold Admin,
  outlined "Composer · pseudonym", grey Customer), and a ⋯ button per row opening a
  position:fixed dropdown (can't be clipped by the table scrollbox): checkbox **Admin** (locked
  with a note for OWNER_EMAIL so the owner can't demote himself; both directions still
  window.confirm via changeRole) + checkbox **Composer** (ON reveals the pseudonym input —
  profile is created when it's saved on Enter/blur; OFF = confirm → removeComposer). The old
  role select + grouped tables are gone. OWNER HOW-TO: Admin → Users → your row → ⋯ → tick
  Composer → type your pseudonym → Enter; the Composer studio appears in your account menu and
  you appear in the upload composer pickers. Sandbox still down — validate via deploy.bat.
- **2026-07-08 (owner polish round: nested bulk folders, auto-Main, Tracks tabs, account
  deletion, tag pills):**
  (1) BULK UPLOAD nested folders: the CLOSEST folder around a WAV names its track (was: top
  folder) — dropping a wrapper folder full of track folders imports each subfolder as its own
  track (drag&drop entry traversal + webkitRelativePath now take the last dir segment).
  (2) COMPOSER UPLOAD: the Main star is placed AUTOMATICALLY on the longest file (duration
  probed via audio metadata right after adding; file size tiebreaker) until the composer stars
  one manually; the "main: longest (auto)" hint line removed.
  (3) TRACKS EDIT: status tabs "Live (N)" / "Drafts & Review (M)" above the table (drafts tab =
  status draft OR moderation pending); the whole toolbar (tabs/search/composer filter/Apply
  cluster) moved ABOVE the 4-column grid so the table header row aligns with the top of the
  side panels.
  (4) ACCOUNT DELETION — tracks are bulletproof: new `deleteUserAccount()` in _utils.ts DETACHES
  the composer profile (composers.user_id -> NULL; tracks keep their artist and stay published),
  deletes sessions/subscription/whitelist/favourites/auth codes, keeps history rows
  (download_log, plan_licenses, sync_orders). Admin → Users ⋯ menu got a red "Delete user…"
  (confirm; owner + your own account are server-protected). Self-delete: DELETE /api/me +
  red "Delete account" in Account → Profile — CUSTOMERS ONLY (admins & composer accounts are
  refused server-side AND the button is hidden). PSEUDONYM RULES: unique case-insensitively
  (400 "already taken" if another user has it); giving a user the pseudonym of a DETACHED
  profile RE-ATTACHES that profile — the new user inherits the old composer's tracks (owner's
  requested recovery path after deleting a composer's user by mistake). Tracks are deleted ONLY
  by explicit admin actions (Tracks manager bulk Delete / track-page Delete).
  (5) TAG PILLS on track rows: tags column widened 17→18rem (xl) / 19→20rem (2xl) + pills pulled
  `xl:-ml-2` into the column gap, so the third pill fits instead of fading out.
  Sandbox still down — lint/build via deploy.bat on the host.
- **2026-07-09 (AI cover generation — OpenAI Images):** track-page cover overlay (admin hover)
  got a gold ✨ Generate button next to Upload/Remove. Flow: popover with ONE optional
  "featured element" word (e.g. violin) → POST NEW `functions/api/admin/generate-cover.ts`
  (admin only) → OpenAI `/v1/images/generations`, model **gpt-image-1.5**, quality medium,
  1024x1024; the owner's fixed cinematic key-art prompt is EMBEDDED in that file with
  `<USE_CASE>` / `<MOOD>` placeholders filled from the track's SAVED use_case/mood columns
  (fallbacks "Film & TV" / "Cinematic, Emotional"), + optional featured-element line. Result
  PNG (b64) → R2 `covers/<slug>-ai-<uuid>.png` → returns /api/file path → client builds the
  row thumbnail (makeThumbnail) and saves cover+coverThumb via bulk_update_tracks — identical
  tail to a manual upload, so the art shows up instantly on the track page + row thumbs.
  Env: `OPENAI_API_KEY` added to _utils Env + /api/health reports `openai:
  configured|missing`. SECURITY NOTE: the owner pasted an OpenAI key IN CHAT — he was told to
  REVOKE it and create a fresh one, then add it as the OPENAI_API_KEY secret in Pages →
  Settings → Variables and Secrets (never commit keys; never echo them in chat).
  OWNER STEPS: (1) revoke pasted key, create new; (2) add OPENAI_API_KEY secret; (3) deploy;
  (4) check /api/health says openai: configured.
- **2026-07-09 (AI cover polish: brand stamp + thinking animation):** (1) generated covers now
  get the BRAND stamped client-side before saving: new `brandCover()` in AdminTrackPanel.tsx —
  canvas composite of a soft bottom gradient + `/images/icons/logo-header.png` + "TV MUSIC
  STORE" (Inter semibold, wide tracking — mirrors the header wordmark; canvas `letterSpacing`
  where supported) in the bottom-left, exported as JPEG q0.92 and uploaded via /api/admin/upload;
  the row THUMBNAIL is made from the clean unbranded original (owner: unreadable at that size);
  if branding fails the unbranded AI original is used. (2) The "Generating… ~30 sec" text was
  replaced by a pulsing gold sparkles animation (ping + pulse rings) centered on the cover —
  the wait is event-driven, art appears the moment OpenAI responds. FYI recorded for the owner:
  MP3 320/128 previews are encoded from EVERY WAV version separately; the Main star only decides
  which version fronts the track (catalog playback + shown duration).
- **2026-07-09 (AI covers v3: bigger brand, auto-BPM, composer-upload tags + generation):**
  (1) BRAND STAMP moved to shared `src/lib/coverArt.ts` (brandCover + generateCoverApi +
  uploadCoverImage) and enlarged per owner: logo 44→62px, wordmark 24→33px, tracking 5→7px,
  bottom gradient 190→230px (all ×cover-scale); AdminTrackPanel now imports it.
  (2) AUTO-BPM: new `detectBpm(AudioBuffer)` in audioEncoding.ts (lowpass 150 Hz on the first
  60 s via OfflineAudioContext → threshold-sweep peak picking → interval histogram folded into
  70–180 BPM; null for beatless material). Wired: ComposerUpload + AddTrackModal prefill the
  BPM field from the MAIN file (only while the field is empty — typing wins; one decode per
  main, tracked by ref); AdminBulkUpload detects per group ("Detecting BPM…" status) and sends
  bpm into create_track so drafts arrive with tempo filled.
  (3) COMPOSER UPLOAD v2: after files are added the form becomes 2 columns — right panel =
  Use Case / Genre / Mood chip pickers (options come from /api/composer/tracks GET, which now
  returns `vocabularies`) + a Cover block: 80px preview square, optional one-word input and a
  gold "Generate cover" button that UNLOCKS only when at least one value is picked in EACH of
  the three groups. Generation reuses the same pipeline (generate → brandCover → clean thumb);
  POST /api/composer/tracks now accepts useCase/genre/mood (joined " / ") + cover/coverThumb
  (only /api/file/covers/ or /images/ paths accepted). `/api/admin/generate-cover` now allows
  COMPOSERS (profile check) and accepts {useCase[], mood[]} INSTEAD of trackId (upload flow);
  `/api/admin/upload` (images) also opened to composers — their thumbs/branded covers go
  through it. NEXT (owner asked): AI description generation — same OPENAI_API_KEY, just a text
  endpoint (e.g. /v1/responses or chat.completions with a small model) + a button next to the
  Description fields; no new accounts/keys needed. [DONE — next entry.]
- **2026-07-09 (AI descriptions):** NEW `functions/api/admin/generate-description.ts` (admins +
  composers, same profile gate as covers): the owner's fixed SEO prompt (60–90-word paragraph,
  "royalty-free music" once, Artlist/PremiumBeat tone; embedded verbatim in that file) with
  Genre / Mood / Use Case substituted; accepts { trackId } (saved facets) OR { genre[], mood[],
  useCase[] } (upload forms). Calls chat.completions, MODEL const = `gpt-4o-mini` (bump there
  if OpenAI retires it — the error toast surfaces the API message). Client helper
  `generateDescriptionApi` in coverArt.ts. UI: a small gold ✨ Generate button INSIDE the
  Description textarea (bottom-right) in all three forms — AddTrackModal + ComposerUpload
  (enabled once ≥1 Use Case + Genre + Mood are picked; uses the picked lists) and the
  AdminTracksEdit single-track panel (uses the track's SAVED facets via trackId). Generated
  text lands in the field for review/edit — saving still goes through the normal Apply/Upload.
- **2026-07-09 (AI round 2 — owner tweaks):** (1) description prompt: "royalty-free" phrasing
  REMOVED (library is no longer described as royalty-free; added an explicit "never mention
  licensing terms" rule) — owner: it confuses buyers. (2) image MODEL downgraded
  gpt-image-1.5 → **gpt-image-1** to save credits (owner testing quality; revert = one line in
  generate-cover.ts). (3) header avatar popup: after a separator, above Log out — "Composer
  Dashboard" (roles composer/admin → /account?section=composer-dashboard) and "Admin
  Dashboard" (admin → /admin); same links added to the mobile menu block. (4) TRACKS EDIT bulk
  AI: outlined-gold "✨ AI Art & Text (N)" button next to Publish (AdminContent header
  cluster, visible with a selection): confirms, then for every selected track that has ≥1
  saved Usage + Genre + Mood generates cover (brand + thumb, same pipeline) AND description
  in parallel per track, saves via bulk_update_tracks, updates rows locally; under-tagged
  tracks are skipped (count shown in the confirm), per-track failures toast and don't stop
  the queue, button shows "AI k/n…" progress. NOTE: each track = 1 image + 1 text call —
  mind OpenAI credits on big selections.
- **2026-07-09 (AI round 3 — 360-char cap, row animations, per-row cover button, prompt
  diversity):** (1) DESCRIPTIONS: prompt now demands ≤360 characters (~45-55 words) and the
  server hard-caps at 360 (trims to the last full sentence). (2) IMAGE PROMPT: added an
  anti-human-bias paragraph — the focal subject must VARY (ambulance for suspense, glowing
  tree for fantasy, suitcase for travel, race car, satellite, lighthouse, animal…); a human
  silhouette only when it truly fits best. Model STAYS gpt-image-1 for now (owner testing).
  (3) TRACKS EDIT feedback: AdminContent keeps `aiTrackIds` (in-flight ids) + bumps
  `fieldsRefreshKey` after each finished track; AdminTracksEdit shows a pulsing sparkle over
  the row THUMBNAIL of any in-flight track, the single-panel Description textarea pulses gold
  + disables while its track is being written, and the fields panel RE-READS the fresh
  description/cover the moment a track finishes (no reselect). (4) PER-ROW cover generation:
  hovering a row thumbnail shows a sparkle button → `generateCoverForTrack` in AdminContent
  (cover+brand+thumb only, no text; guards on missing facets) — so cover and text can be
  generated separately (panel Generate = text only) or together (bulk AI Art & Text).
- **2026-07-09 (round 4: vocab DnD, AI model switcher, 3 tabs, bigger row art):**
  (1) VOCABULARY: up/down arrows replaced with native drag&drop (grip icon, drop before a row
  or at the list end; same set_vocab persistence). (2) AI MODEL SWITCHER: generate-cover now
  takes `model: "standard" | "premium"` (whitelisted server-side → gpt-image-1 /
  gpt-image-1.5); Tracks Edit toolbar got an "AI images: Standard/Premium" select next to All
  Composers — applies to the bulk AI button AND per-row thumbnail generation (track page &
  composer upload stay on standard). (3) Tracks Edit tabs split into THREE: Live / Drafts /
  Review (review = moderation pending; drafts = unpublished non-pending), each with counts.
  (4) Track-row cover thumbs (homepage/catalog/collections rows): 48px → 52px
  (h-[3.25rem], play column is 56px so it still fits; progress-ring svg scales via viewBox).
  [SAME DAY follow-up: owner couldn't see the 4px bump — art enlarged properly: cover h-14
  (56px), play/cover column 3.5rem → 3.75rem at ALL breakpoints, row padding py-3 → py-2.5 so
  rows don't grow. Progress ring scales via viewBox.]
  [ROUND 3 same day — owner marked the gaps on a screenshot and asked to HALVE them: row
  padding now px-2 py-1.5 (was px-4 py-3); the alt-versions expander row padding matched
  (px-2) so its columns stay aligned. Cover stays h-14/56px — with the tight padding it now
  visually dominates the row.]
- **2026-07-09 (stale content on SPA navigation fixed):** owner added Vocabulary values, went
  to /catalog — nothing there until Ctrl+F5. Cause: the /api/content module cache in
  useContent.ts was fetched ONCE per browser session and never revalidated on SPA navigation.
  Fix: stale-while-revalidate in `fetchContent` — the cache still renders instantly, but when
  it's older than 30 s (STALE_MS) a background `refreshContent()` runs and notifies every
  mounted hook, so vocab/trending/collections/playlists refresh on the next page visit (data
  swaps in a beat later, no flash, no hard reload). `fetchedAt` maintained by both fetch paths.
  Tracks were never affected (useTracks refetches on every page mount), so new tracks +
  admin-picked trending now both show up when a visitor simply navigates to the homepage.
- **2026-07-09 (Vocabulary rename):** new `rename_vocab` action in admin/content.ts
  ({facet, value, newValue}): renames the value IN PLACE in the site_config list (position
  kept; case-insensitive duplicate check → 400) AND rewrites every track carrying it (the
  " / "-joined facet column; LIKE prefilter + exact-value check so substrings are safe),
  returns tracksUpdated. UI: double-click a value in Admin → Vocabulary → inline input
  (Enter/blur saves, Esc cancels) → success toast + refreshContent so catalog filters follow.
  Owner's motive: retag for better sales without re-ticking every track.
- **2026-07-09 (version rename renames the WAV in the bundle + header avatar):**
  (1) Renaming a version now also renames the matching WAV inside the private master zip —
  NEW `src/lib/wavBundle.ts` `renameWavInBundle(trackId, title, oldLabel, newLabel)`
  (downloads /api/admin/master, matches the entry via cleanVersionLabel — Main matches the
  bare "<Title>.wav" file — renames to "<Title> (<label>).wav", re-zips, uploads, returns the
  new key); `rename_version` server action now accepts `wavZipKey` (same as delete_version).
  Wired in BOTH rename spots: track-page VersionsBlock and the Tracks Edit expander
  (double-click). No match / no bundle → small toast, label rename proceeds anyway.
  (2) HEADER: account button and cart icon aligned (both flex items-center — the account
  wrapper was baseline-shifted); signed-in users now see a GOLD INITIAL AVATAR (first letter
  of name/email, 28px circle, gold ring when the menu is open) instead of the generic user
  icon; guests keep the icon.
- **2026-07-09 (particle equalizer above the mini-player — owner EXPERIMENT, may be removed):**
  inspired by the owner's Python particle-sphere app (he shared the code; its slider set —
  density/reactivity/chaos/trail/glow/sparkle/band gains — became the parameter model).
  ENGINE: `getSharedAnalyser()` exported from TrackRowPlayer — an AnalyserNode (fftSize 2048)
  inserted source→gain→ANALYSER→destination in ensureAudioGraph (no audible change).
  VISUAL: `src/components/AudioVisualizer.tsx` — transparent canvas absolutely positioned
  `bottom-full` above the fixed mini-player bar (h-32, pointer-events-none), mounted in
  PlayerProvider. rAF loop: 96 log-spaced spectrum columns (LEFT = lows … RIGHT = highs, top
  octave dropped), per-column fast-attack/slow-release envelope, particles spawn from the
  bar's top border and jump up with soft gravity, twinkle (sparkle), trails via
  destination-out fade, additive glow, gold/white mix; caps: 900 particles, dpr≤2; particles
  finish falling after pause (idleFade). SETTINGS: `src/lib/visualizerSettings.ts` —
  localStorage (tvms_visualizer_v1), enabled + density/reactivity/maxRise/size/trail/glow/
  chaos/sparkle/gold/smoothing/bass/mid/high (0-100 scales like his Python app).
  TEMP TUNING PANEL: `VisualizerSettingsPanel.tsx` on the HOMEPAGE above the footer, ADMIN
  ONLY — live sliders + Enabled toggle + Reset; values persist per-browser.
  [V2 same day — owner: the gravity parabolas + trails read as a ROTATING OVAL/sphere, not an
  equalizer. Rework: pure 2D — particles spawn on the border, fly STRAIGHT UP with exponential
  drag (no gravity, never fall back) and DISSOLVE via ease-out fade; new settings `threshold`
  (spawn sensitivity gate — energy below it emits nothing; drive rescaled above the gate) and
  `fade` (dissolve speed), both on the panel. Owner's tuned values are now the DEFAULTS:
  density 29, reactivity 50, maxRise 55, size 22, trail 29, glow 45, chaos 22, sparkle 42,
  gold 100, smoothing 31, bass 68, mid 62, high 48 (+ threshold 18, fade 55).]
  [V3 same day — particles LAGGED the site (shadowBlur × hundreds of arcs). AudioVisualizer
  REWRITTEN as a classic BAR equalizer: 32–128 bars (density slider), log-spaced spectrum
  (left lows → right highs), INSTANT attack + smooth release (trail = fall speed), floating
  peak caps (sparkle = cap brightness/on, fade = cap fall), gold/white mix, sensitivity gate.
  Perf: plain fillRect only — no shadows/trails/particles, dpr≤1.5, canvas h-24, skips
  drawing when silent/hidden tab. No desync possible: the analyser sits in the same Web Audio
  graph as the speakers. Panel labels updated (chaos/glow sliders removed from the panel;
  fields remain in storage).]
  [V4 same day — owner feedback: (1) his tuned numbers are the DEFAULTS now (density 100,
  reactivity 37, maxRise 49, size 100, trail 0, sparkle 33, gold 100, smoothing 76, bass 73,
  mid 70, high 66, threshold 82, fade 0 — caps linger per his pick, glow 55); (2) "groups of
  4 identical bars" fixed: analyser fftSize 2048→4096 (2048 bins, ~10.8 Hz) + fractional
  log-bin sampling with LINEAR INTERPOLATION for narrow (low-end) ranges — every bar tracks
  its own frequency now; (3) NEW "Border light" (reuses the stored `glow` field, slider is
  back on the panel): the player's top border lights up gold exactly under active bars
  (full-slot 2px segments at the canvas base; bars/caps draw 2px higher). NOTE: the owner's
  browser has old values in localStorage — Reset on the panel loads the new defaults.]
  [V5 same day — (1) new owner defaults: reactivity 7, maxRise 56, trail 17, glow 49,
  sparkle 90, smoothing 43, bass 100, mid 79, high 86, threshold 53, fade 0 (rest unchanged);
  (2) Bars ceiling raised 128 → 256 (density maps 32–256) for finer visual resolution;
  (3) Fall smooth got much more headroom (release 0.35–8.1/s — at 100 a full bar sinks ~3 s);
  (4) pause/stop die-off: bar heights are snapshotted, HELD briefly, then plunge via
  1-easeInExpo over 1.5 s (the normal update loop is skipped while bins===0 so it can't
  fight the animation); peak caps keep falling at their own Cap fall rate.]
  [V6 same day — (1) frequency range is now explicit 50 Hz (left) → 17 kHz (right) computed
  from the analyser's real sampleRate (below 50 Hz tracks carry ~nothing, the left edge sat
  dead); (2) stop die-off REDONE per owner: the MAIN bars fade fast+smooth (exponential,
  ~0.3 s), while the PEAK caps are snapshotted, lie still ~450 ms, then plunge down over
  ~1 s via 1-easeInExpo — the previous version froze the bars then dropped everything in one
  frame. energyLeft now tracks caps too so the canvas isn't cleared mid-animation.]
  [V7 same day — UNIFIED PHYSICS (owner: bars shouldn't care WHY it went quiet). The special
  stop branch is gone; play / in-track silence / pause / stop all behave identically: targets
  drop to 0 and everything falls by its own rules. Caps got REAL physics: peakVel/peakRest
  arrays — a cap sits on its bar while supported, free-falls with GRAVITY once the bar drops
  away (Cap fall slider = gravity, 0 = light float), LANDS on the border line (FLOOR 0.012)
  and fades out there over 0.5 s. Caps draw independently of bars (previously the draw loop
  `continue`d on empty bars, which is why caps vanished mid-air during quiet passages).
  Bars keep the release glide from the trail slider in every state.]
  [V8 — visualizer APPROVED & finalized: the temp tuning panel is UNMOUNTED from Index.tsx
  (import + admin-only render removed). `VisualizerSettingsPanel.tsx` is kept on disk as dead
  code on purpose — if the owner ever wants to re-tune, remount it on Index for a session.
  Live behavior now runs entirely on DEFAULT_VISUALIZER; visitors have no controls. NOTE: the
  owner's own browser still carries tvms_visualizer_v1 in localStorage (equals the defaults).]
- **2026-07-09 (PADDLE REJECTED → back on STRIPE):** Paddle turned the domain down after
  review; the owner decided to stay with Stripe. `BILLING_ENABLED` flipped back to TRUE in
  src/lib/billing.ts — plan checkout, billing portal and all Pricing/Account buttons are live
  again (the whole Stripe backend was never removed). REMINDER: Stripe was last verified in
  TEST mode (4242 card, webhook OK). Before real sales the owner must switch the Cloudflare
  secrets STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET to LIVE-mode values and re-create the
  webhook endpoint in the live Stripe dashboard. NEXT UP: STAGE 5 — spreadsheet metadata
  import (plan being discussed with the owner).
- **2026-07-09 (STAGE 5 BUILT — spreadsheet metadata import):** owner's decisions: fuzzy
  AI-assisted title matching; his tables carry title/description/search-tags (+sometimes BPM)
  and the AI derives Use Case/Genre/Mood from description+tags. NEW admin section
  **Import (CSV)** (nav id `import`, Catalog group) = `src/components/AdminImport.tsx`:
  (1) "Export catalog CSV" (client-side, BOM for Excel: code/title/composer/bpm/status/
  facets/tags/description); (2) "Load a table…" — tiny built-in CSV/TSV parser (quotes,
  sniffs , ; or tab), header auto-detect for Title/Description/Tags/BPM with remap dropdowns;
  (3) "Analyze with AI": client fuzzy-matches titles (normalized token similarity; exact
  matches auto-lock) and sends chunks of 15 rows + top-6 candidates each to NEW
  `functions/api/admin/import-map.ts` (gpt-4o-mini, JSON mode) which confirms the match and
  picks facets STRICTLY from the live vocabularies (server canonicalizes/filters, hallucinated
  values impossible); (4) preview table — per-row include checkbox, match dropdown
  (green=exact, gold=AI, red=none), AI facets, BPM, description; (5) Apply — sequential
  bulk_update_tracks per row: facets ADDED, description/tags/BPM overwritten. Suggested
  pipeline after import: select in Tracks → AI Art & Text → Publish. NOTE: import-map uses
  the same OPENAI_API_KEY.
- **2026-07-10 (owner round: editable license prices, bulk-upload stems, Read .xlsx,
  composer default):**
  (1) LICENSE PRICES are admin-editable: site_config key `license_prices` +
  `getLicensePrices()` in _utils (defaults 15/79/249); new admin action `set_license_prices`;
  public /api/content returns `licensePrices`; PayPal order.ts prices carts from the DB
  (validateItems now takes a prices map; capture records what PayPal actually charged);
  frontend `src/lib/licenses.ts` became a live store (`hydrateLicensePrices` called from
  useContent fetch/refresh + `useLicenseTiers()` hook — TrackDetail/Cart/LicenseModal
  subscribe). Admin → Dashboard got a "Single-track license prices (USD)" card (3 inputs +
  Save).
  (2) BULK UPLOAD STEMS: WAVs named …_stem_… / …_stems_… (isStemFile regex) are treated as
  STEMS, not versions — listed with a gold Stem badge, packed into their OWN zip (kind=stems)
  and passed as stemsKey to create_track (has_stems flips on). Loose stem files derive the
  track title from the part before the stem marker; groups with only stems error clearly.
  (3) TRACKS EDIT → "Read .xlsx" (button in the selection cluster): NEW dependency-free
  `src/lib/xlsxRead.ts` (xlsx = zip → fflate unzipBlob → DOMParser over sheet1 +
  sharedStrings). Owner's fixed sheet layout # / Title / BPM / Lengths / Alternative Title /
  Style / Description / Tags (headers auto-detected with those fallbacks); SELECTED tracks are
  matched by Title OR Alternative Title (normalized), then BPM / Description / Tags (extra
  tags) are written via bulk_update_tracks; confirm shows matched/missed counts; local
  overrides update the panel instantly.
  (4) COMPOSER PICKER DEFAULTS: /api/admin/content composers (with userId) — Bulk Upload and
  AddTrackModal now PRESELECT the signed-in admin's own composer profile (e.g. Lumine Wave)
  instead of "TVMUSICSTORE (house)"; manual choice is never overridden.
- **2026-07-10 (STORAGE V2 — individual masters + streamed zip + license PDF inside):**
  owner-approved rework (catalog still empty, no migration worries; the ~95 MB per-UPLOAD
  cap limited stems to ~4 files — downloads have NO such cap).
  **Model:** masters (WAV versions + stems) upload INDIVIDUALLY (kind=master → masters/…,
  each ≤95 MB, live % progress) with a browser-computed CRC32 (`src/lib/crc32.ts`,
  chunked); the track stores JSON manifests in new lazy columns `wav_manifest` /
  `stems_manifest` ([{key,name,size,crc}], validated server-side in create_track, ≤40
  entries). **Download:** NEW `functions/api/_zipStream.ts` — STORE-method streaming zip
  writer (local headers with known CRC/sizes → piped R2 bodies → central directory; tiny
  CPU/memory, any total size) + parseManifest + server crc32. download.ts: wav/stems prefer
  the manifest (streams the zip on the fly) and DROP THE LICENSE PDF INSIDE the bundle
  (internal fetch to /api/license-pdf?order=<sync_order>|?slug=<slug> with the user's cookie;
  best-effort — bundle ships even if the PDF fails; entry "LICENSE - <Title>.pdf"). Legacy
  paths (r2_key_wav_zip / r2_key_stems / per-version r2_key_wav) still work for old flows
  (AddTrackModal + ComposerUpload still upload single zips ≤95 MB; the track-page
  VersionsBlock zip rebuild only applies to legacy-zip tracks — manifest-aware version ops
  are a TODO). licenseOrder (sync_orders id) now fetched for the PDF link.
  **Bulk Upload** is the v2 pipeline: checksum → upload each master with progress →
  create_track with wavManifest/stemsManifest (wavZipKey/stemsKey no longer sent from Bulk).
- **2026-07-10 (Bulk Upload v3 — _main, MP3 input, upload progress, size guard):** owner hit
  an upload failure on a stems batch (almost certainly the STEMS zip exceeding Cloudflare's
  ~100 MB request-body limit; our server cap is 95 MB — plain WAV-only batches worked).
  Changes: (1) `uploadAudio` in AdminBulkUpload switched fetch → XMLHttpRequest with an
  UPLOAD PROGRESS callback — big zips now show "Uploading WAV/STEMS zip (NN MB)… 42%" live,
  plus a PRE-CHECK that rejects any blob over 95 MB with a clear "split it" message (no more
  silent multi-minute waits into a mystery error). (2) MAIN PRIORITY: starred file →
  filename containing `_main` (isMainFile) → longest; the "_main" marker never leaks into
  the site label (forced "Main"); ComposerUpload's auto-star honors …_main… too.
  (3) MP3 INPUT accepted alongside WAV (drop, folder picker, file picker): an MP3 version is
  used AS-IS as the 320 preview (zero re-encode; only the 128 kbps free-tier copy is
  rendered from it); MP3s stay OUT of the WAV bundle — tracks with no WAV files at all get
  no wavZipKey (no WAV download). Help texts updated. FYI answered for the owner: R2 egress
  is FREE, storage = 10 GB free then ~$0.015/GB-mo (his whole catalog ≈ <$1/mo).
  0001_init.sql, user_id NULL, 0 tracks) are FILTERED OUT of the picker list — admin content
  GET now counts tracks per profile and hides rows with no user AND no tracks (detached
  profiles that own tracks stay visible for recovery); (b) both pickers sort the signed-in
  admin's OWN profile FIRST and label it "(me)"; (c) "TVMUSICSTORE (house)" is NOT a
  composer — it's the "no author" option (tracks without composer_id show the store brand as
  artist); kept as the first option by design.]
- **2026-07-10 (license prices reverting on F5 — fixed):** owner set Personal 25, the track
  page showed it, but a hard refresh showed 15 again. Cause: price hydration lives in the
  /api/content fetch, and NOTHING on a directly-loaded track page mounts a useContent hook —
  so the fallback prices never got replaced. Fix: `ContentBoot` component in App.tsx (inside
  BrowserRouter) calls useContentReady() on EVERY page load, warming the content cache and
  hydrating license prices / vocabularies / trending on all routes. The saved value itself
  was always correct in site_config. NEXT AI: when the
  owner settles on numbers, hardcode them into DEFAULT_VISUALIZER and DELETE the panel (and
  its Index.tsx mount); if he dislikes the whole thing, remove AudioVisualizer from
  PlayerProvider + the settings lib + panel (analyser can stay, it's harmless).
- **2026-07-10 — OWNER'S CONTRACTS REVIEWED (PRO picture is now concrete):**
  (1) ZEC MUSIC LTD (signed 2022): the owner ALREADY HAS a publisher — Zec Music Ltd
  (PRS publisher, IPI 687 192 107); owner is a BMI writer (IPI 10585 08257). Classic 50/50
  collection deal, worldwide, royalties onto his BMI statement. CRITICAL: "film and
  television synchronisation rights are specifically NOT granted to the Publisher" — TVMS
  can sell sync licenses freely, Zec doesn't conflict. Covers a large Schedule of his titles
  (incl. catalog tracks like A Few Clicks To Destruction, Opening Up Space) + future works
  only if HE opts them in. So "register an own TVMS publisher" is OFF the table for his own
  tracks (only a future option for new works he keeps out of Zec, or other composers).
  (2) TUNETANK contract (2022): full BUYOUT in perpetuity of THREE tracks for $500 each —
  **"We Can Fly", "Only Victory", "The Battle of Pirates" NO LONGER BELONG to the owner
  and must NEVER be uploaded to TVMS** (check against these names during bulk imports).
  Interesting intel: Tunetank is NOT PRO-free under the hood — their writer contract splits
  performance royalties 50/50 (writer keeps writer's share via his PRO, Tunetank takes the
  publisher share); they just don't advertise it storefront-side. Confirms PRO doesn't break
  the model. (3) Ghost Mail confirmed the business name for the London address — that
  thread is closed. For future PRO fields: owner's tracks → publisher "Zec Music Ltd"
  (PRS IPI 687 192 107), writer Stanislav Barantsov (BMI IPI 10585 08257).
- **2026-07-10 (PRO / Cue Sheet fields BUILT + license PDF polish):** owner approved (his own
  Tunetank writer contract proved even "PRO-free-looking" libraries run PRO under the hood).
  (1) `composers` gained lazy columns cue_name / pro / ipi / publisher_name / publisher_pro /
  publisher_ipi (ensureCueColumns in admin/users.ts). GET /api/admin/users returns `cue{}` per
  user; PATCH accepts `cue{cueName,pro,ipi,publisherName,publisherPro,publisherIpi}` (requires
  an existing composer profile). (2) Admin → Users ⋯ menu: "Sync / Cue Sheet Info" section
  (6 inputs + Save) under the Composer checkbox. (3) license-pdf.ts: CertData gained `cue`;
  `fetchCue(db, trackId)` joins the track's composer profile (omits the block when all fields
  empty / columns missing); ALL THREE issue paths (admin ?code, ?order, ?slug) pass it;
  buildCertificate draws a "SYNC / CUE SHEET INFORMATION" panel (grey rrect, Composer |
  Publisher columns with Name/PRO/IPI) between the permitted lists and the Content ID callout.
  (4) PDF copy fixes per owner: header "LICENSE SCOPE & RESTRICTIONS" → "LICENSE SCOPE &
  GRANTS"; footer "License Terms v1.0 · …" → "Full license terms: tvmusicstore.com/
  license-terms"; ownership line now says the music remains the property of ITS RIGHTS
  HOLDERS (TV Music Store and/or its composers) — the old "property of TV Music Store" was
  wrong for composer-owned works. License wording of all 5 tiers/plans was sent to the owner
  in chat for review — expect wording tweaks in TIER_INFO / PLAN_INFO next.
- **2026-07-10 (download modal + AI-flash bugfix):** (1) DownloadOptionsModal hides the
  MP3 128 option for Pro/Max subscribers and license owners (auto-lands on 320); the free
  128 flow already shows the copyable AttributionModal ("Credit the composer": store, track,
  composer, link) — confirmed working, unchanged. (2) license-pdf?slug now returns 403 for
  FREE-plan users (owner: plan certificates are a Pro/Max perk; purchased ?order certs
  unaffected; the download modal already hid the checkbox for free). (3) TRACKS EDIT BUG:
  per-row cover generation pulsed AND wiped the description field — root causes: one shared
  aiTrackIds list drove BOTH the thumb sparkle and the textarea pulse, and fieldsRefreshKey
  re-read the WHOLE fields panel (discarding unsaved AI text). Fix: separate `aiTextIds`
  (textarea pulse; only bulk AI Art & Text sets it) vs `aiTrackIds` (thumb sparkle), and
  fieldsRefreshKey replaced by a targeted `fieldsPatch {trackId, patch:{cover?,description?}}`
  that MERGES only the AI-written fields into the panel — manual unsaved edits survive.
  Cover in the panel now also syncs after per-row generation, so a later Apply can't roll
  the new art back.
- **2026-07-10 (modal lag in Opera — backdrop blur removed):** owner reported jank when the
  Download options / License modals open (hover delays too). Cause: full-screen
  `backdrop-blur-sm` overlays force the browser to re-blur the whole page every frame —
  with the equalizer canvas animating underneath it's a constant repaint storm (hits Opera
  hardest). Fix: blur removed from ALL full-screen modal overlays (DownloadOptions, License,
  Attribution, Plan, AddTrack, Auth), compensated with slightly denser dimming
  (bg-background/80→/90, AuthModal black/70→/80). The small fixed bars (header, mini-player)
  keep their blur — tiny areas, not the bottleneck. If jank persists, next lever: pause the
  visualizer's rAF while a dialog is open.
  [SAME DAY V2 — owner missed the "rich" look: blur is BACK on all six modals, and the
  jank-source is fixed properly instead — AudioVisualizer FREEZES while any `[role="dialog"]`
  is open (checked ~4×/s inside the loop, cheap): a static page under backdrop-blur costs
  nothing after the first frame.]
- **2026-07-10 (mp3+license one zip, See plans popup, user-delete FK fix):**
  (1) "Include PDF License" on MP3 downloads now delivers ONE zip (mp3 + certificate) built
  server-side: /api/download accepts `includeLicense` (mp3 branch buffers the preview ≤25 MB,
  crc32s it + the PDF, streamZip); the modal passes it instead of triggering a second
  download; client names the file .zip when the response is a zip. WAV/stems bundles carry
  the PDF automatically — the modal shows an info line ("included automatically") instead of
  the checkbox for those formats. (2) TrackDetail "see plans" link now opens the PlanModal
  popup (openPlanModal) instead of navigating to /pricing. (3) USER DELETE BUG ("Unexpected
  token '<'" on wildsound159): D1 enforces foreign keys — users WITH download history hit the
  download_log/plan_licenses FK on DELETE users, the function threw and Cloudflare returned
  an HTML 500. deleteUserAccount now also DELETEs download_log + plan_licenses rows (NOT NULL
  FKs) and detaches sync_orders/claim_requests (user_id → NULL) so purchase records survive.
  Note: deleting a user now removes their download-history rows, which slightly lowers
  per-track download counts (Popular sort) — acceptable per the data model.
- **2026-07-10 (owner round: EQ freeze reverted, self-delete sub-guard, admin email change,
  plan chips):** (1) the modal-open freeze of the visualizer was REMOVED at the owner's
  request — he wants to A/B the blur without it first (re-add the [role="dialog"] check in
  AudioVisualizer's loop if Opera jank returns). (2) DELETE /api/me now returns 409
  code="subscription" when the latest subscription is a paid plan with status='active'
  (table mirrors Stripe via webhooks); Account's delete flow catches it and offers to open
  the billing portal to cancel first — no deleting an account Stripe would keep charging.
  (3) Admin → Users ⋯ menu got a "Login email" field (saves on Enter/blur): PATCH
  /api/admin/users accepts `email` — format-validated, uniqueness-checked, owner account
  refused. (4) CURRENT PLAN chips: gold minimal chip ("Max plan" / grey "Free plan") in
  Account → Profile under the email AND in the header avatar popup under the email line
  (Navigation now reads useSubscription).
- **2026-07-10 (owner round: filename hygiene end-to-end):** Owner's friend delivers files
  like "1685_As Light As A Feather" / "Oleksii-Romanenko_Title_30sec.wav" — cleanup pass:
  (1) UPLOAD: Bulk Upload (`cleanTitle`) and ComposerUpload strip leading catalog numbers +
  separators from derived track titles ("1685_X" → "X"). (2) DOWNLOAD ZIPS: download.ts
  builds nice names for every audio file INSIDE streamed zips via `niceZipEntryName` —
  "tvmusicstore.com_<code>_<composer cue_name || display_name>_<Title> (<suffix>).wav";
  suffix comes from the improved `cleanVersionSuffix` (underscores→spaces, leading digits
  dropped, keeps what FOLLOWS the title wherever it sits, so author-name prefixes fall away);
  collision-safe via a usedZipNames Set; mp3-in-zip + LICENSE pdf names use the same
  format; `tidyTitle` also cleans outer filenames server- (download.ts) and client-side
  (downloadTrack.ts downloadFileName/wavZipFileName) for legacy titles still holding digits.
  (3) READ .XLSX (AdminTracksEdit): normTitle now drops leading digits and a fuzzy
  "contains" pass follows the exact match — "1685_As Light As A Feather" matches sheet row
  "As Light As A Feather". (4) UI VERSION LABELS: new `displayVersionLabel` (cleaned label,
  falls back to the raw label when nothing besides the title remains) used in
  TrackRowPlayer expanded versions, TrackDetail Versions tab (index 0 = main keeps its full
  label per owner's rule) and Similar list; main-version label on TrackDetail gets light
  cosmetics only (underscores→spaces, leading digits). Labels in the DB are untouched —
  visual only.
- **BACKLOG — PRO / performance royalties support (researched 2026-07-10, owner considering):**
  composers have IPI numbers and want cue-sheet income; industry does both models (AudioJungle
  lists PRO fields; Tunetank-style libraries sell "PRO-free"). Decision guidance given to the
  owner: PRO does NOT break the model if transparent — sync fee is ours, broadcast performance
  royalties are the broadcaster's problem; registering an own publisher (e.g. "TV Music Store
  Publishing" in BMI/PRS) would earn the business the publisher share. TO BUILD when approved:
  composer-profile fields PRO name + IPI/CAE, publisher field, per-track PRO/Non-PRO badge,
  license-terms paragraph about performance royalties (standard broadcaster-responsibility
  wording).
- **BACKLOG (owner-approved, do when time allows):** SEO structured data on track pages —
  add schema.org JSON-LD (MusicRecording / MusicComposition: name, byArtist = composer
  pseudonym, duration, genre, description, image) injected per-track (crawlers that run JS
  see it via useSeo; consider prerendering later). Also consider BreadcrumbList and
  MusicPlaylist markup on playlist/collection pages.
- **2026-07-11 (vocab "/" bug — Social / Shorts duplicates fixed):** owner added the Use Case
  value "Social / Shorts" via Admin → Vocabulary; since facet values are stored " / "-joined in
  tracks.use_case/genre/mood and split by "/", the value could never round-trip: the track-page
  admin checkbox never read as checked and EVERY click appended another "Social"+"Shorts" pair
  (owner's Unstoppable track collected ~8 copies). Fix in functions/api/admin/content.ts:
  (1) `cleanVocabValue()` — folds "/" to "&" ("Social / Shorts" → "Social & Shorts"), applied in
  add_vocab, rename_vocab (newValue), set_vocab, and to added values in bulk_update_tracks;
  (2) bulk_update_tracks now dedupes facet values case-insensitively on every write (removes are
  case-insensitive too) — corrupted rows self-heal on the next edit;
  (3) `repairSlashVocabValues()` — lazy one-time repair called from the admin content GET: any
  vocab value containing "/" is renamed to its "&" form in site_config, and every track's facet
  column has the orphaned fragments (e.g. standalone "Social", "Shorts") collapsed back into the
  renamed value + duplicates removed (fragments that are themselves canonical vocab values are
  left alone). No-op when data is clean. So the owner just opens any admin page once and the
  vocab + tracks fix themselves; the sidebar value shows as "Social & Shorts". tsc 0, eslint 0
  on the edited file. Client untouched (splitFilterValues stays "/"-based — safe once values
  can't contain "/").
  [ROUND 2 same day — owner still saw the old orphaned "Shorts"/"Social" tags: the first repair
  only triggered while a "/" value was STILL in the vocab. `repairSlashVocabValues` reworked:
  a ONE-TIME track sweep (site_config flag `vocab_slash_repair_v1`) that also maps fragments of
  already-renamed "&" values (parts of "Social & Shorts" → the whole value; fragments that are
  themselves canonical vocab values are skipped) + dedupes, regardless of the vocab state. Runs
  on the next admin content GET after deploy, then flags itself done ("/" rename check stays
  active forever, it's cheap). Verified: eslint 0 on the full file (sandbox mirror truncated at
  the old length AGAIN — reconstructed via tail-append per the known recipe; host file whole,
  a sandbox-only `functions/api/admin/__lintcheck.ts` temp lingers in the mirror, NOT on host).
  NOTE: `npx tsc --noEmit` does NOT cover functions/ (tsconfig scope) — don't take its silence
  as a functions/ typecheck.]
- **2026-07-11 (track page Versions tab = alternates only):** owner: the MAIN version showed up
  as row 1 in the TrackDetail Versions tab (catalog rows already list alternates only via
  slice(1)). Fix in TrackDetail.tsx: (1) the Versions tab now maps `audioVersions.slice(1)` +
  an empty-state line ("No alternate versions for this track.") when there's only the main;
  (2) TrackVersionRow always uses displayVersionLabel (the old "index 0 keeps its raw label"
  rule applied to the main row, which is gone from the list); (3) `mainVersion` is PINNED to
  `audioVersions[0]` (was getSelectedVersion → after clicking an alternate the big waveform
  card switched to it and Main became unreachable until reload; now the card/hero play button
  always run the main version, alternates play from their own rows). getSelectedVersion stays
  (Similar-tracks tab still uses it). eslint 0 (sandbox mirror truncated AGAIN — rebuilt via
  cut-at-last-line + host tail, temp lint copies stayed sandbox-only, host verified clean).
- **2026-07-11 (SYNC GLITCH HIT THE HOST FILE — content.ts NUL-repaired):** worse than the usual
  mirror glitch: after this session's Edits, the HOST copy of functions/api/admin/content.ts had
  REAL NUL bytes where quoted spaces were written (e.g. `join(" ")` became `join("\0")`) — Read
  rendered them invisibly, but ripgrep flagged "binary file" and Edit couldn't match the text.
  FIX: read the whole file (Read shows NULs as spaces = the intended chars), rewrote it in one
  Write — host file now greps clean, quoted-space strings match regexes again (also swapped that
  comparison to JSON.stringify while at it). LESSON for next AI on this machine: after editing,
  Grep the file for one of your quoted-space strings (e.g. `join\(" / "\)`) — "binary file
  matches" means the HOST copy is NUL-poisoned → Read whole file + rewrite via Write. Sandbox
  mirrors of EDITED files stay stale/NUL-laced (lint there is meaningless for them; freshly
  CREATED files sync fine and lint OK). deploy.bat's host-side lint remains the final gate.
- **2026-07-11 (AI tagging by prompt — Tracks Edit):** owner describes a track in his own words
  and the AI pre-ticks the panel checkboxes. NEW `functions/api/admin/suggest-tags.ts` (admin
  only, same OPENAI_API_KEY, model gpt-4o-mini, JSON mode): POST { prompt, include:{tags,
  collections,playlists,categories} } → loads live vocabularies + collection/playlist/category
  titles from D1, system prompt demands GENEROUS human-curator matching (associations, not
  literal keywords; "energetic electronic positive" → Sports/Action/Upbeat/Energetic etc.;
  prefer including borderline entries), answers are canonicalized server-side (case-insensitive
  map to real vocab values / titles→ids; hallucinations dropped). CLIENT (AdminTracksEdit.tsx):
  gold "AI tagging by prompt" box at the top of the Track details panel (visible with exactly
  ONE track selected) — textarea + 4 include-checkboxes (Tags on by default; Collections/
  Playlists/Categories opt-in) + "Suggest ticks" button. Result only PRE-TICKS the tri-state
  checkboxes (facetChanges/collection-playlist-categoryDelta = "all") — the owner reviews and
  presses the normal Apply; nothing autosaved. suggest-tags.ts lints 0 sandbox-side (fresh
  file); AdminTracksEdit host copy verified by Read (mirror corrupt as usual) — final check =
  deploy.bat lint.
- **2026-07-11 (round 2: Tags Base + Extra tags in AI prompt, 25-tag cap, "15sec" label fix):**
  (1) TAGS BASE: global owner-curated tag pool in site_config key `extra_tags_base` — new admin
  action `set_tags_base` {values[]} (trim/dedupe, ≤40 chars each, ≤500), admin content GET now
  returns `tagsBase`. UI: "Tags Base…" button in the Tracks Edit single-track fields panel —
  it REPLACED the legacy "Upload stems ZIP" button (owner: stems now arrive as plain audio via
  Bulk Upload; uploadStems prop/function removed from AdminTracksEdit/AdminContent; bulk-upload
  _stem_ pipeline untouched) — opens a dialog with one comma-separated textarea (loads current
  list via GET, saves via set_tags_base). (2) EXTRA TAGS in AI prompt-tagging: 5th checkbox
  "Extra tags (from Tags Base)"; suggest-tags.ts accepts include.extraTags, feeds the base list
  to the model ("pick the 10-25 best, most relevant first"), canonicalizes against the base,
  caps at 25; client merges results into the single-track Extra-tags field (dedupe, ≤25) —
  saved by the normal Apply. 400 if extraTags is the ONLY section and the base is empty.
  (3) TAG CAP 12→25 in content.ts (update_track, bulk fields.tags, create_track).
  (4) "15sec" BUG: version "15sec" displayed as "1. sec" — the catalog-number strip
  `/^\s*\d+\s*/` ate duration digits. New rule everywhere: leading digits strip ONLY when a
  separator follows AND they're not a duration word — `/^\s*\d+[\s._-]+(?!(?:sec(?:s|onds?)?|
  min(?:s|utes?)?)\b)/i` — applied in src/lib/downloadTrack.ts (tidyTitle + cleanVersionLabel →
  fixes Versions tab/rows/filenames), functions/api/download.ts (tidyTitle + cleanVersionSuffix
  → zip entry names), TrackDetail main-label cosmetic, AdminBulkUpload cleanTitle,
  ComposerUpload title derivation. Also: labels that are ONLY digits ("60") are kept now.
  VERIFIED: all edited host files grep clean (no NUL poisoning; quoted-space strings match);
  sandbox mirrors of edited files are corrupt as usual so sandbox eslint is meaningless —
  deploy.bat host lint is the gate. Stale __lintcheck temp files from yesterday DID sync to the
  host with delay — deleted via allow_cowork_file_delete + rm (Glob-confirmed gone); NEXT AI:
  re-Glob for `**/__*` leftovers before deploys.
- **2026-07-11 ("Track not found" flash on F5 — fixed):** direct-loading /track/<slug> briefly
  showed the full "Track not found" screen until /api/tracks answered. TrackDetail now checks
  `isLoading` from useTracks: while loading with no track yet it renders a quiet pulse skeleton
  (square cover + title/waveform bars) and the tab title says "Loading…"; the not-found screen
  appears only after the fetch settles with a genuinely missing slug. CollectionDetail /
  PlaylistDetail already had this guard — TrackDetail was the only page missing it.
- **2026-07-11 (tag cap 25 → 50):** owner plans a large Tags Base, 25 per track felt tight.
  Bumped everywhere: content.ts (update_track / bulk fields.tags / create_track slice(0, 50)),
  suggest-tags.ts (model asked for "15-50 best, most relevant first", server slice(0, 50)),
  AdminTracksEdit (client merge cap 50 + Tags Base dialog copy).
- **2026-07-11 (AI Magic round: 30-50 tags, solo Generate on Extra tags, Description checkbox):**
  (1) suggest-tags.ts prompt now demands BETWEEN 30 AND 50 extra tags, best-fitting first then
  progressively looser (fewer only when the base itself is smaller). (2) The AI-box button
  renamed "Suggest ticks" → "AI Magic". (3) NEW 6th checkbox "Description": AI Magic also
  writes the SEO description via the existing generate-description endpoint, fed with the
  track's saved facets MERGED with the just-AI-ticked ones (lands in the Description field,
  saved by Apply; toast says "N box(es) ticked + description written"). (4) NEW solo ✨ Generate
  button ON the Extra tags textarea: calls suggest-tags with extraTags ONLY (include checkboxes
  untouched); prompt = the AI-box text, falling back to the track's description; result merges
  into the field (mergeTags module helper — dedupe, cap 50; also reused by AI Magic).
- **2026-07-11 (owner round: no default composer, auto stems badge, AI unticks, no extra-tag
  pills):** (1) BULK UPLOAD: the composer picker is NO LONGER preselected with the admin's own
  profile (owner kept uploading to his own account by mistake) — defaults to "" with option
  text "No composer — pick one (TVMUSICSTORE house)"; auto-preselect effect + touched-ref
  removed. AddTrackModal keeps its preselect. (2) TRACKS EDIT: "Includes stems" TriCheckbox
  removed from the single-track fields — the stems badge is fully automatic (stems upload sets
  has_stems, stems delete clears it); fields.hasStems plumbing kept, just no manual UI.
  (3) AI MAGIC is now AUTHORITATIVE per included section: facets map EVERY vocab option to
  all/none (picked/unpicked), memberships likewise over all collections/playlists/categories,
  Extra tags REPLACE the field (solo Generate too; mergeTags helper deleted) — re-running with
  a new prompt yields a fresh result and UNTICKS what no longer fits (removals happen on
  Apply); hint text updated. (4) TRACK PAGE: extra tags (track.tags) are no longer rendered
  as pills under the track — SEO-only; chips show Use Case / Genre / Mood.
- **2026-07-11 (AI Magic: collections skipped when all boxes ticked — fixed):** with every
  include on, the model answered facets + extra tags but returned collections empty (worked
  fine solo). Two causes addressed in suggest-tags.ts: max_tokens 900 was tight for the full
  JSON (facets + 3 membership lists + 30-50 tags) — raised to 3000, and a length-cut answer
  now fails loudly ("answer was cut off — press again", finish_reason check) instead of
  applying a half-result; system prompt gained an explicit "work through EVERY list you were
  given, one by one, never skip/leave one empty because you answered the others" rule. Still
  ONE API call for everything (owner wants token economy).
- **BACKLOG — AI Tools for creators (owner liked the ideas 2026-07-11, deciding which first;
  all run on the existing OPENAI_API_KEY / gpt-4o-mini, pennies per request):**
  (1) ★ AI MUSIC FINDER — visitor describes their video/scene in their own words → instant
  track picks from the catalog with playable previews (reverse of AI Magic: prompt → facet/tag
  match → filtered track list; infra exists). Prime Facebook-ad hook: "Describe your video —
  AI picks the music in 10 seconds". Rate-limit guests.
  (2) YOUTUBE LINK PICKER — paste a YouTube URL, read its title/description, feed into (1).
  Ad copy: "Paste your video link — get music that fits".
  (3) LICENSE ASSISTANT — small Q&A box ("TV ad in Germany — which license?") answering from
  the site's OWN license terms (TIER_INFO/PLAN_INFO as grounding), links the right tier;
  a 24/7 pre-sales fear-remover.
  (4) FREE LEAD-MAGNET PAGE — creator pastes a video description → free AI title/description/
  hashtags for YouTube/TikTok + "and here's music for it" track picks underneath; built to
  catch FB-ad traffic.
  (5) AI PLAYLIST BY PROMPT — "2-hour lo-fi + cinematic stream playlist" → generated shareable
  playlist page (each share = free marketing).
  Owner's suggested order: (1) → (3) → (4). HARD RULE from the owner: NO AI music GENERATION
  ever — the catalog is real, human-made music only (that's the brand). Also skip
  audio-upload similarity search for now (heavier tech, later).
- **2026-07-11 (AI covers for collections & playlists):** the track-page cover generation now
  exists on collection/playlist detail pages too. `AdminCoverControl` (AdminInlineContent.tsx)
  gained a ✨ button in the hover overlay → small popover with ONE optional steering word →
  POST /api/admin/generate-cover with `useCase: [item.title]` (the name stands in for the
  Use Case slot of the key-art prompt; mood defaults "Cinematic, Emotional"; hint = featured
  element) → result saved via the usual upsert (setImage) + refreshContent. No brand stamp /
  thumbnail for these (display tiles only, unlike track covers). Same pulsing-sparkle wait
  animation as the track page. Server untouched — the endpoint already accepted useCase/mood
  without trackId.
- **2026-07-11 (mock/demo fallback REMOVED from the storefront — owner request):** an empty or
  unreachable DB used to render the bundled demo tracks/collections/playlists; the owner hated
  it (also suspected it fed a demo-playlist image into link previews). Changes: useTracks.ts —
  starts empty, a successful /api/tracks answer is live data EVEN when 0 rows (source="api",
  admin tools stay on), API failure → empty catalog, catalogTracks import dropped;
  useContent.ts — musicCollections/mockPlaylists imports dropped, mapCollections/mapPlaylists
  always map (empty in → empty out, so deleting the LAST collection/playlist now clears the UI
  immediately), usePlaylists returns [] when nothing loaded. Mock data files stay in src/data +
  src/mocks (Account/Admin/Artist mock personas still import them) — they just never reach the
  public storefront. LINK-PREVIEW note: index.html already carries brand og:image/twitter:image
  (512 icon); any old "test playlist" share image is the messenger's CACHE — refresh via
  facebook.com/sharing/debugger (Scrape Again) or just re-send the link after deploy.
- **2026-07-11 (playlist themes in Tracks Edit + AI variation):** owner asked for "themes with
  playlists inside" — that ALREADY exists on /playlists (admin "New theme" button + per-theme
  ghost "+" card; told him). What was missing: (1) TRACKS EDIT panel now groups the Playlists
  checkboxes under small gold THEME headers (ContentItemLite gained `theme?`; membershipSection
  groups/sorts, themeless first); (2) suggest-tags.ts feeds playlists as "Theme — Playlist"
  labels (theme column read with legacy fallback; canonIds maps the label back to the id) and
  the prompt says to weigh both parts; (3) VARIATION ("human factor"): owner reuses one
  description across many tracks and got identical picks — now the client sends `trackTitle`
  as a differentiator, the prompt forbids carbon-copy answers (vary borderline picks, keep the
  strongest), temperature 0.4 → 0.75 (canonical filtering still kills hallucinations). Advice
  given to owner: richer, per-batch descriptions still give the best spread.
- **2026-07-11 (Admin → Playlists: themes-first + playlists ONLY inside themes):** the admin
  Playlists section already grouped by theme (drag between sections, ↑↓ theme reorder) but
  could only create theme-less playlists via one "New playlist" button. Now it mirrors
  /playlists: "+ New theme" control (bottom; empty draft sections live in state until their
  first playlist is saved — `adminDraftThemes`), "+ Playlist" button in EVERY theme section
  header (draft form opens with the theme prefilled). OWNER RULE added mid-session: playlists
  can be created ONLY inside a theme — the generic "New playlist" button is now
  collections-only, the no-theme section has no "+ Playlist", the /playlists ghost "+" card
  renders only in themed sections, and the draft form refuses a NEW playlist with an empty
  theme (editing legacy theme-less playlists still works; the "No theme" section still shows
  legacy rows). Empty no-theme section is no longer rendered on /playlists.
  [ROUND 2 — owner bug reports + tweaks, same day:]
  (1) BLACK SCREEN on "+ New theme" in Admin → Playlists: the new input used the <Check> icon
  which was NOT imported in AdminContent.tsx (ReferenceError on render) — import added.
  (2) EMPTY THEMES NOW SURVIVE F5: theme names persist in site_config key `playlist_themes` —
  new admin action `set_playlist_themes` {values[]}, admin content GET returns `playlistThemes`
  (added to AdminContentData in AdminTrackPanel + ContentData in AdminContent). Both "New
  theme" flows (admin section + /playlists page) save the name; section builders merge stored
  names as empty sections. Empty stored themes get an X (delete) button in the admin section
  header (occupied themes can't be deleted).
  (3) NO DEFAULT COVER: mapCollections/mapPlaylists no longer fall back to orchestral.jpg —
  new items render as EMPTY cards until the owner uploads/generates art (image renders guarded
  in Playlists/PlaylistDetail/Collections/CollectionDetail/Catalog strip).
  (4) CREATING A PLAYLIST from the /playlists ghost card no longer navigates INTO it — stays
  on the page, the new card pops into its theme (owner request).
  [ROUND 3 — same day:] (5) THEMES ARE FULLY INDEPENDENT of playlists now: deleting a theme's
  last playlist used to kill the theme (only button-created themes were in the persistent
  list). `registerPlaylistTheme()` in content.ts — every upsert_playlist with a theme adds the
  name to `playlist_themes`, and the admin GET back-fills themes found on playlists into the
  list once. A theme now dies ONLY via its explicit X button. Owner's workflow: create many
  empty themes first, sort playlists into them later; moving playlists BETWEEN themes = drag
  the row onto another theme section in Admin → Playlists (already worked). (6) Playlist titles
  in Admin → Playlists rows are now links to /playlist/<id> (hover gold; the small path caption
  fixed from /playlists/ to /playlist/).
- **2026-07-11 (Admin Playlists/Categories full management rework — owner UX round):** the old
  flow put ONE draft form at the page bottom (with 30 themes = endless scrolling) and the form
  carried a TrackPicker the owner never wanted there. Changes in AdminContent.tsx:
  (1) the create/edit form is now `draftForm` (hoisted const) rendered INLINE inside its theme
  section (`draftInSection`: by draft.id for edits, by draft.theme for creates); collections
  keep the bottom form. (2) TrackPicker + set_tracks REMOVED from the playlist form (collections
  keep it) — playlist tracks are assigned in Tracks Edit and managed on the row itself:
  (3) NEW `AdminTrackSubList` (module component: play + WaveformPreview click-to-seek via the
  global player + duration + optional ↑↓/✕) — playlist rows and category rows got a chevron
  EXPANDER; playlists: reorder (set_tracks with swapped ids) + remove; categories: remove
  (bulk_update_tracks categoryChanges). (4) THEME RENAME: double-click the section header →
  inline input → `renamePlaylistTheme` (re-upserts every playlist in the theme + rewrites the
  `playlist_themes` list). (5) CATEGORIES: ↑↓ reorder (server reorder_content now accepts
  kind "category" — table whitelist + ensureCategoryTables; body.kind type widened), title
  links to /catalog?category=<id>. All lists refresh via run()->reload + refreshContent.
- **2026-07-11 (playlists carousel + card progress ring):** /playlists theme sections no longer
  wrap onto a second line — each theme is a horizontal RAIL. New `src/components/CardCarousel.tsx`
  (generic; wraps any card children): scroll container + ResizeObserver/onScroll `atStart`/`atEnd`
  state; round prev/next arrows are rendered ONLY for the side that can scroll and fade in on
  `group-hover/rail`; right-edge gradient (`from-background via-background/85`) swallows the
  half-visible card, left gradient appears once scrolled. Widths live in `.card-rail` in
  `index.css`: `--rail-cards` = 2.2 / 3.5 (sm) / 4.5 (lg) / **5.5 (xl)** with
  `flex: 0 0 calc((100% - gap*(cards-1))/cards)`, so on desktop 5 cards are full and the 6th is
  cut in half under the shadow (owner-approved, competitor-style); scrollbar hidden,
  scroll-snap x proximity, `padding-bottom: 2rem` leaves room for the AdminItemBar under each
  card. `Playlists.tsx`: grid → `<CardCarousel>` (skeletons + each theme section; the admin ghost
  "+" card is the last rail item), cards keep the skewX(-9deg) parallelogram. PlaylistCard now
  also draws a **progress stroke around the card** while its preview track plays (SVG rect,
  `pathLength=100` + `vector-effect: non-scaling-stroke`, `preserveAspectRatio="none"` so it
  follows the skewed shape) — same language as the catalog cover ring; hover play button was
  already there. tsc 0 / eslint 0 (checked on a sandbox copy — the host↔sandbox mirror truncation
  glitch hit Playlists.tsx again; host file verified via Read).
- **2026-07-11 (playlists carousel — owner round 2 + collection cover branding):**
  (1) RAIL: `.card-rail` got `padding-left: 1.75rem` + `scroll-padding-left` — the skewed
  bottom-left corner of the FIRST card was clipped by the scroll box. (2) The right fade was too
  greedy (the half-visible 6th card almost disappeared): CardCarousel right gradient `w-[14%]
  via-background/85` → `w-[7%] via-background/70`, left one `8%` → `5%`. (3) PlaylistCard: the
  progress stroke around the card is GONE (owner: doesn't fit there). (4) Two distinct hover
  intents on the card: the dark overlay stays card-wide, but the play button is its own
  absolutely-centered element (`pointer-events-none` wrapper + `pointer-events-auto` button) with
  a `playHover` state — hovering the PLAY suppresses the "open playlist" affordance (title/arrow
  stay white) and the button gets a gold glow; hovering anywhere else keeps the gold title + arrow
  and click opens the playlist. (5) COLLECTION COVERS ARE BRANDED like track art: `brandIfCollection`
  in `AdminInlineContent.tsx` (AdminCoverControl) runs `brandCover()` + re-upload for BOTH the AI
  `generate()` and the `onFile()` upload-from-computer paths, and the Collections form in
  `AdminContent.tsx` brands picked files too — all guarded by `kind === "collection"`, so PLAYLIST
  covers stay clean (owner: playlist tiles already have title/count/arrow). Branding failures fall
  back to the plain image. (6) Fixed two pre-existing errors found while checking: `useComposerTracks`
  didn't return `vocabularies` (tsc error), and a BOM char inside a comment in `AdminImport.tsx`
  (eslint no-irregular-whitespace). tsc 0, eslint 0 errors.
  **WARNING for the next AI — do NOT write repo files from the sandbox (bash/python/heredoc).**
  The host→sandbox mirror keeps content fresh but LENGTH stale (files look truncated sandbox-side),
  and a sandbox write DOES propagate to the host — writing back a truncated mirror TRUNCATES THE
  HOST FILE (it happened to ComposerUpload.tsx this session; repaired). Edit/Write host tools only;
  if the sandbox mirror looks truncated when linting, repair the mirror by appending the missing
  tail read from the host copy.
- **2026-07-11 (composer credit + artist page + player queue):** owner round 3.
  (1) PLAYLIST CARD: play button is WHITE by default, turns gold (+glow) only on hover.
  (2) TRACK ROW TITLE CELL rebuilt (`TrackRowPlayer.tsx`): the title `<Link>` filled the whole grid
  cell, so hovering/clicking the empty space right of the text still navigated. Now the cell is a
  `flex-col` with two `w-fit` links — TITLE (top) and **"by <composer>"** (below, muted, gold on
  hover) — only the text is interactive. The composer line links to `/artist/<slug>` when the track
  has a composer profile, otherwise it is plain text.
  (3) COMPOSER DATA: `/api/tracks` also returns `artist_slug` (composers.slug map);
  `CatalogTrack.artistSlug` + useTracks mapping; public `/api/content` returns `composers`
  [{id, slug, displayName, bio}]; `useContent.ts` gained `useComposers()`.
  (4) ADMIN -> Users ⋯ menu: new **"About the composer"** textarea + Save button, right under the
  pseudonym and ABOVE Sync / Cue Sheet Info (owner's spec). Writes `composers.bio` (already in the
  base schema): `/api/admin/users` GET returns `bio`, PATCH accepts `bio` (≤2000 chars, requires an
  existing composer profile). `LiveUser.bio` + `bioDraft`/`saveBio` in Admin.tsx.
  (5) ARTIST PAGE `/artist/:slug` is LIVE (was 100% mock): nick + bio from `useComposers()`, tracks =
  live catalog rows filtered by `artistSlug`, rendered with the shared `TrackRowList` (full playback,
  identical rows to the catalog); skeletons while content/tracks load; "not found" only after content
  settles. Download total = sum of the tracks' `downloads`.
  (6) PLAYER QUEUE + PREV/NEXT: `useTrackAudioEngine` keeps a `queue` (CatalogTrack[]). `playVersion`
  gained an optional 4th arg `fromList` — the list the play came FROM: `TrackRowList` passes its
  `tracks` (home/collection/playlist/artist), Catalog passes the FULL filtered list (not just the
  current page), and the playlist CARD on /playlists passes that playlist's tracks. Engine exposes
  `hasPrev`/`hasNext`/`playPrev`/`playNext` (index of the active track inside the queue; no
  wrap-around). Mini-player: SkipBack / SkipForward flank the play button, dimmed + inert at the
  ends of the queue. A track started outside any list (TrackDetail) leaves the index at -1 → arrows
  inactive.
  (7) Fixed two more PRE-EXISTING errors found while verifying: `useComposerTracks` didn't return
  `vocabularies` (tsc error) and `for (const ok of results) ok ? sent++ : failed++;` in
  `functions/api/admin/campaign.ts` (eslint no-unused-expressions — this made `npm run lint` FAIL,
  i.e. deploy.bat's lint gate was red). Now: `npm run lint` 0 errors, tsc 0 errors.
- **2026-07-11 (polish round 4):** (1) ARTIST PAGE: removed the round Music2 avatar circle and the
  "N tracks in catalog · N downloads" line — header is just the nick + about text (owner: no avatar
  planned); page container widened to max-w-7xl, skeleton simplified.
  (2) COMPOSER SLUGS have NO random suffix any more (`/artist/lumine-wave`, not
  `…-6cab66`): `upsertComposer` in `functions/api/admin/users.ts` now slugifies the nick and REFUSES
  the save when that slug (or the display name) already belongs to another composer — "That artist
  page name is already taken". A RENAME now also rewrites the slug, so the URL follows the nick.
  Legacy suffixed slugs are cleaned by `normalizeComposerSlugs(db)` — a lazy, idempotent pass that
  runs on every admin Users GET and rewrites a composer's slug to the plain one whenever it is free.
  (3) PLAYLIST CARD: the play button + dim overlay now appear ONLY on hover (previously the button
  stayed pinned on a card whose track was playing).
  (4) HEADER ACCOUNT POPUP (`Navigation.tsx`): identity block reworked — email on top, then a row
  with the plan chip and, for free users, a gold **Upgrade** button that closes the popup and fires
  `openPlanModal()` (the tvms:pick-plan modal); a rule separates the block from the menu items;
  popup width 52 -> 60.
