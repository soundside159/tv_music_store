import type { D1Database } from "./_utils";

// Shared newsletter helpers. Files starting with "_" are not routed.

export const NEWSLETTER_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
