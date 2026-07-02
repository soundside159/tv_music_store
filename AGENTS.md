# TVMUSICSTORE Project Guide

This file is the working map for AI assistants and developers. Update it whenever the project structure, deployment, services, routes, data model, or major workflow changes.

## Product

TVMUSICSTORE is a cinematic music stock site for selling original tracks with different license options. The first version is a React marketing/catalog frontend. Later versions will add account login, payments, licenses, private downloads, and an admin area.

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

Do not use Supabase or WordPress unless the owner explicitly changes the architecture.

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

## Local Commands

Use npm unless the owner asks otherwise.

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
```

## Cloudflare Pages

Use Pages, not Workers, for the current frontend deploy.

- Framework preset: `Vite`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: repository root

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
- `/track/:slug`: future track detail page
- `/license`: future license information
- `/account`: future user account and purchases
- `/admin`: future private admin dashboard

Planned data entities:

- `users`
- `tracks`
- `track_versions`
- `licenses`
- `orders`
- `order_items`
- `downloads`
- `email_events`
- `contact_messages`

Payments must be confirmed by Stripe webhooks before creating orders, licenses, or download access.

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
