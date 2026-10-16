import { bumpCatalogVersion } from "../_cache";
import type { Env } from "../_utils";

// Any successful composer write (uploads, edits of own tracks) bumps
// the catalog version, so the edge-cached /api/tracks and /api/content are
// rebuilt on the next public request (see ../_cache.ts).
interface MwCtx {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
  waitUntil: (p: Promise<unknown>) => void;
}

export const onRequest = async (ctx: MwCtx): Promise<Response> => {
  const res = await ctx.next();
  const m = ctx.request.method;
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && res.status < 400 && ctx.env.DB) {
    ctx.waitUntil(bumpCatalogVersion(ctx.env.DB));
  }
  return res;
};
