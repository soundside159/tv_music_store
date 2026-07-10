import {
  deleteUserAccount,
  getSessionUser,
  json,
  newId,
  OWNER_EMAIL,
  readJson,
  type Ctx,
  type D1Database,
} from "../_utils";

// Admin-only user management.
// GET  -> latest 200 users with plan info (+ composer pseudonym when one exists).
// PATCH { userId, role?, pseudonym?, removeComposer? }
//   role           — customer | composer | admin (admin/customer is the main switch now)
//   pseudonym      — upserts a `composers` row linked via user_id; being a composer
//                    is a PROFILE FLAG independent of the role (an admin can compose).
//                    The pseudonym is shown as the track artist site-wide.
//   removeComposer — deletes the composer profile (refused while the composer still
//                    has tracks); legacy role 'composer' downgrades to 'customer'.

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return { error: json({ error: "Admin only" }, 403) };
  }
  return { user };
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const rows = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.created_at,
            (SELECT s.plan FROM subscriptions s
              WHERE s.user_id = u.id ORDER BY s.rowid DESC LIMIT 1) AS plan,
            (SELECT COUNT(*) FROM download_log d WHERE d.user_id = u.id) AS downloads,
            (SELECT c.display_name FROM composers c
              WHERE c.user_id = u.id LIMIT 1) AS pseudonym
       FROM users u
      ORDER BY u.created_at DESC
      LIMIT 200`,
  ).all<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    created_at: string;
    plan: string | null;
    downloads: number;
    pseudonym: string | null;
  }>();

  // Sync / cue-sheet info per composer profile (printed on license PDFs).
  let cueByUser = new Map<string, Record<string, string | null>>();
  try {
    await ensureCueColumns(ctx.env.DB);
    const cues = await ctx.env.DB.prepare(
      `SELECT user_id, cue_name, pro, ipi, publisher_name, publisher_pro, publisher_ipi
         FROM composers WHERE user_id IS NOT NULL`,
    ).all<{
      user_id: string;
      cue_name: string | null;
      pro: string | null;
      ipi: string | null;
      publisher_name: string | null;
      publisher_pro: string | null;
      publisher_ipi: string | null;
    }>();
    cueByUser = new Map(
      cues.results.map((c) => [
        c.user_id,
        {
          cueName: c.cue_name,
          pro: c.pro,
          ipi: c.ipi,
          publisherName: c.publisher_name,
          publisherPro: c.publisher_pro,
          publisherIpi: c.publisher_ipi,
        },
      ]),
    );
  } catch {
    // cue columns unavailable — fields just come back empty
  }

  return json({
    users: rows.results.map((u) => ({ ...u, cue: cueByUser.get(u.id) ?? null })),
  });
};

/** Sync / cue-sheet fields on the composer profile (lazy ALTERs). */
const ensureCueColumns = async (db: D1Database) => {
  const alters = [
    `ALTER TABLE composers ADD COLUMN cue_name TEXT`,
    `ALTER TABLE composers ADD COLUMN pro TEXT`,
    `ALTER TABLE composers ADD COLUMN ipi TEXT`,
    `ALTER TABLE composers ADD COLUMN publisher_name TEXT`,
    `ALTER TABLE composers ADD COLUMN publisher_pro TEXT`,
    `ALTER TABLE composers ADD COLUMN publisher_ipi TEXT`,
  ];
  for (const sql of alters) {
    try {
      await db.prepare(sql).run();
    } catch {
      // column exists — fine
    }
  }
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * Creates or renames the composer profile (pseudonym) linked to a user.
 * Pseudonyms are UNIQUE (case-insensitive). If the pseudonym belongs to a
 * DETACHED profile (its user was deleted), the profile — with all its tracks —
 * is re-attached to this user. Returns an error string or null on success.
 */
const upsertComposer = async (
  db: D1Database,
  userId: string,
  pseudonym: string,
): Promise<string | null> => {
  // Who else carries this name?
  const sameName = await db
    .prepare(`SELECT id, user_id FROM composers WHERE lower(display_name) = lower(?1) LIMIT 1`)
    .bind(pseudonym)
    .first<{ id: string; user_id: string | null }>();
  if (sameName && sameName.user_id && sameName.user_id !== userId) {
    return "This pseudonym is already taken by another composer";
  }

  const existing = await db
    .prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
    .bind(userId)
    .first<{ id: string }>();

  // Same name exists but is detached (its user was deleted) — re-attach it so
  // the new user inherits that composer's tracks. If this user already had
  // another profile without tracks, it would just linger; keep it simple and
  // only re-attach when the user has no profile yet.
  if (sameName && !sameName.user_id && !existing) {
    await db.prepare(`UPDATE composers SET user_id = ?2 WHERE id = ?1`).bind(sameName.id, userId).run();
    return null;
  }

  if (existing) {
    await db
      .prepare(`UPDATE composers SET display_name = ?2 WHERE id = ?1`)
      .bind(existing.id, pseudonym)
      .run();
    return null;
  }
  // New composer row — slug must be unique; suffix on collision.
  let slug = slugify(pseudonym) || newId("cmp");
  const taken = await db
    .prepare(`SELECT id FROM composers WHERE slug = ?1`)
    .bind(slug)
    .first();
  if (taken) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
  const id = newId("cmp");
  await db
    .prepare(
      `INSERT INTO composers (id, user_id, slug, display_name, bio, styles)
       VALUES (?1, ?2, ?3, ?4, '', '[]')`,
    )
    .bind(id, userId, slug, pseudonym)
    .run();
  return null;
};

export const onRequestPatch = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const body = await readJson<{
    userId?: string;
    role?: string;
    pseudonym?: string;
    removeComposer?: boolean;
    /** Sync / cue-sheet info for the composer profile (license PDFs). */
    cue?: {
      cueName?: string;
      pro?: string;
      ipi?: string;
      publisherName?: string;
      publisherPro?: string;
      publisherIpi?: string;
    };
  }>(ctx.request);
  const userId = body?.userId;
  const role = body?.role;
  const removeComposer = body?.removeComposer === true;
  const cue = body?.cue;
  const pseudonym = typeof body?.pseudonym === "string" ? body.pseudonym.trim() : undefined;
  if (!userId || (!role && pseudonym === undefined && !removeComposer && !cue)) {
    return json({ error: "userId and role, pseudonym, cue or removeComposer required" }, 400);
  }
  if (role && !["customer", "composer", "admin"].includes(role)) {
    return json({ error: "Invalid role" }, 400);
  }
  if (pseudonym !== undefined && !pseudonym) {
    return json({ error: "Pseudonym cannot be empty" }, 400);
  }

  const target = await ctx.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ email: string }>();
  if (!target) return json({ error: "User not found" }, 404);

  // The owner account always stays admin.
  if (role && target.email === OWNER_EMAIL && role !== "admin") {
    return json({ error: "The owner account must stay admin" }, 400);
  }

  if (role) {
    await ctx.env.DB.prepare(`UPDATE users SET role = ?1 WHERE id = ?2`).bind(role, userId).run();
  }
  if (pseudonym !== undefined) {
    const err = await upsertComposer(ctx.env.DB, userId, pseudonym.slice(0, 60));
    if (err) return json({ error: err }, 400);
  }
  if (cue) {
    await ensureCueColumns(ctx.env.DB);
    const has = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(userId)
      .first();
    if (!has) return json({ error: "Set a composer pseudonym first, then add cue-sheet info" }, 400);
    const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
    await ctx.env.DB.prepare(
      `UPDATE composers
          SET cue_name = ?2, pro = ?3, ipi = ?4,
              publisher_name = ?5, publisher_pro = ?6, publisher_ipi = ?7
        WHERE user_id = ?1`,
    )
      .bind(userId, s(cue.cueName), s(cue.pro), s(cue.ipi), s(cue.publisherName), s(cue.publisherPro), s(cue.publisherIpi))
      .run();
  }
  if (removeComposer) {
    const cmp = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(userId)
      .first<{ id: string }>();
    if (cmp) {
      // Never orphan tracks: the profile can only go when it owns none.
      const n = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM tracks WHERE composer_id = ?1`)
        .bind(cmp.id)
        .first<{ n: number }>();
      if ((n?.n ?? 0) > 0) {
        return json(
          { error: `This composer still has ${n!.n} track(s) — delete or reassign them first` },
          400,
        );
      }
      await ctx.env.DB.prepare(`DELETE FROM composers WHERE id = ?1`).bind(cmp.id).run();
    }
    // Legacy pure-composer role loses its meaning without a profile.
    await ctx.env.DB.prepare(`UPDATE users SET role = 'customer' WHERE id = ?1 AND role = 'composer'`)
      .bind(userId)
      .run();
  }
  return json({ ok: true });
};

// DELETE { userId } — remove a user account. Composer profiles are DETACHED
// (tracks are never touched); the owner and your own account are protected.
export const onRequestDelete = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const body = await readJson<{ userId?: string }>(ctx.request);
  const userId = body?.userId;
  if (!userId) return json({ error: "userId required" }, 400);

  const target = await ctx.env.DB.prepare(`SELECT id, email FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ id: string; email: string }>();
  if (!target) return json({ error: "User not found" }, 404);
  if (target.email === OWNER_EMAIL) {
    return json({ error: "The owner account cannot be deleted" }, 400);
  }
  if (gate.user && target.id === gate.user.id) {
    return json({ error: "You cannot delete the account you are signed in with" }, 400);
  }

  await deleteUserAccount(ctx.env.DB, target.id, target.email);
  return json({ ok: true });
};
