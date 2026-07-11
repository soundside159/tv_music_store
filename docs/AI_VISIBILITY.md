# AI visibility (GEO) — what we did, what to do monthly

Goal: when someone asks ChatGPT / Perplexity / Gemini / Google's AI Overview a question
about licensing music, the answer is built from **our** pages and cites us.

## What actually moves the needle (and what doesn't)

**Doesn't:** `llms.txt`. Adoption is ~3-10% of sites, and monitoring of 500M+ AI-bot
visits found the file is almost never fetched — GPTBot, ClaudeBot, PerplexityBot and
OAI-SearchBot crawl the HTML directly. 8 of 9 sites measured no traffic change after
adding it. It costs nothing to ship, but it is not a strategy.

**Does:**

1. **Being readable at all.** Done — `functions/_middleware.ts` prerenders every page at
   the edge, so JS-less AI crawlers now see real content instead of an empty SPA shell.
   This alone is the biggest single win, and most React sites of this age still fail it.
2. **Answering a concrete question, answer-first.** Done — `/guides` (src/content/guides.ts):
   each guide leads with a `tldr` (the paragraph an engine lifts), then sections with
   tables, then an explicit Q&A block emitted as `FAQPage` schema.
3. **Structured data.** Done — Article + FAQPage on guides, FAQPage on /licensing and
   /pricing, MusicRecording on tracks, MusicGroup on artists, CollectionPage on tag pages.
4. **Freshness + attribution.** Each guide carries an `updated` date shown on the page and
   in the schema. Refresh dates when the facts change — do not fake them.
5. **Third-party mentions.** The part we cannot do from the codebase: the models trust
   what other sites say about us. Forum answers, a Reddit comment that actually helps,
   a guest article — these feed the training and retrieval sets.

## The monthly check (15 minutes)

Run these prompts in ChatGPT, Perplexity, Gemini and Google (AI Overview) and record
whether tvmusicstore.com appears in the answer or the citations:

1. "Can I use royalty-free music on YouTube and keep monetization?"
2. "Why did I get a Content ID claim on music I paid for?"
3. "What music license do I need for client work?"
4. "What license do I need for music in a Facebook ad?"
5. "How do I license music for a documentary going to Netflix?"
6. "What is a cue sheet and do I need one?"
7. "Royalty-free vs copyright-free music — what is the difference?"
8. "How much does royalty-free music cost per month?"
9. "Best royalty-free music for trailers"
10. "Where can I get cinematic music for a YouTube video?"

Log: date · prompt · engine · cited? · which page. Three months of that shows whether the
guides are working; without it, everything here is guesswork.

## Honest expectations

- Nobody can guarantee an AI citation. These systems are opaque and change monthly.
- Timeline is months, not days — pages must be crawled, indexed and then retrieved.
- Queries 1-8 are winnable (factual, we have the authority: we license this music).
  Queries 9-10 are competitive commercial queries where big libraries with thousands of
  backlinks dominate; expect those last, if at all.
- The guides earn their keep from ordinary search traffic regardless of what the models do.

## BACKLOG — Sound Effects SEO (owner request, do it AFTER the SFX library ships)

The owner is adding a **sound-effects library** (a composer friend has a large SFX base;
the selling point is again *real recordings, not AI*). When the SFX product exists, repeat
the whole playbook for it — do NOT write the guides before the product, or they will be
pages that promise something the site cannot deliver.

Checklist for that pass:

1. **Tag pages for SFX** — the SFX equivalent of /discover: the categories people actually
   search for, per the research below.
2. **Guides** — same answer-first shape:
   - "Do I need a license for sound effects on YouTube?"
   - "Royalty-free sound effects for games — what the license must cover" (embedding SFX in
     a shipped game is a different right from playing them in a video)
   - "How to tell AI-generated sound effects from recorded ones" (our angle)
   - "Where do sound effects come from? Foley vs library vs synthesis"
   - "Sound effects for video editing: the 12 you actually need"
3. **Schema** — `AudioObject` per effect; `FAQPage` on the SFX licensing page.
4. **Sitemap + prerender** — extend `/api/sitemap` and `functions/_middleware.ts` the same
   way they were extended for tracks and guides.

**Research already done (July 2026) — what people actually search for in SFX:**

- **UI / "earcons":** click, tap, hover, toggle, success, error, notification, alert, ding,
  ping. Filtered by duration (sub-1s).
- **Transitions:** whoosh, swoosh, swish, sweep — for scene changes, text reveals, logo
  animations. 1-3s.
- **Impacts / stingers:** hit, impact, slam, thud, boom — to button a cut or land a title.
- **Foley:** footsteps, doors, cloth, keys, typing.
- **Ambience:** rain, wind, city, room tone — longer files.
- **Game-specific:** menu scroll, coin/pickup, level-up, explosion, weapon, cartoon SFX.
- Popular tags seen across libraries: whoosh, notification, riser, rain, typing, pop.
- Buyers filter by: duration, file format (WAV vs MP3), loopable, and whether the license
  covers **embedding in a shipped product** (games, apps) — that last one is the question
  most libraries answer badly, which is our opening.

Sources: Envato Elements SFX, Mixkit, Soundsnap, StudioBinder's SFX guide, itch.io game
assets (searched 2026-07-11).

## Next candidates (not built)

- `llms.txt` — cheap, low expectation.
- Explicit `User-agent: GPTBot / ClaudeBot / PerplexityBot / OAI-SearchBot / Google-Extended`
  Allow lines in robots.txt (we already allow everything with `*`, so this is cosmetic —
  but it also documents the intent, and makes an accidental future block obvious).
- A comparison page ("TV Music Store vs Epidemic Sound / Artlist") — these get quoted a
  lot by AI engines, but only write it if the comparison is honest and sourced.
- 1200x630 OG images per track for rich link previews.
