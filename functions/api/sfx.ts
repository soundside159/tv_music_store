import { json, type Ctx } from "./_utils";
import { cachedJson, cachedValue } from "./_cache";
import { ensureSfxTables } from "./admin/sfx";

// PUBLIC sound-effects API (see docs/SFX_PLAN.md).
//
//   GET /api/sfx?q=&cat=&sub=&page=   -> { sounds, page, pages, total, categories }
//
// PAGED IN THE DATABASE, 50 rows at a time. The music catalogue ships in one
// response and filters in the browser — fine for a few hundred tracks, hopeless
// for 20 000 sounds (megabytes before the page can draw, and a 20k array
// filtered on every keystroke). So the DB does the searching here, always.
//
// Only PUBLISHED sounds are ever returned. `wav_key` never leaves the server:
// the master is downloaded through /api/sfx-download, which checks the plan.

const PAGE_SIZE = 50;

// D1 READ BUDGET (2026-11-03 outage): every call used to COUNT the whole 13k
// library twice and scan it for the page — ~30k rows per request, 3M+/day once
// Google crawled the SFX pages. Now the whole answer is edge-cached per query
// (keyed by catalog version, like /api/tracks) and the shelf counts are cached
// on their own, so a cache miss on a new search doesn't recount the library.
export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const url = new URL(ctx.request.url);
  const sp = [...url.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const name = "sfx-" + encodeURIComponent(new URLSearchParams(sp).toString());
  return cachedJson(ctx, name, () => buildSfx(ctx));
};

const buildSfx = async (ctx: Ctx) => {
  const db = ctx.env.DB;
  await ensureSfxTables(db);

  const url = new URL(ctx.request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const cat = url.searchParams.get("cat") ?? "";
  const sub = url.searchParams.get("sub") ?? "";
  // ?artist=<composer slug> — the composer's sounds for their /artist page.
  const artist = (url.searchParams.get("artist") ?? "").trim().slice(0, 80);

  const where: string[] = [`s.status = 'published'`];
  const binds: unknown[] = [];
  if (artist) {
    // Resolve the slug first so the filter hits the sfx(composer_id) index
    // instead of joining + scanning the whole library.
    const comp = await db
      .prepare(`SELECT id FROM composers WHERE slug = ?1 LIMIT 1`)
      .bind(artist)
      .first<{ id: string }>();
    where.push(`s.composer_id = ?${binds.length + 1}`);
    binds.push(comp?.id ?? "__none__");
  }
  if (q) {
    // Search matches the name, the tags AND the description (owner's decision:
    // the pack description feeds SFX search, not just the tags).
    where.push(
      `(lower(s.name) LIKE ?${binds.length + 1} OR lower(COALESCE(s.tags, '')) LIKE ?${binds.length + 1}` +
        ` OR lower(COALESCE(s.description, '')) LIKE ?${binds.length + 1})`,
    );
    binds.push(`%${q.toLowerCase()}%`);
  }
  if (cat) {
    where.push(`s.category_id = ?${binds.length + 1}`);
    binds.push(cat);
  }
  if (sub) {
    where.push(`s.subcategory_id = ?${binds.length + 1}`);
    binds.push(sub);
  }

  // AI SEARCH mode: /api/sfx-ai-search routes the query to category ids + keywords;
  // here we match ANY of them (across the whole library), so a described need
  // pulls sounds from several shelves at once. cat/sub/q filters don't apply.
  const csv = (k: string, cap: number) =>
    (url.searchParams.get(k) ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, cap);
  const aiCats = csv("cats", 5);
  const aiSubs = csv("subs", 8);
  const aiTerms = csv("terms", 8).map((t) => t.toLowerCase().slice(0, 40));
  if (aiCats.length || aiSubs.length || aiTerms.length) {
    const ors: string[] = [];
    if (aiCats.length) {
      const ph = aiCats.map((c) => {
        binds.push(c);
        return `?${binds.length}`;
      });
      ors.push(`s.category_id IN (${ph.join(",")})`);
    }
    if (aiSubs.length) {
      const ph = aiSubs.map((c) => {
        binds.push(c);
        return `?${binds.length}`;
      });
      ors.push(`s.subcategory_id IN (${ph.join(",")})`);
    }
    for (const t of aiTerms) {
      binds.push(`%${t}%`);
      const p = binds.length;
      ors.push(
        `(lower(s.name) LIKE ?${p} OR lower(COALESCE(s.tags,'')) LIKE ?${p} OR lower(COALESCE(s.description,'')) LIKE ?${p})`,
      );
    }
    where.push(`(${ors.join(" OR ")})`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM sfx s ${whereSql}`,
    )
    .bind(...binds)
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;

  const rows = await db
    .prepare(
      `SELECT s.id, s.slug, s.code, s.name, s.category_id, s.subcategory_id, s.tags, s.duration,
              s.preview_src, s.created_at, c.display_name AS artist, c.slug AS artist_slug
         FROM sfx s
         LEFT JOIN composers c ON c.id = s.composer_id
         ${whereSql}
        ORDER BY s.created_at DESC, s.name ASC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    )
    .bind(...binds)
    .all<{
      id: string;
      slug: string | null;
      code: number | null;
      name: string;
      category_id: string | null;
      subcategory_id: string | null;
      tags: string | null;
      duration: string | null;
      preview_src: string | null;
      created_at: string;
      artist: string | null;
      artist_slug: string | null;
    }>();

  // The shelves + their computed counts (the "1,248 SOUNDS" of the mockup) —
  // identical for every query, so cached once per catalog version.
  const meta = await cachedValue(ctx, "sfx-meta", async () => {
    const cats = await db
      .prepare(`SELECT id, title, description, image, popular, sort FROM sfx_categories ORDER BY sort, title`)
      .all<{
        id: string;
        title: string;
        description: string | null;
        image: string | null;
        popular: number;
        sort: number;
      }>();
    const subs = await db
      .prepare(`SELECT id, category_id, title FROM sfx_subcategories ORDER BY sort, title`)
      .all<{ id: string; category_id: string; title: string }>();
    const counts = await db
      .prepare(`SELECT category_id, COUNT(*) AS n FROM sfx WHERE status = 'published' GROUP BY category_id`)
      .all<{ category_id: string | null; n: number }>();
    return { cats: cats.results, subs: subs.results, counts: counts.results };
  });
  const countBy = new Map(meta.counts.map((c) => [c.category_id ?? "", c.n]));
  const library = meta.counts.reduce((a, c) => a + c.n, 0);

  return json({
    ok: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    librarySize: library,
    sounds: rows.results.map((r) => ({
      id: r.id,
      slug: r.slug,
      code: r.code,
      name: r.name,
      categoryId: r.category_id,
      subcategoryId: r.subcategory_id,
      tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
      duration: r.duration ?? "",
      previewSrc: r.preview_src ?? "",
      artist: r.artist,
      artistSlug: r.artist_slug,
    })),
    categories: meta.cats.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      image: c.image,
      popular: c.popular === 1,
      count: countBy.get(c.id) ?? 0,
      subs: meta.subs.filter((x) => x.category_id === c.id).map((x) => ({ id: x.id, title: x.title })),
    })),
  });
};
