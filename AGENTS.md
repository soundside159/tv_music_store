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
- Google Fonts: Cinzel for display text, Inter for body text

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
- `src/pages/NotFound.tsx`: fallback route page
- `src/components/Navigation.tsx`: fixed header and menu
- `src/components/CinemaHero.tsx`: hero image and category-specific headline
- `src/components/Categories.tsx`: category selector buttons
- `src/components/TrackList.tsx`: temporary fixed track preview panel and player bar
- `src/components/Footer.tsx`: contact form UI
- `src/components/LoadingScreen.tsx`: initial loading screen
- `src/components/ui/`: shadcn/ui primitives
- `src/hooks/`: custom hooks
- `src/lib/`: shared utilities
- `src/assets/`: bundled image assets used by Vite
- `public/`: static public files copied to build output
- `public/_redirects`: Cloudflare Pages SPA fallback
- `docs/TVMUSICSTORE_MASTER_PLAN.md`: full business, UX, technical, database, admin, email, marketing, and roadmap plan

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
- `/catalog`: filterable music catalog
- `/track/:slug`: future track detail page
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
2. Build `/catalog` on mock data first.
3. Add D1 schema and seed flow.
4. Add R2 storage strategy for previews and private masters.
5. Add Resend domain and transactional email scaffolding.
6. Add Stripe Checkout and webhooks.
7. Add basic `/admin` for tracks, tags, prices, orders, and customers.

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
