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

## Next candidates (not built)

- `llms.txt` — cheap, low expectation.
- Explicit `User-agent: GPTBot / ClaudeBot / PerplexityBot / OAI-SearchBot / Google-Extended`
  Allow lines in robots.txt (we already allow everything with `*`, so this is cosmetic —
  but it also documents the intent, and makes an accidental future block obvious).
- A comparison page ("TV Music Store vs Epidemic Sound / Artlist") — these get quoted a
  lot by AI engines, but only write it if the comparison is honest and sourced.
- 1200x630 OG images per track for rich link previews.
