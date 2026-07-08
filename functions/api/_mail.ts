import { newId } from "./_utils";

// Shared helpers for the admin mailbox (contact@ conversations).
// Inbound mail is written by a SEPARATE Cloudflare Email Worker (Pages Functions
// can't receive email) into the same D1; this file is the Pages-side reader +
// the recorder used when we send a reply. Tables are created lazily so the
// feature self-heals on first use.

export const ensureMailTables = async (db: D1Database): Promise<void> => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS mail_threads (
         id TEXT PRIMARY KEY,
         email TEXT NOT NULL UNIQUE,
         name TEXT,
         last_message_at TEXT,
         last_snippet TEXT,
         last_direction TEXT,
         unread INTEGER NOT NULL DEFAULT 0,
         archived INTEGER NOT NULL DEFAULT 0,
         priority INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  // priority marks paid-plan support tickets; guarded ALTER for pre-existing tables.
  try {
    await db.prepare(`ALTER TABLE mail_threads ADD COLUMN priority INTEGER NOT NULL DEFAULT 0`).run();
  } catch {
    // column already exists — fine
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_threads_last ON mail_threads(last_message_at)`).run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS mail_messages (
         id TEXT PRIMARY KEY,
         thread_id TEXT NOT NULL,
         direction TEXT NOT NULL,
         from_email TEXT,
         to_email TEXT,
         subject TEXT,
         body TEXT,
         provider_id TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages(thread_id, created_at)`)
    .run();
};

export interface RecordMessageInput {
  email: string; // the external correspondent
  name?: string | null;
  direction: "in" | "out";
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  providerId?: string | null;
  /** Marks the thread as a paid-plan priority support ticket. */
  priority?: boolean;
}

/** Upserts the per-person thread and appends one message. Returns the thread id. */
export const recordMessage = async (db: D1Database, m: RecordMessageInput): Promise<string> => {
  await ensureMailTables(db);
  const email = m.email.trim().toLowerCase();
  const snippet = (m.body ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  const unreadBump = m.direction === "in" ? 1 : 0;

  const existing = await db
    .prepare(`SELECT id FROM mail_threads WHERE email = ?1`)
    .bind(email)
    .first<{ id: string }>();

  const prio = m.priority ? 1 : 0;
  let threadId: string;
  if (existing) {
    threadId = existing.id;
    await db
      .prepare(
        `UPDATE mail_threads
            SET name = COALESCE(?2, name),
                last_message_at = datetime('now'),
                last_snippet = ?3,
                last_direction = ?4,
                unread = unread + ?5,
                priority = MAX(priority, ?6),
                archived = 0
          WHERE id = ?1`,
      )
      .bind(threadId, m.name ?? null, snippet, m.direction, unreadBump, prio)
      .run();
  } else {
    threadId = newId("mth");
    await db
      .prepare(
        `INSERT INTO mail_threads
           (id, email, name, last_message_at, last_snippet, last_direction, unread, priority)
         VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, ?6, ?7)`,
      )
      .bind(threadId, email, m.name ?? null, snippet, m.direction, unreadBump, prio)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO mail_messages
         (id, thread_id, direction, from_email, to_email, subject, body, provider_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      newId("msg"),
      threadId,
      m.direction,
      m.from ?? null,
      m.to ?? null,
      m.subject ?? null,
      m.body ?? null,
      m.providerId ?? null,
    )
    .run();

  return threadId;
};
