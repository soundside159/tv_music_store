# TVMUSICSTORE Project Guide

This file is the quick working map for AI assistants and developers. The full product and architecture plan is in `docs/TVMUSICSTORE_MASTER_PLAN.md`. Update both files whenever the project structure, deployment, services, routes, data model, or major workflow changes.

## Product

TVMUSICSTORE is a cinematic music stock site for selling original tracks with different license options. The first version is a React marketing/catalog frontend. Later versions will add account login, payments, licenses, private downloads, and an admin area.

Core positioning: boutique cinematic music licensing from one composer, with direct contact, track adaptation/custom music, and Content ID claim removal support within 24 hours.

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
- Google Fonts: Inter for the modern UI; Cinzel remains loaded only for legacy/homepage compatibility

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

- `src/pages/Index.tsx`: main homepage composition
- `src/pages/Catalog.tsx`: MVP Music Library page with collection cards, active collection hero, left sidebar filters, real preview MP3 playback, compact track rows, expandable versions, action icons, and sticky player shell
- `src/pages/TrackDetail.tsx`: MVP track detail page backed by real preview MP3s, with a quiet main player and Versions / Similar / License Info tabs
- `src/pages/NotFound.tsx`: fallback route page
- `src/components/Navigation.tsx`: fixed full-width header and menu
- `src/components/CinemaHero.tsx`: hero image and category-specific headline
- `src/components/Categories.tsx`: category selector buttons
- `src/components/TrackList.tsx`: temporary fixed track preview panel and player bar
- `src/components/WaveformPreview.tsx`: shared waveform component that decodes MP3 previews in the browser, renders audio-based peaks, and supports click-to-seek
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
- Use Vite asset imports for bundled images, not hardcoded `/src/assets/...` URLs.
- Do not commit `node_modules`, `dist`, `.env`, tokens, passwords, API keys, or private audio masters.
- Preview/demo audio can be public later; master WAV/ZIP files must be private in R2 later.
- Keep changes scoped. Avoid unrelated refactors.
- If a small method/component is changed, provide copy-pasteable replacement guidance when explaining it to the owner.

## Future Architecture Notes

Planned app areas:

- `/`: public catalog and homepage
- `/catalog`: MVP Music Library, currently backed by `src/data/catalogTracks.ts` and `src/data/musicCollections.ts`; keep the UI minimal, dark/neutral, and track-row focused. Current layout uses breadcrumbs, a Music Library hero, horizontal collection cards, active collection hero via `?collection=...`, a left sidebar with Use Case, Genre, and Mood filters, compact rows, expandable version rows, heart/cart actions, and no separate Details button.
- `/track/:slug`: MVP track detail page, currently backed by `src/data/catalogTracks.ts`; keep the main player and licensing info visually quiet. Current layout uses tabs for Versions, Similar, and License Info so licensing text is not dumped into the first viewport.
- `/playlists` and `/playlist/:slug`: curated playlists
- `/free`: free tier tracks in exchange for email
- `/licensing`: license information and FAQ
- `/custom`: adaptation/custom music brief page
- `/blog`: SEO content
- `/cart` and `/checkout`: Stripe checkout flow
- `/account`: future user account and purchases
- `/admin`: future private admin dashboard
- `/terms`, `/privacy`, `/license-agreement`: legal pages

Planned data entities:

- `users`
- `tracks`
- `track_versions`
- `tags`
- `track_tags`
- `playlists`
- `playlist_tracks`
- `customers`
- `licenses`
- `orders`
- `order_items`
- `downloads`
- `free_downloads`
- `claim_requests`
- `briefs`
- `promo_codes`
- `license_tiers`
- `email_events`
- `contact_messages`
- `search_log`
- `support_tickets`
- `admin_users`

Payments must be confirmed by Stripe webhooks before creating orders, licenses, or download access.

MVP priority:

1. Keep current branded landing page.
2. Build `/catalog` on temporary data first. Current status: two real tracks, six public MP3 preview versions, collection cards, active collection hero, and click-to-seek waveform playback from real decoded audio are connected.
3. Build `/track/:slug` on temporary data first. Current status: real preview playback, version switching, similar rows, and tabbed license info exist.
4. Add D1 schema and seed flow.
5. Add R2 storage strategy for previews and private masters.
6. Add Resend domain and transactional email scaffolding.
7. Add Stripe Checkout and webhooks.
8. Add basic `/admin` for tracks, tags, prices, orders, and customers.

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
