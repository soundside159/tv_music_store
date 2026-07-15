import { getVocabularies, json, readJson, type Ctx, type D1Database } from "./_utils";
import { bumpUsage } from "./_usage";

// ---------------------------------------------------------------------------
// AI SEARCH (public) — the "describe your project" box on /catalog.
//
// Efficiency model ("router", the way modern catalogs do it): the customer's
// text + a COMPACT digest of the catalog (vocabulary values, playlist titles,
// collection titles — a couple of KB, never track descriptions) go to a small
// fixed model, which answers with structured JSON: which Use Case / Genre /
// Mood values, playlists and collections fit. Filtering tracks by those tags
// then happens in the browser for free. One search ≈ a fraction of a cent.
//
// The model here is FIXED (gpt-4o-mini) — deliberately independent from the
// admin's "AI images: Standard/Premium" switcher, which only affects covers.
//
// Cost guards: identical queries are answered from a D1 cache (no tokens),
// per-IP rate limit of 8 searches/min, query capped at 300 chars.
// ---------------------------------------------------------------------------

const MODEL = "gpt-4o-mini";

const ensureTables = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ai_search_cache (
         hash TEXT PRIMARY KEY,
         query TEXT NOT NULL,
         result TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ai_search_hits (
         ip TEXT NOT NULL,
         ts TEXT NOT NULL
       )`,
    )
    .run();
};

const sha256Hex = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

interface RouteResult {
  useCase: string[];
  genre: string[];
  mood: string[];
  playlistIds: string[];
  collectionIds: string[];
  keywords: string[];
}

export const onRequestPost = async (ctx: Ctx) => {
  const db = ctx.env.DB;
  if (!db) return json({ error: "Search is unavailable right now" }, 503);
  if (!ctx.env.OPENAI_API_KEY) return json({ error: "AI search is not configured" }, 503);

  const body = await readJson<{ q?: string }>(ctx.request);
  const q = (body?.q ?? "").toString().replace(/\s+/g, " ").trim().slice(0, 300);
  if (q.length < 3) return json({ error: "Describe your project in a few words" }, 400);

  await ensureTables(db);

  // Cache first — repeated queries (and the same user retrying) cost nothing.
  const hash = await sha256Hex(q.toLowerCase());
  const cached = await db
    .prepare(`SELECT result FROM ai_search_cache WHERE hash = ?1 AND created_at > datetime('now', '-7 day')`)
    .bind(hash)
    .first<{ result: string }>();
  if (cached) {
    return json({ ...(JSON.parse(cached.result) as RouteResult), cached: true });
  }

  // Per-IP rate limit: 8/min is plenty for a human, useless for a scraper.
  const ip = await sha256Hex(ctx.request.headers.get("cf-connecting-ip") ?? "unknown");
  const recent = await db
    .prepare(`SELECT COUNT(*) AS n FROM ai_search_hits WHERE ip = ?1 AND ts > datetime('now', '-60 seconds')`)
    .bind(ip)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 8) return json({ error: "Too many searches — give it a minute" }, 429);
  await db.prepare(`INSERT INTO ai_search_hits (ip, ts) VALUES (?1, datetime('now'))`).bind(ip).run();
  if (Math.random() < 0.02) {
    await db.prepare(`DELETE FROM ai_search_hits WHERE ts < datetime('now', '-1 hour')`).run();
  }

  // The compact digest: vocabulary + playlist/collection titles. No track data.
  const vocab = await getVocabularies(db);
  const playlists = (
    await db
      .prepare(`SELECT id, title, theme FROM playlists ORDER BY sort`)
      .all<{ id: string; title: string; theme: string | null }>()
  ).results;
  const collections = (
    await db
      .prepare(`SELECT id, title FROM collections ORDER BY sort`)
      .all<{ id: string; title: string }>()
  ).results;

  const digest = [
    `USE_CASE: ${vocab.useCase.join(" | ")}`,
    `GENRE: ${vocab.genre.join(" | ")}`,
    `MOOD: ${vocab.mood.join(" | ")}`,
    `PLAYLISTS: ${playlists.map((p) => `${p.id}=${p.title}${p.theme ? ` (${p.theme})` : ""}`).join(" | ")}`,
    `COLLECTIONS: ${collections.map((c) => `${c.id}=${c.title}`).join(" | ")}`,
  ].join("\n");

  const system =
    "You route search queries for a royalty-free production-music catalog. " +
    "The customer describes their project; you answer ONLY with JSON matching this shape: " +
    '{"use_case":[],"genre":[],"mood":[],"playlists":[],"collections":[],"keywords":[]}. ' +
    "use_case/genre/mood: pick ONLY values that appear in the catalog lists (3-6 moods, 1-4 genres, 1-5 use cases, best fits first). " +
    "playlists/collections: pick the IDs (the part before =) of up to 6 playlists and up to 4 collections that clearly fit; empty arrays when nothing fits. " +
    "keywords: up to 6 short English words/phrases from the query useful for matching track titles and tags. " +
    "Never invent values that are not in the lists.";

  // Counted in Admin -> Usage like every other OpenAI call.
  void bumpUsage(db, "openai", 1, 1);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ctx.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `CATALOG:\n${digest}\n\nPROJECT: ${q}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.2,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) return json({ error: data.error?.message ?? "AI search failed" }, 502);

  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  } catch {
    return json({ error: "AI search failed — try rephrasing" }, 502);
  }

  // Trust nothing: keep only values that really exist in the catalog.
  const asList = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  const canon = (vals: unknown, options: string[], cap: number) => {
    const m = new Map(options.map((o) => [o.trim().toLowerCase(), o]));
    const out: string[] = [];
    for (const v of asList(vals)) {
      const c = m.get(v.trim().toLowerCase());
      if (c && !out.includes(c)) out.push(c);
    }
    return out.slice(0, cap);
  };
  const idsOf = (vals: unknown, rows: { id: string }[], cap: number) => {
    const known = new Set(rows.map((r) => r.id));
    return [...new Set(asList(vals))].filter((id) => known.has(id)).slice(0, cap);
  };

  const result: RouteResult = {
    useCase: canon(raw.use_case, vocab.useCase, 5),
    genre: canon(raw.genre, vocab.genre, 4),
    mood: canon(raw.mood, vocab.mood, 6),
    playlistIds: idsOf(raw.playlists, playlists, 6),
    collectionIds: idsOf(raw.collections, collections, 4),
    keywords: asList(raw.keywords).slice(0, 6),
  };

  await db
    .prepare(
      `INSERT INTO ai_search_cache (hash, query, result, created_at) VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(hash) DO UPDATE SET result = ?3, created_at = datetime('now')`,
    )
    .bind(hash, q, JSON.stringify(result))
    .run();

  return json(result);
};
