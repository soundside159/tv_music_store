import { json, newId, readJson, type Ctx, type D1Database } from "./_utils";

// POST /api/newsletter { email, source? } — opt-in to the marketing list.
// Idempotent; re-subscribes a previously-unsubscribed email. Never reveals
// whether an email already existed.

export const ensureNewsletterTable = async (db: D1Database): Promise<void> => {
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
           id TEXT PRIMARY KEY,
           email TEXT NOT NULL UNIQUE,
           token TEXT NOT NULL,
           source TEXT,
           subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
           unsubscribed_at TEXT
         )`,
      )
      .run();
  } catch {
    // already exists
  }
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const db = ctx.env.DB;
  await ensureNewsletterTable(db);

  const body = await readJson<{ email?: string; source?: string }>(ctx.request);
  const email = body?.email?.trim().toLowerCase();
  const source = (body?.source ?? "site").slice(0, 40);
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const existing = await db
    .prepare(`SELECT id FROM newsletter_subscribers WHERE email = ?1`)
    .bind(email)
    .first<{ id: string }>();

  if (existing) {
    // resubscribe (clear any prior unsubscribe)
    await db
      .prepare(`UPDATE newsletter_subscribers SET unsubscribed_at = NULL WHERE id = ?1`)
      .bind(existing.id)
      .run();
  } else {
    const token = crypto.randomUUID().replace(/-/g, "");
    await db
      .prepare(
        `INSERT INTO newsletter_subscribers (id, email, token, source) VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind(newId("nl"), email, token, source)
      .run();
  }

  return json({ ok: true });
};
