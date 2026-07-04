# TVMUSICSTORE Project Guide

This file is the quick working map for AI assistants and developers. The full product and architecture plan is in `docs/TVMUSICSTORE_MASTER_PLAN.md`. Update both files whenever the project structure, deployment, services, routes, data model, or major workflow changes.

## Product

TVMUSICSTORE is a cinematic music subscription site (model V2). Three composers, ~1000 tracks total. Monetization: Free (3 downloads/month) / Pro $7/mo annual / Max $15/mo annual subscriptions (Tunetank-style), plus one-time Sync licenses ($199/$399) and adaptation/custom services. Revenue: 50% platform, 50% author pool split by downloads.

Core positioning: curated cinematic catalog from three real composers (no AI music), with Content ID claim removal within 24 hours and channel whitelisting as the trust hook.

Full business model: `docs/TVMUSICSTORE_MASTER_PLAN.md` (V2). Page-by-page spec: `docs/PAGES_SPEC.md`.

## Current Stack

- React 18 with functional components and hooks
- TypeScript
- Vite
- Tailwind CSS v3
- shadcn/ui components
- Framer Motion for UI animation
- React Router DOM
- TanStack Query
- Lucide React icons
- Google Fonts: Inter for all UI and body text; Playfair Display (serif) for display headings via --font-display / font-display

## Planned Services

- GitHub: source of truth for code
- Cloudflare Pages: frontend hosting and automatic deployments from `main`
- Cloudflare DNS/Registrar: domain and DNS management
- Cloudflare Workers/Pages Functions: future API/backend
- Cloudflare D1: future SQL database for users, orders, licenses, and track metadata
- Cloudflare R2: future private storage for master audio files and downloadable packages
- Resend: transactional email such as login codes, receipts, contact forms, and license emails
- Stripe: future checkout, payments, and webhooks

Architecture is fixed in the master plan: do not migrate to Next.js, Supabase, or WordPress unless the owner explicitly changes the architecture.

## Repository Structure

- `src/pages/Index.tsx`: Tunetank-style utility homepage (hero with search, category chips, trending tracks, collection cards, mood chips, plans teaser, trust/SEO block). The former cinema-themed landing is retired: components `CinemaHero`, `Categories`, `CategoryCard`, `LoadingScreen`, `TrackList` are unused and kept only as reference (full copy in the owner's design-backup-cinema folder and in git history) — do not wire them back without an explicit owner request; they can be deleted
- `src/pages/Catalog.tsx`: MVP Music Library page with collection cards, active collection hero, left sidebar filters, real preview MP3 playback, strict track-row columns, animated expandable versions, action icons, and sticky player shell
- `src/pages/TrackDetail.tsx`: MVP track detail page backed by real preview MP3s, with a quiet main player and Versions / Similar / License Info tabs
- `src/pages/NotFound.tsx`: fallback route page
- `src/components/Navigation.tsx`: fixed full-width header and menu
- `src/components/CinemaHero.tsx`: hero image and category-specific headline
- `src/components/Categories.tsx`: category selector buttons
- `src/components/TrackList.tsx`: temporary fixed track preview panel and player bar
- `src/components/WaveformPreview.tsx`: shared waveform component that decodes MP3 previews in the browser, renders audio-based SVG peaks, shows a loading scan while decoding, colors only played progress cyan, and supports click-to-seek without click-to-pause
- `src/components/Footer.tsx`: contact form UI
- `src/components/LoadingScreen.tsx`: initial loading screen
- `src/components/ui/`: shadcn/ui primitives
- `src/hooks/`: custom hooks
- `src/lib/`: shared utilities
- `src/data/catalogTracks.ts`: temporary catalog data for the two real uploaded tracks, collection ids, and catalog-related TypeScript types; replace with D1-backed API later
- `src/data/musicCollections.ts`: temporary collection metadata and public cover image paths for the Music Library collection strip and collection hero
- `src/assets/`: bundled image assets used by Vite
- `public/`: static public files copied to build output
- `public/audio/previews/`: public MP3 preview files generated from owner-provided WAVs; do not put private master WAV/ZIP files here
- `public/images/collections/`: public temporary collection cover images used by `/catalog`
- `public/_redirects`: Cloudflare Pages SPA fallback
- `docs/TVMUSICSTORE_MASTER_PLAN.md`: full business, UX, technical, database, admin, email, marketing, and roadmap plan
- `docs/AI_HANDOFF.md`: short operational handoff for another AI assistant; never include secrets there

## Local Commands

Use npm. Do not use Bun for installs or Cloudflare builds.

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
```

The repository should not contain `bun.lockb`; Cloudflare Pages must install from `package-lock.json`.

## Cloudflare Pages

Use Pages, not Workers, for the current frontend deploy.

- Framework preset: `Vite`
- Production branch: `main`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Root directory: repository root

If Cloudflare auto-detects Bun, add `SKIP_DEPENDENCY_INSTALL=1` and keep the build command as `npm ci && npm run build`.

`public/_redirects` must stay in place so direct browser visits to future React routes like `/admin` resolve to `index.html`.

## Coding Rules

- Keep user-facing source code in TypeScript/React.
- Follow existing Tailwind and shadcn/ui patterns.
- Accent color for all interactive states (hover/active/focus/progress) is the brand gold/yellow, defined once as a Tailwind token. No blue/cyan interactive states anywhere (owner decision 2026-07-03). Base palette stays dark graphite/neutral.
- Use Vite asset imports for bundled images, not hardcoded `/src/assets/...` URLs.
- Do not commit `node_modules`, `dist`, `.env`, tokens, passwords, API keys, or private audio masters.
- Preview/demo audio can be public later; master WAV/ZIP files must be private in R2 later.
- Keep changes scoped. Avoid unrelated refactors.
- If a small method/component is changed, provide copy-pasteable replacement guidance when explaining it to the owner.

## Future Architecture Notes

Planned app areas:

- `/`: public catalog and homepage
- `/catalog`: MVP Music Library, currently backed by `src/data/catalogTracks.ts` and `src/data/musicCollections.ts`; keep the UI minimal, dark/neutral, and track-row focused. Current layout uses breadcrumbs, a Music Library hero, horizontal collection cards, active collection hero via `?collection=...`, a left sidebar with Use Case, Genre, and Mood filters, compact rows, strict columns (`play / title / +versions / waveform / duration / BPM / heart / cart`), expandable alternate-version rows, heart/cart actions, and no separate Details button.
- `/track/:slug`: MVP track detail page, currently backed by `src/data/catalogTracks.ts`; keep the main player and licensing info visually quiet. Current layout uses tabs for Versions, Similar, and License Info so licensing text is not dumped into the first viewport.
- `/playlists` and `/playlist/:slug`: curated playlists
- `/pricing`: subscription plans Free/Pro/Max, annual default, comparison table, FAQ
- `/sync`: one-time sync licenses (Standard $199 / Broadcast $399) — built: tier cards, how-it-works, quote request form (UI-only)
- `/custom` (built): adaptation from $149 / custom from $499, process steps, composer cards from mocks, brief form (UI-only)
- `/licensing`: license information and FAQ
- `/artist/:slug`: public composer pages (three composers)
- `/blog`: SEO content
- `/account`: customer dashboard (downloads, license, whitelist, claims, billing) — built on mock hooks; guest sees a sign-in prompt. A DevPersonaSwitcher (enable with `?dev=1`, disable `?dev=0`) previews the site as guest/free/pro/max/canceled/composer/admin
- `/composer` (built on mocks): dashboard (daily downloads bars, month earnings estimate, top tracks), my tracks table, upload form (UI-only), earnings by month with statements, claim/brief requests, profile. Composer resolved via `useComposer()`; admin persona previews as composer 1
- `/admin` (built on mocks, admin persona only): Dashboard (MRR, subscribers, free→paid, funnel, revenue streams), Finance (payout periods with per-composer lines, generate statements / mark paid, split settings), Tracks (moderation queue + catalog), Customers (mini-CRM), Requests (whitelist/claims/briefs). Remaining planned modules: Playlists, Plans editor, Analytics deep-dive, Marketing, Blog
- `/terms`, `/privacy`, `/license-agreement`: legal pages

Planned data entities (full V2 schema in `docs/TVMUSICSTORE_MASTER_PLAN.md`, section 6):

- `users` (roles: customer/composer/admin), `composers`
- `tracks` (+ composer_id, moderation_status), `track_versions`, `tags`, `track_tags`
- `playlists`, `playlist_tracks`
- `subscriptions`, `plan_config`, `download_log`
- `whitelist_channels`, `claim_requests`
- `payout_periods`, `payout_lines`
- `sync_orders`, `briefs`
- `promo_codes`, `email_log`, `contact_messages`, `search_log`, `support_tickets`

Payments and subscriptions must be confirmed by Stripe webhooks before granting entitlements or download access.

Development order (V2, strict — see `docs/PAGES_SPEC.md` section 5):

1. `src/types/` + `src/mocks/`: domain types matching the D1 schema and a fake-data layer accessed only through hooks. Components must never hardcode data.
2. Design-first frontend on mocks: public pages → `/account` → `/composer` → `/admin`. Owner iterates on design freely at this stage.
3. Logic: auth (magic link + Google) → Stripe Billing + Tax + webhooks → entitlements + R2 signed URLs → download limits → whitelist/claims → payouts → Resend. Only the data hooks change; components stay.
4. Upload the real three-composer catalog. Do not add fake tracks to the public catalog; fake data lives only in `src/mocks/`.

## Documentation Rule

When adding or changing any of these, update this file in the same commit:

- routes/pages
- public API endpoints
- database tables
- external services
- deploy configuration
- storage strategy
- payment or email workflow
- admin features

Never store secrets in this file.
