import { json, readJson, type Ctx, type D1Database } from "./_utils";
import { bumpUsage } from "./_usage";

// ---------------------------------------------------------------------------
// AI SEARCH for SOUND EFFECTS (public) — same cheap "router" model as the
// music /api/ai-search: the customer's text + a COMPACT digest of the SFX
// vocabulary (category + subcategory titles, a couple of KB — never sound
// descriptions) go to gpt-4o-mini, which returns structured JSON: which
// categories / subcategories fit + a few match keywords. The actual sound
// filtering then happens in /api/sfx (cats + terms params) — one search ≈ a
// fraction of a cent. Identical queries are served from a D1 cache; 8/min/IP.
// ---------------------------------------------------------------------------

const MODEL = "gpt-4o-mini";

const ensureTables = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sfx_ai_cache (
         hash TEXT PRIMARY KEY, query TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL
       )`,
    )
    .run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS sfx_ai_hits (ip TEXT NOT NULL, ts TEXT NOT NULL)`).run();
};

const sha256Hex = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

interface SfxRoute {
  categoryIds: string[];
  subcategoryIds: string[];
  keywords: string[];
}

export const onRequestPost = async (ctx: Ctx) => {
  const db = ctx.env.DB;
  if (!db) return json({ error: "Search is unavailable right now" }, 503);
  if (!ctx.env.OPENAI_API_KEY) return json({ error: "AI search is not configured" }, 503);

  const body = await readJson<{ q?: string }>(ctx.request);
  const q = (body?.q ?? "").toString().replace(/\s+/g, " ").trim().slice(0, 300);
  if (q.length < 3) return json({ error: "Describe the sound in a few words" }, 400);

  await ensureTables(db);

  const hash = await sha256Hex(q.toLowerCase());
  const cached = await db
    .prepare(`SELECT result FROM sfx_ai_cache WHERE hash = ?1 AND created_at > datetime('now', '-7 day')`)
    .bind(hash)
    .first<{ result: string }>();
  if (cached) return json({ ...(JSON.parse(cached.result) as SfxRoute), cached: true });

  const ip = await sha256Hex(ctx.request.headers.get("cf-connecting-ip") ?? "unknown");
  const recent = await db
    .prepare(`SELECT COUNT(*) AS n FROM sfx_ai_hits WHERE ip = ?1 AND ts > datetime('now', '-60 seconds')`)
    .bind(ip)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 8) return json({ error: "Too many searches — give it a minute" }, 429);
  await db.prepare(`INSERT INTO sfx_ai_hits (ip, ts) VALUES (?1, datetime('now'))`).bind(ip).run();
  if (Math.random() < 0.02) {
    await db.prepare(`DELETE FROM sfx_ai_hits WHERE ts < datetime('now', '-1 hour')`).run();
  }

  const cats = (
    await db.prepare(`SELECT id, title FROM sfx_categories ORDER BY sort, title`).all<{ id: string; title: string }>()
  ).results;
  const subs = (
    await db
      .prepare(`SELECT id, title, category_id FROM sfx_subcategories ORDER BY sort, title`)
      .all<{ id: string; title: string; category_id: string }>()
  ).results;

  const digest = [
    `CATEGORIES: ${cats.map((c) => `${c.id}=${c.title}`).join(" | ")}`,
    `SUBCATEGORIES: ${subs.map((s) => `${s.id}=${s.title}`).join(" | ")}`,
  ].join("\n");

  const system =
    "You route search queries for a royalty-free SOUND EFFECTS library. " +
    "The customer describes the sound they need; you answer ONLY with JSON matching: " +
    '{"categories":[],"subcategories":[],"keywords":[]}. ' +
    "categories/subcategories: pick the IDs (the part before =) that best fit — up to 5 categories and up to 8 subcategories, best fits first; empty arrays when nothing fits. " +
    "keywords: up to 8 short English words/phrases from the query useful for matching sound names, tags and descriptions. " +
    "Never invent IDs that are not in the lists.";

  void bumpUsage(db, "openai", 1, 1);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${ctx.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `LIBRARY:\n${digest}\n\nNEEDED SOUND: ${q}` },
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

  const asList = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  const idsOf = (vals: unknown, rows: { id: string }[], cap: number) => {
    const known = new Set(rows.map((r) => r.id));
    return [...new Set(asList(vals))].filter((id) => known.has(id)).slice(0, cap);
  };

  const result: SfxRoute = {
    categoryIds: idsOf(raw.categories, cats, 5),
    subcategoryIds: idsOf(raw.subcategories, subs, 8),
    keywords: asList(raw.keywords).slice(0, 8),
  };

  await db
    .prepare(
      `INSERT INTO sfx_ai_cache (hash, query, result, created_at) VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(hash) DO UPDATE SET result = ?3, created_at = datetime('now')`,
    )
    .bind(hash, q, JSON.stringify(result))
    .run();

  return json(result);
};
