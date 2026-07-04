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
  **Still separate:** `src/pages/TrackDetail.tsx` has its OWN `<audio>` preview player — not yet
  wired to the global player (follow-up if we want the detail page to feed the global bar too).
- Cart, Download, Favorite, Similar Tracks, Login are **UI placeholders** — no backend yet.
- Backend (Cloudflare D1 / R2 / Stripe / Resend) not built — see master plan roadmap.
- Confirm exact gold hex with owner (`#F4C430` is an estimate from a screenshot).

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
