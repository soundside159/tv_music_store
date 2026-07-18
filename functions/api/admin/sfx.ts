import { getSessionUser, json, newId, OWNER_EMAIL, readJson, type Ctx, type D1Database } from "../_utils";

// Admin API for the SOUND EFFECTS library (see docs/SFX_PLAN.md).
//
//   GET  /api/admin/sfx?page=&q=&cat=&sub=&status=  -> paged sounds + the category tree
//   POST /api/admin/sfx { action, … }
//        create_sfx        (bulk upload writes one row per file)
//        update_sfx        (name / category / subcategory / tags / status, many ids at once)
//        delete_sfx        (rows + their files in R2)
//        upsert_category | delete_category | upsert_subcategory | delete_subcategory
//
// SFX are deliberately NOT tracks: no BPM, no versions, no stems, no Content ID,
// no per-sound cover (the ART BELONGS TO THE CATEGORY). The library will hold
// tens of thousands of rows, so EVERY list here is paged in the database — the
// browser never holds more than a page.

const PAGE_SIZE = 50;

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return { error: json({ error: "Admin only" }, 403) };
  }
  return { user };
};

export const ensureSfxTables = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sfx_categories (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         description TEXT,
         image TEXT,
         sort INTEGER NOT NULL DEFAULT 0
       )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sfx_subcategories (
         id TEXT PRIMARY KEY,
         category_id TEXT NOT NULL,
         title TEXT NOT NULL,
         sort INTEGER NOT NULL DEFAULT 0
       )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sfx (
         id TEXT PRIMARY KEY,
         slug TEXT,
         code INTEGER,
         name TEXT NOT NULL,
         composer_id TEXT,
         category_id TEXT,
         subcategory_id TEXT,
         tags TEXT,
         duration TEXT,
         preview_src TEXT,
         wav_key TEXT,
         wav_size INTEGER,
         wav_crc INTEGER,
         import_no TEXT,
         status TEXT NOT NULL DEFAULT 'draft',
         moderation_status TEXT NOT NULL DEFAULT 'approved',
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  // Popular flag (landing "Popular Categories" cards with artwork) — added
  // after the table shipped, so self-heal it in.
  try {
    await db.prepare(`ALTER TABLE sfx_categories ADD COLUMN popular INTEGER NOT NULL DEFAULT 0`).run();
  } catch {
    // column already there
  }
  // Search hits name+tags; the listing filters by category and status.
  for (const sql of [
    `CREATE INDEX IF NOT EXISTS idx_sfx_cat ON sfx (category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sfx_sub ON sfx (subcategory_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sfx_status ON sfx (status)`,
    `CREATE INDEX IF NOT EXISTS idx_sfx_name ON sfx (name)`,
  ]) {
    try {
      await db.prepare(sql).run();
    } catch {
      // index exists — fine
    }
  }
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "sound";

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;
  const db = ctx.env.DB;
  await ensureSfxTables(db);

  const url = new URL(ctx.request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const cat = url.searchParams.get("cat") ?? "";
  const sub = url.searchParams.get("sub") ?? "";
  const status = url.searchParams.get("status") ?? ""; // "" = any

  const where: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    where.push(`(lower(name) LIKE ?${binds.length + 1} OR lower(COALESCE(tags, '')) LIKE ?${binds.length + 1})`);
    binds.push(`%${q.toLowerCase()}%`);
  }
  if (cat) {
    where.push(`category_id = ?${binds.length + 1}`);
    binds.push(cat);
  }
  if (sub) {
    where.push(`subcategory_id = ?${binds.length + 1}`);
    binds.push(sub);
  }
  if (status) {
    where.push(`status = ?${binds.length + 1}`);
    binds.push(status);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM sfx ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;

  const rows = await db
    .prepare(
      `SELECT id, slug, code, name, composer_id, category_id, subcategory_id, tags, duration,
              preview_src, wav_size, import_no, status, created_at
         FROM sfx ${whereSql}
        ORDER BY created_at DESC, name ASC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    )
    .bind(...binds)
    .all<{
      id: string;
      slug: string | null;
      code: number | null;
      name: string;
      composer_id: string | null;
      category_id: string | null;
      subcategory_id: string | null;
      tags: string | null;
      duration: string | null;
      preview_src: string | null;
      wav_size: number | null;
      import_no: string | null;
      status: string;
      created_at: string;
    }>();

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
    .prepare(`SELECT id, category_id, title, sort FROM sfx_subcategories ORDER BY sort, title`)
    .all<{ id: string; category_id: string; title: string; sort: number }>();
  // The "1,248 SOUNDS" numbers of the mockup — computed, never typed.
  const counts = await db
    .prepare(`SELECT category_id, COUNT(*) AS n FROM sfx GROUP BY category_id`)
    .all<{ category_id: string | null; n: number }>();
  const countBy = new Map(counts.results.map((c) => [c.category_id ?? "", c.n]));

  const composers = await db
    .prepare(`SELECT id, display_name FROM composers ORDER BY display_name`)
    .all<{ id: string; display_name: string }>();

  return json({
    ok: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    sounds: rows.results.map((r) => ({
      ...r,
      tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
    })),
    categories: cats.results.map((c) => ({
      ...c,
      count: countBy.get(c.id) ?? 0,
      subs: subs.results.filter((s) => s.category_id === c.id),
    })),
    composers: composers.results,
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;
  const db = ctx.env.DB;
  await ensureSfxTables(db);

  const body = await readJson<{
    action?: string;
    id?: string;
    ids?: string[];
    // create_sfx
    name?: string;
    categoryId?: string;
    subcategoryId?: string;
    composerId?: string;
    duration?: string;
    previewSrc?: string;
    wavKey?: string;
    wavSize?: number;
    wavCrc?: number;
    importNo?: string;
    // update_sfx
    fields?: {
      name?: string;
      categoryId?: string;
      subcategoryId?: string;
      composerId?: string;
      tags?: string[];
      status?: string;
      importNo?: string;
    };
    // categories
    title?: string;
    description?: string;
    image?: string;
    popular?: boolean;
    sort?: number;
  }>(ctx.request);
  if (!body?.action) return json({ error: "action required" }, 400);

  switch (body.action) {
    case "create_sfx": {
      const name = (body.name ?? "").trim().slice(0, 120);
      const previewSrc = body.previewSrc ?? "";
      const wavKey = body.wavKey ?? "";
      if (!name) return json({ error: "name required" }, 400);
      if (!/^\/(api\/file\/previews)\//.test(previewSrc)) {
        return json({ error: "an uploaded MP3 preview is required" }, 400);
      }
      if (!/^sfx\//.test(wavKey)) return json({ error: "an uploaded WAV master is required" }, 400);

      const id = newId("sfx");
      const code = 1000 + Math.floor(Math.random() * 9000);
      await db
        .prepare(
          `INSERT INTO sfx (id, slug, code, name, composer_id, category_id, subcategory_id, tags,
                            duration, preview_src, wav_key, wav_size, wav_crc, import_no, status, moderation_status)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'draft', 'approved')`,
        )
        .bind(
          id,
          `${code}-${slugify(name)}`,
          code,
          name,
          body.composerId || null,
          body.categoryId || null,
          body.subcategoryId || null,
          JSON.stringify([]),
          body.duration ?? "",
          previewSrc,
          wavKey,
          Math.round(body.wavSize ?? 0),
          (body.wavCrc ?? 0) >>> 0,
          body.importNo ?? null,
        )
        .run();
      return json({ ok: true, id });
    }

    case "update_sfx": {
      const ids = (body.ids ?? []).filter((x) => typeof x === "string" && x).slice(0, 500);
      if (ids.length === 0) return json({ error: "ids required" }, 400);
      const f = body.fields ?? {};
      const next: Record<string, string | number | null> = {};
      if (typeof f.name === "string" && f.name.trim()) next.name = f.name.trim().slice(0, 120);
      if (typeof f.categoryId === "string") next.category_id = f.categoryId || null;
      if (typeof f.subcategoryId === "string") next.subcategory_id = f.subcategoryId || null;
      if (typeof f.composerId === "string") next.composer_id = f.composerId || null;
      if (Array.isArray(f.tags)) next.tags = JSON.stringify(f.tags.slice(0, 30));
      if (f.status === "draft" || f.status === "published") next.status = f.status;
      if (typeof f.importNo === "string") next.import_no = f.importNo.trim().slice(0, 20) || null;
      const keys = Object.keys(next);
      if (keys.length === 0) return json({ error: "nothing to update" }, 400);

      const setSql = keys.map((k, i) => `${k} = ?${i + 2}`).join(", ");
      for (const id of ids) {
        await db
          .prepare(`UPDATE sfx SET ${setSql} WHERE id = ?1`)
          .bind(id, ...keys.map((k) => next[k]))
          .run();
      }
      return json({ ok: true, updated: ids.length });
    }

    case "delete_sfx": {
      const ids = (body.ids ?? []).filter((x) => typeof x === "string" && x).slice(0, 500);
      if (ids.length === 0) return json({ error: "ids required" }, 400);
      const marks = ids.map((_, i) => `?${i + 1}`).join(", ");
      // The files go with the rows — a deleted sound must not keep paying rent.
      const rows = await db
        .prepare(`SELECT wav_key, preview_src FROM sfx WHERE id IN (${marks})`)
        .bind(...ids)
        .all<{ wav_key: string | null; preview_src: string | null }>();
      await db.prepare(`DELETE FROM sfx WHERE id IN (${marks})`).bind(...ids).run();

      let filesDeleted = 0;
      for (const r of rows.results) {
        const keys = [
          r.wav_key,
          r.preview_src?.replace(/^\/api\/file\//, "") ?? null,
        ].filter((k): k is string => !!k && /^(sfx|previews)\//.test(k));
        for (const k of keys) {
          try {
            await ctx.env.R2?.delete?.(k);
            filesDeleted += 1;
          } catch {
            // already gone — the DB is the source of truth
          }
        }
      }
      return json({ ok: true, deleted: ids.length, filesDeleted });
    }

    case "upsert_category": {
      const title = (body.title ?? "").trim().slice(0, 60);
      if (!title) return json({ error: "title required" }, 400);
      const id = body.id || slugify(title);
      await db
        .prepare(
          `INSERT INTO sfx_categories (id, title, description, image, sort)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(id) DO UPDATE SET title = ?2, description = ?3, image = ?4, sort = ?5`,
        )
        .bind(id, title, body.description ?? "", body.image ?? "", Math.round(body.sort ?? 0))
        .run();
      return json({ ok: true, id });
    }

    case "update_category": {
      // Patch-style: only the fields sent are touched (image / popular /
      // description / title / sort) — upsert_category would wipe the rest.
      const id = body.id;
      if (!id) return json({ error: "id required" }, 400);
      const sets: string[] = [];
      const binds: unknown[] = [];
      if (typeof body.title === "string" && body.title.trim()) {
        sets.push(`title = ?${binds.length + 2}`);
        binds.push(body.title.trim().slice(0, 60));
      }
      if (typeof body.description === "string") {
        sets.push(`description = ?${binds.length + 2}`);
        binds.push(body.description.slice(0, 300));
      }
      if (typeof body.image === "string") {
        sets.push(`image = ?${binds.length + 2}`);
        binds.push(body.image);
      }
      if (typeof body.popular === "boolean") {
        sets.push(`popular = ?${binds.length + 2}`);
        binds.push(body.popular ? 1 : 0);
      }
      if (typeof body.sort === "number") {
        sets.push(`sort = ?${binds.length + 2}`);
        binds.push(Math.round(body.sort));
      }
      if (sets.length === 0) return json({ error: "nothing to update" }, 400);
      await db
        .prepare(`UPDATE sfx_categories SET ${sets.join(", ")} WHERE id = ?1`)
        .bind(id, ...binds)
        .run();
      return json({ ok: true });
    }

    case "delete_category": {
      const id = body.id;
      if (!id) return json({ error: "id required" }, 400);
      // Sounds are never deleted with a category — they just lose their shelf.
      await db.prepare(`UPDATE sfx SET category_id = NULL, subcategory_id = NULL WHERE category_id = ?1`).bind(id).run();
      await db.prepare(`DELETE FROM sfx_subcategories WHERE category_id = ?1`).bind(id).run();
      await db.prepare(`DELETE FROM sfx_categories WHERE id = ?1`).bind(id).run();
      return json({ ok: true });
    }

    case "upsert_subcategory": {
      const title = (body.title ?? "").trim().slice(0, 60);
      const categoryId = body.categoryId ?? "";
      if (!title || !categoryId) return json({ error: "title and categoryId required" }, 400);
      const id = body.id || `${categoryId}-${slugify(title)}`;
      await db
        .prepare(
          `INSERT INTO sfx_subcategories (id, category_id, title, sort)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(id) DO UPDATE SET category_id = ?2, title = ?3, sort = ?4`,
        )
        .bind(id, categoryId, title, Math.round(body.sort ?? 0))
        .run();
      return json({ ok: true, id });
    }

    case "delete_subcategory": {
      const id = body.id;
      if (!id) return json({ error: "id required" }, 400);
      await db.prepare(`UPDATE sfx SET subcategory_id = NULL WHERE subcategory_id = ?1`).bind(id).run();
      await db.prepare(`DELETE FROM sfx_subcategories WHERE id = ?1`).bind(id).run();
      return json({ ok: true });
    }

    default:
      return json({ error: `Unknown action: ${body.action}` }, 400);
  }
};
