import { getSessionUser, getVocabularies, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";

// POST /api/admin/suggest-tags — Tracks Edit "AI tagging by prompt" (admin only).
//   { prompt, include: { tags?, collections?, playlists?, categories? } }
// The owner describes a track in his own words (any language). The model reads
// the LIVE vocabularies + collection/playlist/category titles and picks every
// entry where the track could PLAUSIBLY live — generous, human-curator style
// matching (e.g. "energetic electronic positive" -> Sports, Action, Upbeat,
// Energetic…), NOT literal keyword matching. Hallucinated values are filtered
// out server-side, so only real vocab values / real ids reach the client.
// Returns { ok, useCase[], genre[], mood[], collectionIds[], playlistIds[],
// categoryIds[] } — the client pre-ticks the panel checkboxes; nothing is
// saved until the owner presses Apply.

// Bump here if OpenAI retires the model (the error toast will say so).
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a senior curator at a production-music library.
The user describes one music track in their own words (often in Russian or mixed language).
For every list you are given, select EVERY entry where this track could plausibly belong from a music buyer's point of view.
Act like a generous human curator stocking a storefront: rely on associations, mood and typical usage — never on literal word matching.
Example: "energetic electronic positive" plausibly fits Sports, Action, Upbeat, Energetic, Technology and similar entries.
Collections and playlists have descriptive names — put the track everywhere a listener browsing that shelf would be happy to find it.
Only leave an entry out when the track clearly would NOT fit there; prefer including a borderline entry over dropping it.
Never invent entries: every returned string must be copied EXACTLY from the given lists.
Respond with JSON only, using this shape (leave a list empty if you were not given it or nothing fits):
{"useCase": [], "genre": [], "mood": [], "collections": [], "playlists": [], "categories": []}`;

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }
  if (!ctx.env.OPENAI_API_KEY) {
    return json(
      { error: "OPENAI_API_KEY is not set — add it in Pages → Settings → Variables and Secrets" },
      503,
    );
  }

  const body = await readJson<{
    prompt?: string;
    include?: { tags?: boolean; collections?: boolean; playlists?: boolean; categories?: boolean };
  }>(ctx.request);
  const prompt = body?.prompt?.trim().slice(0, 1000);
  if (!prompt) return json({ error: "Describe the track first" }, 400);
  const include = {
    tags: body?.include?.tags !== false,
    collections: !!body?.include?.collections,
    playlists: !!body?.include?.playlists,
    categories: !!body?.include?.categories,
  };
  if (!include.tags && !include.collections && !include.playlists && !include.categories) {
    return json({ error: "Pick at least one section to fill" }, 400);
  }

  const db = ctx.env.DB;
  const vocab = await getVocabularies(db);
  const titled = async (table: "collections" | "playlists" | "categories") => {
    try {
      const rows = await db
        .prepare(`SELECT id, title FROM ${table} ORDER BY sort`)
        .all<{ id: string; title: string }>();
      return rows.results;
    } catch {
      return []; // table not created yet — fine
    }
  };
  const collections = include.collections ? await titled("collections") : [];
  const playlists = include.playlists ? await titled("playlists") : [];
  const categories = include.categories ? await titled("categories") : [];

  const sections: string[] = [`Track description from the user:\n${prompt}`];
  if (include.tags) {
    sections.push(`useCase list:\n${vocab.useCase.join("\n")}`);
    sections.push(`genre list:\n${vocab.genre.join("\n")}`);
    sections.push(`mood list:\n${vocab.mood.join("\n")}`);
  }
  if (collections.length > 0) {
    sections.push(`collections list:\n${collections.map((c) => c.title).join("\n")}`);
  }
  if (playlists.length > 0) {
    sections.push(`playlists list:\n${playlists.map((p) => p.title).join("\n")}`);
  }
  if (categories.length > 0) {
    sections.push(`categories list:\n${categories.map((c) => c.title).join("\n")}`);
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ctx.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: sections.join("\n\n") },
      ],
      response_format: { type: "json_object" },
      max_tokens: 600,
      temperature: 0.4,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return json({ error: data.error?.message ?? `AI request failed (${res.status})` }, 502);
  }
  const content = data.choices?.[0]?.message?.content ?? "";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return json({ error: "The AI returned unreadable output — try again" }, 502);
  }

  // Canonicalize: map answers back to real vocab values / real row ids
  // case-insensitively; anything the model made up is silently dropped.
  const canonValues = (raw: unknown, options: string[]) => {
    const map = new Map(options.map((o) => [o.toLowerCase(), o]));
    const out: string[] = [];
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (typeof v !== "string") continue;
        const hit = map.get(v.trim().toLowerCase());
        if (hit && !out.includes(hit)) out.push(hit);
      }
    }
    return out;
  };
  const canonIds = (raw: unknown, rows: { id: string; title: string }[]) => {
    const byTitle = new Map(rows.map((r) => [r.title.toLowerCase(), r.id]));
    const idSet = new Set(rows.map((r) => r.id));
    const out: string[] = [];
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (typeof v !== "string") continue;
        const key = v.trim();
        const id = idSet.has(key) ? key : byTitle.get(key.toLowerCase());
        if (id && !out.includes(id)) out.push(id);
      }
    }
    return out;
  };

  return json({
    ok: true,
    useCase: include.tags ? canonValues(parsed.useCase, vocab.useCase) : [],
    genre: include.tags ? canonValues(parsed.genre, vocab.genre) : [],
    mood: include.tags ? canonValues(parsed.mood, vocab.mood) : [],
    collectionIds: canonIds(parsed.collections, collections),
    playlistIds: canonIds(parsed.playlists, playlists),
    categoryIds: canonIds(parsed.categories, categories),
  });
};
