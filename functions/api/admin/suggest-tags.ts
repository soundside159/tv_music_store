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
Playlists may be shown as "Theme — Playlist" (their section on the site): weigh BOTH parts — the theme tells you the shelf, the playlist name tells you the exact mood/purpose. Return the full "Theme — Playlist" string exactly as given.
The user may reuse one description for several different tracks. Do NOT return a carbon-copy answer each time: the strongest picks may repeat, but vary the borderline picks with your own curatorial taste — treat the track title as your differentiator, like a human editor who never files ten tracks identically.
Only leave an entry out when the track clearly would NOT fit there; prefer including a borderline entry over dropping it.
IMPORTANT: you may be given SEVERAL lists at once. Work through EVERY list you were given, one by one, independently and with the same care and generosity — never skip a list, never leave one empty just because you already answered the others. Given the generosity rule, an empty answer for a provided list should be rare.
For the extraTags list (search keywords): return BETWEEN 30 AND 50 tags, ordered by relevance — the best-fitting first, then progressively looser but still plausible associations. Returning fewer than 30 is allowed ONLY when the given list itself has fewer than 30 entries (then return them all, best first).
Never invent entries: every returned string must be copied EXACTLY from the given lists.
Respond with JSON only, using this shape (a key may be empty ONLY if that list was not given, or truly nothing fits):
{"useCase": [], "genre": [], "mood": [], "collections": [], "playlists": [], "categories": [], "extraTags": []}`;

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
    /** The selected track's title — variation salt when one description is
     *  reused across many tracks (the model varies borderline picks by it). */
    trackTitle?: string;
    include?: {
      tags?: boolean;
      collections?: boolean;
      playlists?: boolean;
      categories?: boolean;
      extraTags?: boolean;
    };
  }>(ctx.request);
  const prompt = body?.prompt?.trim().slice(0, 1000);
  if (!prompt) return json({ error: "Describe the track first" }, 400);
  const include = {
    tags: body?.include?.tags !== false,
    collections: !!body?.include?.collections,
    playlists: !!body?.include?.playlists,
    categories: !!body?.include?.categories,
    extraTags: !!body?.include?.extraTags,
  };
  if (
    !include.tags &&
    !include.collections &&
    !include.playlists &&
    !include.categories &&
    !include.extraTags
  ) {
    return json({ error: "Pick at least one section to fill" }, 400);
  }

  const db = ctx.env.DB;
  const vocab = await getVocabularies(db);
  const titled = async (table: "collections" | "categories") => {
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
  const categories = include.categories ? await titled("categories") : [];
  // Playlists carry their THEME (the /playlists page section) — the model sees
  // "Theme — Playlist" labels so the subtheme weighs into the choice.
  let playlists: { id: string; title: string }[] = [];
  if (include.playlists) {
    try {
      const rows = await db
        .prepare(`SELECT id, title, theme FROM playlists ORDER BY sort`)
        .all<{ id: string; title: string; theme: string | null }>();
      playlists = rows.results.map((p) => ({
        id: p.id,
        title: p.theme?.trim() ? `${p.theme.trim()} — ${p.title}` : p.title,
      }));
    } catch {
      // legacy DB without the theme column — plain titles
      try {
        const rows = await db
          .prepare(`SELECT id, title FROM playlists ORDER BY sort`)
          .all<{ id: string; title: string }>();
        playlists = rows.results;
      } catch {
        playlists = [];
      }
    }
  }
  // Owner-curated global Extra-tags base (Tags Base dialog in Tracks Edit).
  let tagsBase: string[] = [];
  if (include.extraTags) {
    try {
      const row = await db
        .prepare(`SELECT value FROM site_config WHERE key = 'extra_tags_base'`)
        .first<{ value: string }>();
      if (row) tagsBase = (JSON.parse(row.value) as unknown[]).filter((x): x is string => typeof x === "string");
    } catch {
      // none saved yet
    }
    if (tagsBase.length === 0 && !include.tags && !include.collections && !include.playlists && !include.categories) {
      return json({ error: "Tags Base is empty — add tags via the Tags Base button first" }, 400);
    }
  }

  const sections: string[] = [`Track description from the user:\n${prompt}`];
  const trackTitle = (body?.trackTitle ?? "").trim().slice(0, 120);
  if (trackTitle) {
    sections.push(`Track title (your differentiator when the description repeats):\n${trackTitle}`);
  }
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
  if (tagsBase.length > 0) {
    sections.push(`extraTags list (search keywords):\n${tagsBase.join("\n")}`);
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
      // Generous output budget: with ALL sections on (facets + collections +
      // playlists + categories + 30-50 extra tags) the JSON answer is long —
      // a tight cap made the model skimp on the later lists (owner saw
      // collections come back empty when everything was ticked at once).
      max_tokens: 3000,
      // Some warmth on purpose: reused descriptions should yield VARIED
      // borderline picks (human-curator feel), not carbon copies. Hallucinated
      // strings are filtered server-side anyway.
      temperature: 0.75,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return json({ error: data.error?.message ?? `AI request failed (${res.status})` }, 502);
  }
  // A length-cut answer is truncated JSON — fail loudly instead of applying
  // a half-result (this is how "collections came back empty" bugs hide).
  if (data.choices?.[0]?.finish_reason === "length") {
    return json({ error: "The AI answer was cut off — press the button again" }, 502);
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
    // A track carries at most 50 tags — trim here so the client can merge as-is.
    extraTags: canonValues(parsed.extraTags, tagsBase).slice(0, 50),
  });
};
