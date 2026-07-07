import PostalMime from "postal-mime";

// Cloudflare EMAIL WORKER — receives inbound mail for contact@tvmusicstore.com
// (Pages Functions can't receive email) and writes it into the SAME D1 database
// the site uses, so /admin -> Inbox can show it. Optionally forwards a copy to a
// backup address. Deploy separately: `cd mail-worker && npm i && npx wrangler deploy`.
// Then in Cloudflare Email Routing, route contact@ to this worker.

interface Env {
  DB: D1Database;
  FORWARD_TO?: string; // optional backup address (must be a verified Email Routing destination)
}

interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream;
  forward(rcptTo: string): Promise<void>;
}

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const ensureTables = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS mail_threads (
         id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT,
         last_message_at TEXT, last_snippet TEXT, last_direction TEXT,
         unread INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_threads_last ON mail_threads(last_message_at)`).run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS mail_messages (
         id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, direction TEXT NOT NULL,
         from_email TEXT, to_email TEXT, subject TEXT, body TEXT, provider_id TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages(thread_id, created_at)`)
    .run();
};

const recordInbound = async (
  db: D1Database,
  m: { email: string; name: string | null; from: string; to: string; subject: string; body: string; providerId: string | null },
) => {
  const email = m.email.trim().toLowerCase();
  const snippet = m.body.replace(/\s+/g, " ").trim().slice(0, 160);

  const existing = await db.prepare(`SELECT id FROM mail_threads WHERE email = ?1`).bind(email).first<{ id: string }>();
  let threadId: string;
  if (existing) {
    threadId = existing.id;
    await db
      .prepare(
        `UPDATE mail_threads SET name = COALESCE(?2, name), last_message_at = datetime('now'),
            last_snippet = ?3, last_direction = 'in', unread = unread + 1, archived = 0 WHERE id = ?1`,
      )
      .bind(threadId, m.name, snippet)
      .run();
  } else {
    threadId = newId("mth");
    await db
      .prepare(
        `INSERT INTO mail_threads (id, email, name, last_message_at, last_snippet, last_direction, unread)
         VALUES (?1, ?2, ?3, datetime('now'), ?4, 'in', 1)`,
      )
      .bind(threadId, email, m.name, snippet)
      .run();
  }
  await db
    .prepare(
      `INSERT INTO mail_messages (id, thread_id, direction, from_email, to_email, subject, body, provider_id)
       VALUES (?1, ?2, 'in', ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(newId("msg"), threadId, m.from, m.to, m.subject, m.body, m.providerId)
    .run();
};

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);

    const from = (message.from || parsed.from?.address || "").toLowerCase();
    const name = parsed.from?.name || null;
    const subject = parsed.subject || "(no subject)";
    const body = parsed.text || (parsed.html ? stripHtml(parsed.html) : "") || "";

    try {
      await ensureTables(env.DB);
      await recordInbound(env.DB, {
        email: from,
        name,
        from,
        to: message.to,
        subject,
        body,
        providerId: parsed.messageId || null,
      });
    } catch (err) {
      // Never drop the mail on a DB hiccup — still forward the backup copy below.
      console.error("mail-worker DB write failed:", err);
    }

    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (err) {
        console.error("mail-worker forward failed:", err);
      }
    }
  },
};
