import { getSessionUser, json, type Ctx } from "./_utils";
import { ensureMailTables, recordMessage } from "./_mail";

// The signed-in user's support conversation (internal chat, reuses the mailbox).
//   GET  -> { plan, contact, messages } — the user's own thread (in + out)
//   POST { message } -> appends a message; paid plans mark the thread priority.
// Admin replies from /admin -> Inbox appear here (GET returns "out" messages).

const CONTACT = "contact@tvmusicstore.com";

const planOf = async (db: D1Database, userId: string): Promise<string> => {
  const sub = await db
    .prepare(`SELECT plan, status FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`)
    .bind(userId)
    .first<{ plan: string; status: string }>();
  return sub?.status === "active" || sub?.status === "canceled" ? sub.plan : "free";
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  await ensureMailTables(ctx.env.DB);

  const plan = await planOf(ctx.env.DB, user.id);
  const thread = await ctx.env.DB
    .prepare(`SELECT id FROM mail_threads WHERE email = ?1`)
    .bind(user.email.toLowerCase())
    .first<{ id: string }>();

  let messages: unknown[] = [];
  if (thread) {
    const rows = await ctx.env.DB
      .prepare(
        `SELECT id, direction, body, created_at FROM mail_messages
          WHERE thread_id = ?1 ORDER BY created_at ASC`,
      )
      .bind(thread.id)
      .all();
    messages = rows.results;
  }
  return json({ plan, contact: CONTACT, messages });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const body = (await ctx.request.json().catch(() => ({}))) as { message?: string };
  const message = (body.message ?? "").trim();
  if (!message) return json({ error: "Enter a message" }, 400);

  const plan = await planOf(ctx.env.DB, user.id);
  const u = await ctx.env.DB
    .prepare(`SELECT name FROM users WHERE id = ?1`)
    .bind(user.id)
    .first<{ name: string | null }>();

  await recordMessage(ctx.env.DB, {
    email: user.email,
    name: u?.name ?? null,
    direction: "in",
    from: user.email,
    to: CONTACT,
    subject: plan !== "free" ? "Priority support" : "Support",
    body: message,
    priority: plan !== "free",
  });
  return json({ ok: true });
};
