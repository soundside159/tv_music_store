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

## Backend Status (updated 2026-07-04)

The design-first mock phase is DONE (types, mocks, all pages built). Phase 3 (live backend) is underway. Already LIVE on production:

- D1 database bound (`DB`), 22 tables from `migrations/0001_init.sql`, seeded plans/composers. Check `/api/health` for binding status.
- Auth, three ways, all working: email + 6-digit code (Resend; domain `e.tvmusicstore.com` verified; from `no-reply@e.tvmusicstore.com`, reply-to `contact@tvmusicstore.com`); email + password (PBKDF2, `password_hash` column is auto-added by code); Google OAuth (`/api/auth/google` + `/api/auth/google/callback`, secrets live in Cloudflare).
- Sessions: httpOnly cookie, 30 days. `/api/me` GET returns user + subscription + downloads used; PATCH updates display name.
- Owner rule: `soundside159@gmail.com` is ALWAYS admin — self-healed on every `/api/me` GET; hardcoded as `OWNER_EMAIL` in `functions/api/_utils.ts`.
- Admin users API: `/api/admin/users` (GET list, PATCH role). Admin page → Customers section is live with role dropdowns; the owner assigns roles (customer/composer/admin) himself.
- Tunetank-style auth modal (`src/components/AuthModal.tsx`) opens from the navbar person icon (portal to body — do not move it back inside the fixed nav). `/login` page is the fallback with a password option.
- Live session store: `src/hooks/useAuth.ts`. `useMockData` hooks prefer the live session; mock personas apply ONLY in dev mode (`?dev=1` → localStorage `tvms.dev`) and never for real visitors.
- Account page: grouped sidebar (Account / Plan / Music / Support + gold "Admin panel" link for admins), Profile section with display-name editing.

NOT yet live (still mocks): Stripe (owner will register and put keys in Cloudflare), R2 downloads/entitlements, composer cabinet (`/composer` is a design mock — a real account with role=composer sees nothing there yet; that is expected, Phase 2), all admin modules except Customers, whitelist/claim flows.

## Next Recommended Step (in order)

1. **Stripe Billing** (Phase 3.3): Checkout for Pro/Max (monthly + annual), webhooks (`customer.subscription.*`, `invoice.paid`, `checkout.session.completed`) → `subscriptions` table, customer portal button in Account → Plan & Billing. Blocked until the owner adds `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` to Cloudflare.
2. **R2 + entitlements**: real downloads with plan limits (the Free 3/month counter already works via `download_log`).
3. **Admin Content (Storefront) editor**: the owner's concrete requirements are written in `docs/PAGES_SPEC.md` section 4.1 — trending/collections/playlists management, cover-image upload to R2, unified tags (use cases/moods/genres), inline track preview, alt-versions always follow the main track. Also: whitelist requests list must show requester email, plan, date.
4. **Composer cabinet live wiring** (Phase 2 of the master plan): real composer profiles linked to users with role=composer, plus a "Composer panel" link in Account for them.

Keep the owner's workflow simple: he runs `deploy.bat`, tests in the browser like a normal user, and must never be sent to Cloudflare logs or wrangler commands unless truly unavoidable. Secrets live only in Cloudflare dashboard — never in chat or git.

Payments and subscriptions are real only after Stripe webhook confirmation.
