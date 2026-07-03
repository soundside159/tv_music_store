# TVMUSICSTORE AI Handoff

This file is the short operational handoff for another AI assistant. It must stay free of secrets.

## Read First

1. `AGENTS.md`
2. `docs/TVMUSICSTORE_MASTER_PLAN.md`
3. This file

## Project Status

- Live domain: `https://tvmusicstore.com`
- GitHub repo: `https://github.com/soundside159/tv_music_store`
- Hosting: Cloudflare Pages, auto-deploying from `main`
- Current app: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- Backend is not built yet. Current catalog is temporary data in `src/data/catalogTracks.ts` with two real public MP3 preview tracks.
- Architecture decision: keep Vite + Cloudflare. Do not migrate to Next.js, WordPress, or Supabase unless the owner explicitly changes the plan.

## Current Routes

- `/`: Tunetank-style utility homepage (search hero, trending tracks, collections, plans teaser). Cinema-themed landing retired 2026-07-03, backed up in git history and the owner's design-backup-cinema folder
- `/catalog`: MVP Music Library shell with collection cards, active collection hero, left sidebar filters, real MP3 previews, click-to-seek waveforms, strict track-row columns, animated expandable versions, heart/cart actions, and sticky player UI
- `/track/:slug`: MVP track detail shell backed by temporary catalog data and real MP3 previews, with Versions / Similar / License Info tabs
- `*`: NotFound fallback

## Deployment Settings

Cloudflare Pages settings:

- Production branch: `main`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Root directory: repository root

The project uses npm and `package-lock.json`. Do not add `bun.lockb`.

## Local Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Auth And Access Rules

- GitHub CLI is configured on the owner's Windows machine through the OS keyring.
- Do not ask the owner to paste GitHub tokens into chat.
- Do not commit `.env`, API keys, tokens, passwords, Stripe secrets, Resend keys, Cloudflare tokens, or private audio masters.
- Store future local secrets only in ignored env files and Cloudflare dashboard variables/secrets.

## Current Implementation Notes

- `src/data/catalogTracks.ts` is the temporary source for catalog records and collection membership.
- `src/data/musicCollections.ts` is the temporary source for Music Library collection cards and active collection hero metadata.
- `public/audio/previews/` contains public MP3 previews generated from owner-provided WAVs. Do not commit private master WAV/ZIP files.
- `public/images/collections/` contains temporary public collection covers copied from owner-provided test images.
- `src/pages/Catalog.tsx` links each track to `/track/:slug` and uses this desktop rhythm: top breadcrumb/hero, left filters, center collection strip/search/list, bottom sticky player. Active collection state is stored in `?collection=collection-id`. Track rows use fixed columns: play / title / +versions / waveform / duration / BPM / heart / cart.
- Track row spacing is controlled by `.music-track-grid` in `src/index.css`. Increase `--track-title-version-gap` to create more empty space between the track title and the `+2` versions button; everything from the versions button to the right will shift/compress consistently.
- `src/pages/TrackDetail.tsx` shows a minimal main player, version rows, similar rows, and compact license rows hidden behind tabs.
- Catalog and track detail design should stay minimal: dark graphite/neutral base, **brand gold/yellow as the single accent for all interactive states (hover/active/progress) — the earlier cyan/blue accent is deprecated by owner decision 2026-07-03**, no top AI/tool pill list, no separate Details button in rows, no fake demo tracks just to fill space, and compact waveform rows should be the main music-library element.
- Stripe buttons are UI placeholders only. No payment should be considered real until webhook-confirmed backend logic exists.
- Waveform UI decodes public MP3 previews in the browser, renders audio-based SVG peaks, shows a scan-line loading state while decoding, colors only already played progress cyan, and supports click-to-seek without pausing playback. Alternate-version waveforms start in the same column as the full mix and use a duration ratio so shorter versions end earlier. R2/private masters come later.

## Business Model (V2 — subscription)

The project moved from single-composer per-track licensing (V1) to a three-composer subscription model (V2): Free 3 downloads/month, Pro $7/mo annual, Max $15/mo annual, plus one-time Sync licenses and custom work. Revenue split 50% platform / 50% author pool by downloads. Read `docs/TVMUSICSTORE_MASTER_PLAN.md` (V2) and `docs/PAGES_SPEC.md` before building anything.

## Next Recommended Step

Design-first, mocks before backend (strict order from `docs/PAGES_SPEC.md` section 5):

1. `src/types/`: domain types matching the V2 D1 schema (users, composers, subscriptions, download_log, payouts, etc.).
2. `src/mocks/`: fake-data layer (3 composers, users on every plan, download history, payout periods) accessed only through hooks (`useCurrentUser`, `useSubscription`, `usePlans`, `useTracks`). Existing `src/data/catalogTracks.ts` keeps powering `/catalog` until migrated.
3. Build pages on mocks: `/pricing` → `/account` → `/composer` → `/admin`. Owner iterates on design at this stage.
4. Only after the owner approves the frontend: D1 schema, auth, Stripe Billing + Tax + webhooks, R2 entitlements, Resend.

Payments and subscriptions are real only after Stripe webhook confirmation.
