import { getSessionUser, json, newId, OWNER_EMAIL, readJson, type Ctx, type D1Database } from "../_utils";
import { ensureNewsletterTable } from "../_newsletter";
import { sendCampaignEmail } from "../_email";

// POST /api/admin/campaign — admin only.
//   { subject, body, tag?, preview: true }  -> { count }  (no send)
//   { subject, body, tag? }                 -> sends, returns { sent, failed, recipients }
// Audience = active newsletter subscribers, optionally narrowed to those whose
// matched account "taste" (downloads/purchases) includes a genre/mood/use-case
// tag. Every email carries an unsubscribe link. Capped to protect the request.

const SEND_CAP = 300;

const ensureCampaignTable = async (db: D1Database) => {
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS email_campaigns (
           id TEXT PRIMARY KEY, subject TEXT NOT NULL, audience TEXT,
           recipients INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0,
           failed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
         )`,
      )
      .run();
  } catch {
    // exists
  }
};

/** Active newsletter subscribers, optionally filtered by a taste tag. */
const recipients = async (db: D1Database, tag: string | null) => {
  if (tag) {
    const like = `%${tag}%`;
    const rows = await db
      .prepare(
        `SELECT n.email, n.token FROM newsletter_subscribers n
          WHERE n.unsubscribed_at IS NULL
            AND n.email IN (
              SELECT u.email FROM users u WHERE u.id IN (
                SELECT dl.user_id FROM download_log dl JOIN tracks t ON t.id = dl.track_id
                  WHERE t.genre LIKE ?1 OR t.mood LIKE ?1 OR t.use_case LIKE ?1
                UNION
                SELECT so.user_id FROM sync_orders so JOIN tracks t ON t.id = so.track_id
                  WHERE t.genre LIKE ?1 OR t.mood LIKE ?1 OR t.use_case LIKE ?1
              )
            )`,
      )
      .bind(like)
      .all<{ email: string; token: string }>();
    return rows.results;
  }
  const rows = await db
    .prepare(`SELECT email, token FROM newsletter_subscribers WHERE unsubscribed_at IS NULL`)
    .all<{ email: string; token: string }>();
  return rows.results;
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const admin = await getSessionUser(ctx);
  if (!admin) return json({ error: "Not signed in" }, 401);
  if (admin.role !== "admin" && admin.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }

  const db = ctx.env.DB;
  await ensureNewsletterTable(db);
  await ensureCampaignTable(db);

  const body = await readJson<{ subject?: string; body?: string; tag?: string; preview?: boolean }>(ctx.request);
  const subject = (body?.subject ?? "").trim();
  const text = (body?.body ?? "").trim();
  const tag = (body?.tag ?? "").trim() || null;

  const list = await recipients(db, tag);

  if (body?.preview) {
    return json({ count: list.length, capped: list.length > SEND_CAP });
  }

  if (!subject || !text) return json({ error: "Subject and body are required." }, 400);
  if (list.length === 0) return json({ error: "No recipients match this audience." }, 400);

  const targets = list.slice(0, SEND_CAP);
  let sent = 0;
  let failed = 0;
  // Small concurrency to stay within request limits.
  const BATCH = 10;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((r) =>
        sendCampaignEmail(
          ctx.env,
          r.email,
          subject,
          text,
          `https://tvmusicstore.com/api/newsletter/unsubscribe?token=${encodeURIComponent(r.token)}`,
        ),
      ),
    );
    for (const ok of results) ok ? sent++ : failed++;
  }

  await db
    .prepare(
      `INSERT INTO email_campaigns (id, subject, audience, recipients, sent, failed)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(newId("cmp"), subject, tag ? `tag:${tag}` : "all", list.length, sent, failed)
    .run();

  return json({ sent, failed, recipients: list.length, capped: list.length > SEND_CAP });
};
