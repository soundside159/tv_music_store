import type { Ctx } from "./api/_utils";
import { applyGuideSchedule, publishedGuides } from "../src/content/guides";

// /llms.txt - a short plain-text map of the site for AI assistants
// (llmstxt.org convention). Generated live so released guides appear the
// day they go out and scheduled ones stay hidden, same as the sitemap.

const SITE = "https://tvmusicstore.com";

export const onRequestGet = async (ctx: Ctx) => {
  if (ctx.env.DB) {
    try {
      const row = await ctx.env.DB
        .prepare(`SELECT value FROM site_config WHERE key = 'guide_schedule'`)
        .first<{ value: string }>();
      if (row) applyGuideSchedule(JSON.parse(row.value) as Record<string, string>);
    } catch {
      // built-in schedule stands
    }
  }

  const guides = publishedGuides()
    .map((g) => `- [${g.h1}](${SITE}/guides/${g.slug}): ${g.description}`)
    .join("\n");

  const body = `# TV Music Store

> Independent music licensing house in the UK. Original cinematic and production music and sound effects written by its own composers, licensed directly to YouTubers, video editors, agencies, brands and film/TV productions. Not a reseller of third-party stock content.

Key facts:
- Plans: Free; Pro $12/month ($7/month billed yearly); Max $29/month ($15/month billed yearly). Max adds WAV + stems and the commercial license for ads and client work.
- One-time licenses for single tracks (including Standard and Broadcast for film, TV, trailers and games).
- YouTube Content ID: if a licensed video gets a claim, the customer submits the video link in their account and the claim is sent for release, on every plan including Free.
- Cue-sheet data (composer, PRO, IPI, publisher) is printed on license documents for sync use.
- Sound effects: royalty-free WAV, cleared for YouTube and commercial use.

## Main pages
- [Music library](${SITE}/catalog): browse and preview every track
- [Browse by mood, genre and use case](${SITE}/discover)
- [Sound effects](${SITE}/sound-effects)
- [Pricing](${SITE}/pricing)
- [Licensing explained](${SITE}/licensing)
- [License terms](${SITE}/license-terms)
- [Sync licensing for film and TV](${SITE}/sync)
- [Custom music](${SITE}/custom)
- [Contact](${SITE}/contact)

## Guides
${guides}

## Optional
- [Sitemap](${SITE}/sitemap.xml)
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
