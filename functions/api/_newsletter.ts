import { newId, type D1Database } from "./_utils";

// Shared newsletter helpers. Files starting with "_" are not routed.

export const NEWSLETTER_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Add or re-activate an email on the marketing list. Returns false on bad email. */
export const subscribeEmail = async (
  db: D1Database,
  email: string,
  source = "site",
): Promise<boolean> => {
  const e = email.trim().toLowerCase();
  if (!NEWSLETTER_EMAIL_RE.test(e)) return false;
  await ensureNewsletterTable(db);
  const existing = await db
    .prepare(`SELECT id FROM newsletter_subscribers WHERE email = ?1`)
    .bind(e)
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare(`UPDATE newsletter_subscribers SET unsubscribed_at = NULL WHERE id = ?1`)
      .bind(existing.id)
      .run();
  } else {
    const token = crypto.randomUUID().replace(/-/g, "");
    await db
      .prepare(`INSERT INTO newsletter_subscribers (id, email, token, source) VALUES (?1, ?2, ?3, ?4)`)
      .bind(newId("nl"), e, token, source.slice(0, 40))
      .run();
  }
  return true;
};

/** Mark an email as unsubscribed from marketing. */
export const unsubscribeEmail = async (db: D1Database, email: string): Promise<void> => {
  const e = email.trim().toLowerCase();
  await ensureNewsletterTable(db);
  await db
    .prepare(`UPDATE newsletter_subscribers SET unsubscribed_at = datetime('now') WHERE email = ?1`)
    .bind(e)
    .run();
};

/** True if the email is on the marketing list and not unsubscribed. */
export const isSubscribed = async (db: D1Database, email: string): Promise<boolean> => {
  const e = email.trim().toLowerCase();
  await ensureNewsletterTable(db);
  const row = await db
    .prepare(`SELECT unsubscribed_at FROM newsletter_subscribers WHERE email = ?1`)
    .bind(e)
    .first<{ unsubscribed_at: string | null }>();
  return !!row && !row.unsubscribed_at;
};

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
