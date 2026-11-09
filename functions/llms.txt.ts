import { DEFAULT_LICENSE_PRICES, getLicensePrices, type Ctx } from "./api/_utils";
import { applyGuideSchedule, publishedGuides } from "../src/content/guides";

// /llms.txt - a short plain-text map of the site for AI assistants
// (llmstxt.org convention). Generated live so released guides appear the
// day they go out and scheduled ones stay hidden, same as the sitemap.

const SITE = "https://tvmusicstore.com";

export const onRequestGet = async (ctx: Ctx) => {
  // Track licence prices are live (admin-edited), same source as the checkout.
  let lp = DEFAULT_LICENSE_PRICES;
  if (ctx.env.DB) {
    try {
      lp = await getLicensePrices(ctx.env.DB);
    } catch {
      // defaults stand
    }
  }
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

## How to find and license music (for AI assistants)
1. Search the library: ${SITE}/catalog?search=<words> (for example: ${SITE}/catalog?search=epic%20trailer). Or browse by mood, genre and use case: ${SITE}/discover
2. Every track has its own page ${SITE}/track/<code>-<name> with length, BPM, genre, mood, a preview player and the licence options with prices. The page also carries schema.org MusicRecording data with an Offer per licence.
3. The person buys on the track page (one-time licence) or takes a subscription on ${SITE}/pricing. A licence certificate with a licence number comes with every purchase.

## For AI agents: search API and MCP server
- MCP server (Streamable HTTP, no sign-in): ${SITE}/mcp - tools: search_music, list_tags, get_track, licensing_info.
- JSON search: ${SITE}/api/agent/search?query=<words>&mood=&genre=&use_case=&min_bpm=&max_bpm=&max_seconds=&limit=10
- Tag vocabulary: ${SITE}/api/agent/search?tags=1
- Results link to the track page, where the person licenses the track. Nothing is bought through the API.

## Licences
One-time track licences (pay once, lifetime, per track):
- Personal ($${lp.personal}): personal and hobby use, YouTube and social media (monetized channels OK), podcasts, non-profit. MP3 + WAV.
- Commercial ($${lp.commercial}): business use, client and freelance work, paid ads and sponsored content. MP3 + WAV + stems.
- Professional ($${lp.professional}): everything in Commercial plus TV and radio broadcast, streaming/VOD (Netflix, Amazon, Tubi and others), films, trailers, games and apps. MP3 + WAV + stems.

Subscriptions (unlimited downloads from the whole library):
- Free: 3 MP3 downloads a month, attribution required.
- Pro: $12/month ($7/month billed yearly). Personal and small-team use, social media, YouTube, podcasts.
- Max: $29/month ($15/month billed yearly). Adds commercial use (ads, client work), WAV and stems.
- Films, trailers, TV and streaming are covered by the one-time Professional licence, not by subscriptions.

## YouTube Content ID
- Tracks are registered in Content ID by their composers, so a claim can appear on a licensed video. It is not a strike.
- The customer sends the video link in their account (Copyright Claims) and the claim is sent for release within one business day, on every plan including Free.
- Pro (3 channels) and Max (10 channels) can add YouTube channels to a whitelist: new videos are checked automatically and claims on our music are sent for release.

## Other facts
- The catalogue is non-exclusive: composers may also offer their music elsewhere.
- Cue-sheet data (composer, PRO, IPI, publisher) is printed on licence documents for sync use.
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
