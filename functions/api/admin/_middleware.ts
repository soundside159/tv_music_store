import { bumpCatalogVersion } from "../_cache";
import type { Env } from "../_utils";

// Any successful admin write (tracks, playlists, categories, prices, ...) bumps
// the catalog version, so the edge-cached /api/tracks and /api/content are
// rebuilt on the next public request (see ../_cache.ts).
interface MwCtx {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
  waitUntil: (p: Promise<unknown>) => void;
}

// Admin writes that never change the public catalogue (mailbox, finance,
// AI helpers, ...) must not bump the version: every bump makes the next
// visitor in every data centre rebuild tracks/content/SFX/SEO from D1.
const NON_CATALOG =
  /^\/api\/admin\/(mail|campaign|customer|finance|finance-report|sales|analytics|usage|whitelist-handled|whitelist-videos|whitelist-videos-all|suggest-tags|generate-description|generate-cover|fetch-image|waveform|wl-scan)(\/|$)/;

export const onRequest = async (ctx: MwCtx): Promise<Response> => {
  const res = await ctx.next();
  const m = ctx.request.method;
  if (
    m !== "GET" &&
    m !== "HEAD" &&
    m !== "OPTIONS" &&
    res.status < 400 &&
    ctx.env.DB &&
    !NON_CATALOG.test(new URL(ctx.request.url).pathname)
  ) {
    ctx.waitUntil(bumpCatalogVersion(ctx.env.DB));
  }
  return res;
};
