import { json, newId, readJson, type Ctx } from "../_utils";
import { ensureNewsletterTable, NEWSLETTER_EMAIL_RE } from "../_newsletter";

// POST /api/newsletter { email, source? } — opt-in to the marketing list.
// Idempotent; re-subscribes a previously-unsubscribed email. Never reveals
// whether an email already existed.

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const db = ctx.env.DB;
  await ensureNewsletterTable(db);

  const body = await readJson<{ email?: string; source?: string }>(ctx.request);
  const email = body?.email?.trim().toLowerCase();
  const source = (body?.source ?? "site").slice(0, 40);
  if (!email || !NEWSLETTER_EMAIL_RE.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const existing = await db
    .prepare(`SELECT id FROM newsletter_subscribers WHERE email = ?1`)
    .bind(email)
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
      .bind(newId("nl"), email, token, source)
      .run();
  }

  return json({ ok: true });
};
