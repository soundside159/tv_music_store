import { json, type Ctx } from "./_utils";
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

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const db = ctx.env.DB;
  await ensureSfxTables(db);

  const url = new URL(ctx.request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const cat = url.searchParams.get("cat") ?? "";
  const sub = url.searchParams.get("sub") ?? "";

  const where: string[] = [`s.status = 'published'`];
  const binds: unknown[] = [];
  if (q) {
    where.push(
      `(lower(s.name) LIKE ?${binds.length + 1} OR lower(COALESCE(s.tags, '')) LIKE ?${binds.length + 1})`,
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
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM sfx s ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;

  const rows = await db
    .prepare(
      `SELECT s.id, s.slug, s.code, s.name, s.category_id, s.subcategory_id, s.tags, s.duration,
              s.preview_src, s.created_at, c.display_name AS artist
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
    }>();

  // The shelves + their computed counts (the "1,248 SOUNDS" of the mockup).
  const cats = await db
    .prepare(`SELECT id, title, description, image, sort FROM sfx_categories ORDER BY sort, title`)
    .all<{ id: string; title: string; description: string | null; image: string | null; sort: number }>();
  const subs = await db
    .prepare(`SELECT id, category_id, title FROM sfx_subcategories ORDER BY sort, title`)
    .all<{ id: string; category_id: string; title: string }>();
  const counts = await db
    .prepare(`SELECT category_id, COUNT(*) AS n FROM sfx WHERE status = 'published' GROUP BY category_id`)
    .all<{ category_id: string | null; n: number }>();
  const countBy = new Map(counts.results.map((c) => [c.category_id ?? "", c.n]));
  const libraryRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM sfx WHERE status = 'published'`)
    .first<{ n: number }>();

  return json({
    ok: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    librarySize: libraryRow?.n ?? 0,
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
    })),
    categories: cats.results.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      image: c.image,
      count: countBy.get(c.id) ?? 0,
      subs: subs.results.filter((x) => x.category_id === c.id).map((x) => ({ id: x.id, title: x.title })),
    })),
  });
};
