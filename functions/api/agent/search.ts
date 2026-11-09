import { json, type Ctx } from "../_utils";
import { listTags, searchMusic, type SearchArgs } from "./_search";

// GET /api/agent/search?query=&mood=&genre=&use_case=&min_bpm=&max_bpm=&min_seconds=&max_seconds=&limit=
// GET /api/agent/search?tags=1   -> the tag vocabulary (mood / genre / use_case)
// Public, read-only, for AI agents and scripts. See /llms.txt.
export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const q = new URL(ctx.request.url).searchParams;
  const cors = { "access-control-allow-origin": "*" };
  if (q.get("tags") === "1") return json(await listTags(ctx.env.DB), 200, cors);
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const args: SearchArgs = {
    query: (q.get("query") ?? q.get("q") ?? "").slice(0, 200),
    mood: q.get("mood") ?? undefined,
    genre: q.get("genre") ?? undefined,
    use_case: q.get("use_case") ?? undefined,
    min_bpm: num("min_bpm"),
    max_bpm: num("max_bpm"),
    min_seconds: num("min_seconds"),
    max_seconds: num("max_seconds"),
    limit: num("limit"),
  };
  return json(await searchMusic(ctx.env.DB, args), 200, cors);
};
