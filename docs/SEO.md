# SEO — current state & plan

## The situation (accurate version)

The site is a Vite **React SPA** on Cloudflare Pages: the served HTML is a near-empty
shell and the content is rendered by JavaScript.

- **Google & Bing DO run JavaScript**, so they can see the rendered pages (catalog,
  pricing, tracks). It's not "invisible to Google" — but JS rendering is slower and
  less reliable, and until now **every route shared the homepage `<title>`/description**.
- **JS-less bots** (GPTBot/ChatGPT, some social link-preview crawlers, simpler
  scrapers) only see the static shell. So anything important should also live in the
  static HTML.

## Done (this pass)

- **Rich static `index.html`**: strong title + meta description, canonical, OG/Twitter
  tags, and **JSON-LD** (`Organization`, `WebSite` + SearchAction, `Product` with Pro/Max
  `Offer`s, and a `FAQPage` covering YouTube/ads/client-work usage, Pro-vs-Max, formats,
  whitelisting and one-time licenses). This is readable by ALL bots for the homepage.
- **`public/robots.txt`** — allows crawling, blocks /account /admin /cart /login, points
  to the sitemap.
- **`public/sitemap.xml`** — the main marketing routes.
- **Per-route meta** via a tiny zero-dependency hook `src/hooks/useSeo.ts` (sets
  `<title>`, description, canonical, OG, and a route JSON-LD). Wired on **Pricing** and
  **TrackDetail** (per-track title/description + `MusicRecording` JSON-LD). Google/Bing
  pick these up on render.

## Next steps (bigger — need owner sign-off / testing)

1. **Wire `useSeo` on the remaining pages** — Catalog, Collections, Playlists, Licensing,
   Sync, Custom, Home. Quick, zero-dependency, improves Google rankings per page.
2. **Dynamic sitemap for tracks** — a Cloudflare Pages Function `GET /sitemap-tracks.xml`
   that lists every published track URL from D1, referenced from robots.txt. Lets Google
   discover all `/track/<code>-<slug>` pages.
3. **Prerendering / dynamic rendering (the real fix for JS-less bots on every page).**
   Options:
   - A build-time prerender of the STATIC marketing pages (home, pricing, licensing,
     sync, terms, privacy) so JS-less bots get full HTML. Needs a prerender step
     (headless Chromium) in the build — adds build weight; test before relying on it.
   - For DYNAMIC track pages: a Cloudflare Function that, when a bot requests a track
     URL, returns HTML with the track's meta tags + `MusicRecording` JSON-LD injected
     (a.k.a. dynamic rendering). More work, but gives JS-less bots real per-track SEO.
   - Or migrate to an SSR framework (largest effort — probably overkill for now).

Recommended order: (1) finish per-route meta, (2) dynamic track sitemap, then decide on
(3) prerendering based on how much AI/ChatGPT/social traffic matters.

---

## 2026-07-11 — all three are DONE (edge prerender)

**1. Tag landing pages.** `/discover`, `/discover/moods/<tag>`, `/discover/genres/<tag>`,
`/discover/themes/<tag>` (`src/pages/Discover.tsx`) — one indexable page per Use Case /
Genre / Mood, with H1, copy, the tracks, a related tail and sibling-tag links. Every tag
pill on the site points there.

**2. Dynamic sitemap.** `public/sitemap.xml` is now a sitemap INDEX:
`public/sitemap-pages.xml` (fixed routes) + `/api/sitemap` (`functions/api/sitemap.ts`) —
generated per request from D1: every tag page, published track, composer, collection and
playlist. Never goes stale.

**3. EDGE PRERENDER — `functions/_middleware.ts`.** The chosen approach (no build step, no
SSR framework, no headless Chromium):

- Runs on every HTML GET (skips `/api/*`, files with an extension, and the private
  `/account /admin /cart /login /composer` routes).
- Looks the route up in **D1** and rewrites the shell it is about to serve with
  `HTMLRewriter`: real `<title>`, meta description, canonical, OG/Twitter tags, a
  `application/ld+json` block (`MusicRecording` for tracks, `MusicGroup` for artists,
  `CollectionPage` for tags), and **real content inside the empty `<div id="root">`**
  (h1, description, links to that page's tracks/tags).
- React then boots and replaces `#root` with the live app — same content, so this is
  prerendering, not cloaking. No user-agent sniffing: everyone gets the same HTML.
- Routes covered: `/`, `/catalog`, `/collections`, `/playlists`, `/pricing`, `/licensing`,
  `/sync`, `/custom`, `/discover`, `/discover/<group>/<tag>`, `/track/<slug>` (also by the
  leading code), `/artist/<slug>`, `/collection/<id>`, `/playlist/<id>`.
- Fail-safe: any DB error → the plain SPA shell is served unchanged.

Because the HTML is built per request from the database, a newly published track is fully
indexable immediately — a build-time prerender would have gone stale until the next deploy.

Remaining nice-to-haves: `og:image` per track needs 1200x630 art (currently the square
logo/cover); consider a `summary_large_image` Twitter card once those exist.
