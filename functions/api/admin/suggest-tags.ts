import { getSessionUser, getVocabularies, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";

// POST /api/admin/suggest-tags — Tracks Edit "AI tagging by prompt" (admin only).
//
//   single track : { prompt, trackTitle?, include }           -> { ok, useCase[], … }
//   many tracks  : { tracks: [{id, title, prompt}], include } -> { ok, results: [{ id, … }] }
//
// The owner describes a track in his own words (any language). The model reads
// the LIVE vocabularies + collection/playlist/category titles and picks every
// entry where the track could PLAUSIBLY live — generous, human-curator style
// matching, NOT literal keyword matching. Hallucinated values are filtered out
// server-side, so only real vocab values / real row ids reach the client.
//
// Efficiency (owner: don't re-read the context for every track):
//   • vocabularies, collections, playlists, categories and the tags base are
//     read from D1 ONCE per request, whatever the number of tracks;
//   • the tracks then go through the model in PARALLEL (bounded pool) — the old
//     client loop paid a full round trip per track, one after the other;
//   • PLAYLISTS get their own focused call per track, grouped by theme. In one
//     giant "do everything" answer the model kept filling the first theme and
//     ignoring the rest (owner saw only Video & Social ticked). Its own call,
//     with a theme-by-theme instruction, fixes that — and it flies alongside the
//     main call, so it costs no extra wall-clock time.

// Bump here if OpenAI retires the model (the error toast will say so).
const MODEL = "gpt-4o-mini";
/** Tracks processed at once (each track = up to 2 model calls, run together). */
const CONCURRENCY = 3;

const SYSTEM_PROMPT = `You are a senior curator at a production-music library.
The user describes one music track in their own words (often in Russian or mixed language).
For every list you are given, select EVERY entry where this track could plausibly belong from a music buyer's point of view.
Act like a generous human curator stocking a storefront: rely on associations, mood and typical usage — never on literal word matching.
Example: "energetic electronic positive" plausibly fits Sports, Action, Upbeat, Energetic, Technology and similar entries.
Collections have descriptive names — put the track everywhere a listener browsing that shelf would be happy to find it.
The user may reuse one description for several different tracks. Do NOT return a carbon-copy answer each time: the strongest picks may repeat, but vary the borderline picks with your own curatorial taste — treat the track title as your differentiator, like a human editor who never files ten tracks identically.
Only leave an entry out when the track clearly would NOT fit there; prefer including a borderline entry over dropping it.
IMPORTANT: you may be given SEVERAL lists at once. Work through EVERY list you were given, one by one, independently and with the same care and generosity — never skip a list, never leave one empty just because you already answered the others. Given the generosity rule, an empty answer for a provided list should be rare.
For the extraTags list (search keywords): return BETWEEN 30 AND 50 tags, ordered by relevance — the best-fitting first, then progressively looser but still plausible associations. Returning fewer than 30 is allowed ONLY when the given list itself has fewer than 30 entries (then return them all, best first).
Never invent entries: every returned string must be copied EXACTLY from the given lists.
Respond with JSON only, using this shape (a key may be empty ONLY if that list was not given, or truly nothing fits):
{"useCase": [], "genre": [], "mood": [], "collections": [], "categories": [], "extraTags": []}`;

// Playlists are shelved by THEME on the /playlists page ("Video & Social",
// "Business & Product", "Gaming & Streaming"…). The model must walk the themes
// one at a time — otherwise it stops after the theme that fits best and the
// rest come back empty.
const PLAYLIST_SYSTEM_PROMPT = `You are a senior curator at a production-music library, filing ONE track into playlists.
The playlists are grouped under THEMES (the sections of the site's playlists page). You will get them theme by theme.
Go through EVERY theme in order and, inside each theme, judge EVERY playlist on its own.
A theme that looks unrelated at first glance still gets judged playlist by playlist: a happy acoustic track can carry a corporate "Explainer & Education", a "Real Estate Video" or a "Family Moments" playlist just as naturally as an obvious "Daily Vlog".
Ask yourself for each playlist: "would an editor building this shelf be happy to find this track on it, and would a buyer browsing it press play?" If yes — include it.
Be generous: include borderline fits, exclude only what would clearly jar (a bright acoustic track does NOT belong in "Dark Thriller" or "Epic Trailer").
Do not stop after the first theme that fits well, and do not leave a theme empty just because another theme fits better — every theme is judged on its own merit.
The user may reuse one description across several tracks: keep the strong picks, but vary the borderline ones — use the track title as your differentiator.
Return the FULL "Theme — Playlist" string, copied EXACTLY as given. Never invent one.
Respond with JSON only: {"playlists": ["Theme — Playlist", ...]}`;

interface TitledRow {
  id: string;
  title: string;
}

interface TrackAsk {
  id: string;
  title: string;
  prompt: string;
}

interface AiPicks {
  useCase: string[];
  genre: string[];
  mood: string[];
  collectionIds: string[];
  playlistIds: string[];
  categoryIds: string[];
  extraTags: string[];
}

/** Runs `job` over `items` with at most `limit` in flight at a time. */
const pool = async <T, R>(items: T[], limit: number, job: (item: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await job(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }
  const apiKey = ctx.env.OPENAI_API_KEY;
  if (!apiKey) {
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
    /** Batch mode: one entry per selected track (each with its own prompt). */
    tracks?: { id?: string; title?: string; prompt?: string }[];
    include?: {
      tags?: boolean;
      collections?: boolean;
      playlists?: boolean;
      categories?: boolean;
      extraTags?: boolean;
    };
  }>(ctx.request);

  const batchMode = Array.isArray(body?.tracks);
  const asks: TrackAsk[] = batchMode
    ? (body?.tracks ?? [])
        .map((t) => ({
          id: String(t?.id ?? ""),
          title: (t?.title ?? "").trim().slice(0, 120),
          prompt: (t?.prompt ?? "").trim().slice(0, 1000),
        }))
        .filter((t) => t.id && t.prompt)
        .slice(0, 60)
    : [
        {
          id: "single",
          title: (body?.trackTitle ?? "").trim().slice(0, 120),
          prompt: (body?.prompt ?? "").trim().slice(0, 1000),
        },
      ].filter((t) => t.prompt);
  if (asks.length === 0) return json({ error: "Describe the track first" }, 400);

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

  // ---- Context: read ONCE, reused for every track in the batch --------------
  const db = ctx.env.DB;
  const vocab = await getVocabularies(db);
  const titled = async (table: "collections" | "categories"): Promise<TitledRow[]> => {
    try {
      const rows = await db.prepare(`SELECT id, title FROM ${table} ORDER BY sort`).all<TitledRow>();
      return rows.results;
    } catch {
      return []; // table not created yet — fine
    }
  };
  const collections = include.collections ? await titled("collections") : [];
  const categories = include.categories ? await titled("categories") : [];

  // Playlists keep their THEME so the model can walk the shelves one by one.
  let playlists: { id: string; title: string; theme: string }[] = [];
  if (include.playlists) {
    try {
      const rows = await db
        .prepare(`SELECT id, title, theme FROM playlists ORDER BY sort`)
        .all<{ id: string; title: string; theme: string | null }>();
      playlists = rows.results.map((p) => ({
        id: p.id,
        title: p.theme?.trim() ? `${p.theme.trim()} — ${p.title}` : p.title,
        theme: p.theme?.trim() || "Other",
      }));
    } catch {
      try {
        const rows = await db
          .prepare(`SELECT id, title FROM playlists ORDER BY sort`)
          .all<{ id: string; title: string }>();
        playlists = rows.results.map((p) => ({ id: p.id, title: p.title, theme: "Other" }));
      } catch {
        playlists = [];
      }
    }
  }
  /** "Theme:\n- Theme — Playlist\n…" — the shape the playlist call reads. */
  const playlistsByTheme = (() => {
    const themes = new Map<string, string[]>();
    for (const p of playlists) {
      const list = themes.get(p.theme) ?? [];
      list.push(p.title);
      themes.set(p.theme, list);
    }
    return [...themes.entries()]
      .map(([theme, titles]) => `${theme}:\n${titles.map((t) => `- ${t}`).join("\n")}`)
      .join("\n\n");
  })();

  // Owner-curated global Extra-tags base (Tags Base dialog in Tracks Edit).
  let tagsBase: string[] = [];
  if (include.extraTags) {
    try {
      const row = await db
        .prepare(`SELECT value FROM site_config WHERE key = 'extra_tags_base'`)
        .first<{ value: string }>();
      if (row) {
        tagsBase = (JSON.parse(row.value) as unknown[]).filter((x): x is string => typeof x === "string");
      }
    } catch {
      // none saved yet
    }
    if (
      tagsBase.length === 0 &&
      !include.tags &&
      !include.collections &&
      !include.playlists &&
      !include.categories
    ) {
      return json({ error: "Tags Base is empty — add tags via the Tags Base button first" }, 400);
    }
  }

  // ---- Model plumbing -------------------------------------------------------
  const chat = async (
    system: string,
    userMsg: string,
    maxTokens: number,
  ): Promise<Record<string, unknown>> => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        // Some warmth on purpose: reused descriptions should yield VARIED
        // borderline picks (human-curator feel), not carbon copies.
        temperature: 0.75,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(data.error?.message ?? `AI request failed (${res.status})`);
    // A length-cut answer is truncated JSON — fail loudly instead of applying
    // half a result (this is how "playlists came back empty" bugs hide).
    if (data.choices?.[0]?.finish_reason === "length") {
      throw new Error("The AI answer was cut off — press the button again");
    }
    try {
      return JSON.parse(data.choices?.[0]?.message?.content ?? "") as Record<string, unknown>;
    } catch {
      throw new Error("The AI returned unreadable output — try again");
    }
  };

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

  const wantsMain =
    include.tags || collections.length > 0 || categories.length > 0 || tagsBase.length > 0;

  const pickFor = async (ask: TrackAsk): Promise<AiPicks & { id: string; error?: string }> => {
    const head = [`Track description from the user:\n${ask.prompt}`];
    if (ask.title) {
      head.push(`Track title (your differentiator when the description repeats):\n${ask.title}`);
    }

    const mainCall = async (): Promise<Record<string, unknown>> => {
      if (!wantsMain) return {};
      const sections = [...head];
      if (include.tags) {
        sections.push(`useCase list:\n${vocab.useCase.join("\n")}`);
        sections.push(`genre list:\n${vocab.genre.join("\n")}`);
        sections.push(`mood list:\n${vocab.mood.join("\n")}`);
      }
      if (collections.length > 0) {
        sections.push(`collections list:\n${collections.map((c) => c.title).join("\n")}`);
      }
      if (categories.length > 0) {
        sections.push(`categories list:\n${categories.map((c) => c.title).join("\n")}`);
      }
      if (tagsBase.length > 0) {
        sections.push(`extraTags list (search keywords):\n${tagsBase.join("\n")}`);
      }
      return chat(SYSTEM_PROMPT, sections.join("\n\n"), 3000);
    };
    const playlistCall = async (): Promise<Record<string, unknown>> => {
      if (playlists.length === 0) return {};
      const msg = [
        ...head,
        `Playlists, grouped by theme — judge every theme:\n\n${playlistsByTheme}`,
      ].join("\n\n");
      return chat(PLAYLIST_SYSTEM_PROMPT, msg, 2000);
    };

    try {
      // Both calls fly at the same time — the playlist pass is free wall-clock.
      const [main, pl] = await Promise.all([mainCall(), playlistCall()]);
      return {
        id: ask.id,
        useCase: include.tags ? canonValues(main.useCase, vocab.useCase) : [],
        genre: include.tags ? canonValues(main.genre, vocab.genre) : [],
        mood: include.tags ? canonValues(main.mood, vocab.mood) : [],
        collectionIds: canonIds(main.collections, collections),
        categoryIds: canonIds(main.categories, categories),
        playlistIds: canonIds(pl.playlists, playlists),
        // A track carries at most 50 tags — trim here so the client merges as-is.
        extraTags: canonValues(main.extraTags, tagsBase).slice(0, 50),
      };
    } catch (e) {
      return {
        id: ask.id,
        useCase: [],
        genre: [],
        mood: [],
        collectionIds: [],
        playlistIds: [],
        categoryIds: [],
        extraTags: [],
        error: e instanceof Error ? e.message : "AI failed",
      };
    }
  };

  const results = await pool(asks, CONCURRENCY, pickFor);

  // Batch mode: one row per track. Single mode: the old flat shape, unchanged,
  // so the existing single-track panel keeps working.
  if (batchMode) return json({ ok: true, results });

  const r = results[0];
  if (r.error) return json({ error: r.error }, 502);
  return json({
    ok: true,
    useCase: r.useCase,
    genre: r.genre,
    mood: r.mood,
    collectionIds: r.collectionIds,
    playlistIds: r.playlistIds,
    categoryIds: r.categoryIds,
    extraTags: r.extraTags,
  });
};
