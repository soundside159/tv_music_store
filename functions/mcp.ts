import type { Ctx } from "./api/_utils";
import { getTrack, LICENSING_INFO, listTags, searchMusic, SITE, type SearchArgs } from "./api/agent/_search";

// ---------------------------------------------------------------------------
// MCP SERVER - https://tvmusicstore.com/mcp
//
// Lets AI assistants (Claude, ChatGPT, Cursor and other MCP clients) search the
// catalogue from a chat. Streamable HTTP transport, stateless: every request is
// one JSON-RPC message (or a batch) POSTed here, answered with plain JSON.
// Read-only and public; it never buys anything, it hands back track links.
// ---------------------------------------------------------------------------

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
};

const TOOLS = [
  {
    name: "search_music",
    description:
      "Search TV Music Store's catalogue of cinematic and production music for videos, films, trailers, ads, games and podcasts. " +
      "Returns tracks with a page url (where the person licenses it), an MP3 preview, length, BPM, genre, mood and use case. " +
      "Tip: call list_tags first and use those exact words for mood / genre / use_case.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free words, e.g. 'epic trailer drums' or 'calm travel vlog'" },
        mood: { type: "string", description: "One mood from list_tags" },
        genre: { type: "string", description: "One genre from list_tags" },
        use_case: { type: "string", description: "One use case from list_tags, e.g. Trailer, Vlog" },
        min_bpm: { type: "number" },
        max_bpm: { type: "number" },
        min_seconds: { type: "number", description: "Shortest track length in seconds" },
        max_seconds: { type: "number", description: "Longest track length in seconds" },
        limit: { type: "number", description: "1 to 25, default 10" },
      },
    },
  },
  {
    name: "list_tags",
    description: "The tag vocabulary of the catalogue: every mood, genre and use case a track can have.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_track",
    description: "Full details of one track (by its url or slug) with the one-time licence options and their prices.",
    inputSchema: {
      type: "object",
      properties: { track: { type: "string", description: "Track url like https://tvmusicstore.com/track/1042-name, or its slug" } },
      required: ["track"],
    },
  },
  {
    name: "licensing_info",
    description:
      "How licensing works: one-time licences, subscriptions, what covers films/TV/streaming, YouTube Content ID claims and channel whitelisting.",
    inputSchema: { type: "object", properties: {} },
  },
];

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const handle = async (ctx: Ctx, m: Msg): Promise<Record<string, unknown> | null> => {
  const id = m.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (!m.method) return err(-32600, "Invalid request");
  if (m.method.startsWith("notifications/")) return null; // no answer to a notification

  switch (m.method) {
    case "initialize":
      return ok({
        protocolVersion: String(m.params?.protocolVersion ?? "2025-06-18"),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "tv-music-store", title: "TV Music Store", version: "1.0.0" },
        instructions:
          "Search royalty-free cinematic and production music and send the person to the track page to license it. " +
          `Licensing overview: ${SITE}/pricing. Prices are in USD.`,
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const db = ctx.env.DB;
      if (!db) return err(-32603, "Catalogue unavailable");
      const name = String(m.params?.name ?? "");
      const a = (m.params?.arguments ?? {}) as Record<string, unknown>;
      let data: unknown;
      try {
        if (name === "search_music") data = await searchMusic(db, a as SearchArgs);
        else if (name === "list_tags") data = await listTags(db);
        else if (name === "licensing_info") data = LICENSING_INFO;
        else if (name === "get_track") {
          data = await getTrack(db, String(a.track ?? ""));
          if (!data) return ok({ content: [{ type: "text", text: "No such track." }], isError: true });
        } else return err(-32602, `Unknown tool: ${name}`);
      } catch (e) {
        return ok({ content: [{ type: "text", text: `Search failed: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
      return ok({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }], structuredContent: data });
    }
    default:
      return err(-32601, `Method not found: ${m.method}`);
  }
};

export const onRequestPost = async (ctx: Ctx) => {
  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const msgs = Array.isArray(body) ? (body as Msg[]) : [body as Msg];
  const out = (await Promise.all(msgs.map((m) => handle(ctx, m)))).filter((x): x is Record<string, unknown> => !!x);
  if (out.length === 0) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(body) ? out : out[0], { headers: { ...CORS, "cache-control": "no-store" } });
};

// No server-sent event stream: this server only answers requests.
export const onRequestGet = async () =>
  new Response("TV Music Store MCP server. POST JSON-RPC here (Streamable HTTP). See https://tvmusicstore.com/llms.txt", {
    status: 405,
    headers: { ...CORS, allow: "POST, OPTIONS", "content-type": "text/plain; charset=utf-8" },
  });

export const onRequestOptions = async () => new Response(null, { status: 204, headers: CORS });
