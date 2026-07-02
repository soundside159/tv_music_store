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

- `/`: branded landing page
- `/catalog`: MVP catalog shell with left sidebar filters, real MP3 previews, click-to-seek waveforms, expandable versions, heart/cart/download actions, and sticky player UI
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

- `src/data/catalogTracks.ts` is the temporary source for catalog records.
- `public/audio/previews/` contains public MP3 previews generated from owner-provided WAVs. Do not commit private master WAV/ZIP files.
- `src/pages/Catalog.tsx` links each track to `/track/:slug` and uses a three-column desktop rhythm: left filters, center search/list, bottom sticky player.
- `src/pages/TrackDetail.tsx` shows a minimal main player, version rows, similar rows, and compact license rows hidden behind tabs.
- Catalog and track detail design should stay minimal: dark graphite/white palette, no gold/mustard theme, no top AI/tool pill list, no separate Details button in rows, no Stems badge for now, and compact waveform rows should be the main music-library element.
- Stripe buttons are UI placeholders only. No payment should be considered real until webhook-confirmed backend logic exists.
- Waveform UI decodes public MP3 previews in the browser, renders audio-based peaks, and supports click-to-seek without pausing playback. R2/private masters come later.

## Next Recommended Step

Build the first backend foundation:

1. Add Cloudflare D1 schema for tracks, versions, license tiers, orders, licenses, customers, downloads, and contact messages.
2. Add seed data that mirrors `src/data/catalogTracks.ts`.
3. Add read-only Pages Functions/API endpoints for catalog and track detail.
4. Switch the frontend from mock imports to API data after the API is stable.

Resend and Stripe should come after the core database shape is committed, because emails and payments depend on orders/licenses data.
