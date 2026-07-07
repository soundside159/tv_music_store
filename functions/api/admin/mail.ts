import { getSessionUser, json, OWNER_EMAIL, type Ctx, type Env } from "../_utils";
import { ensureMailTables, recordMessage } from "../_mail";

// Admin mailbox API. Inbound mail arrives via the separate Email Worker (see
// mail-worker/) into the same D1; this reads threads/messages and sends replies
// through Resend from contact@tvmusicstore.com.
//   GET  /api/admin/mail            -> { threads }
//   GET  /api/admin/mail?id=<tid>   -> { thread, messages, customer } (marks read)
//   POST /api/admin/mail { action: reply | mark_read | archive | delete, ... }

const CONTACT_FROM = "TV Music Store <contact@tvmusicstore.com>";
const CONTACT_ADDR = "contact@tvmusicstore.com";

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return { error: json({ error: "Admin only" }, 403) };
  }
  return { user };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sendReply = async (
  env: Env,
  to: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; id?: string; error?: string }> => {
  if (!env.RESEND_API_KEY) return { ok: false, error: "Email is not configured (RESEND_API_KEY)" };
  const html = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to,
      reply_to: CONTACT_ADDR,
      subject,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">${html}</div>`,
      text: body,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    // The most common cause: the root domain isn't verified in Resend yet.
    return { ok: false, error: data.message ?? `Resend HTTP ${res.status}` };
  }
  return { ok: true, id: data.id };
};

const lookupCustomer = async (db: D1Database, email: string) => {
  const u = await db
    .prepare(`SELECT id, name, role FROM users WHERE lower(email) = ?1`)
    .bind(email.toLowerCase())
    .first<{ id: string; name: string | null; role: string }>();
  if (!u) return null;
  const sub = await db
    .prepare(`SELECT plan, status FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`)
    .bind(u.id)
    .first<{ plan: string; status: string }>();
  const plan = sub?.status === "active" || sub?.status === "canceled" ? sub.plan : "free";
  const count = async (sql: string) => {
    try {
      const r = await db.prepare(sql).bind(u.id).first<{ n: number }>();
      return r?.n ?? 0;
    } catch {
      return 0;
    }
  };
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    plan,
    purchases: await count(`SELECT COUNT(*) AS n FROM sync_orders WHERE user_id = ?1`),
    downloads: await count(`SELECT COUNT(*) AS n FROM download_log WHERE user_id = ?1`),
  };
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const auth = await requireAdmin(ctx);
  if (auth.error) return auth.error;
  await ensureMailTables(ctx.env.DB);

  const id = new URL(ctx.request.url).searchParams.get("id");

  if (id) {
    const thread = await ctx.env.DB.prepare(`SELECT * FROM mail_threads WHERE id = ?1`)
      .bind(id)
      .first<{ id: string; email: string; name: string | null }>();
    if (!thread) return json({ error: "Thread not found" }, 404);
    const messages = await ctx.env.DB.prepare(
      `SELECT id, direction, from_email, to_email, subject, body, created_at
         FROM mail_messages WHERE thread_id = ?1 ORDER BY created_at ASC`,
    )
      .bind(id)
      .all();
    // Opening a thread marks it read.
    await ctx.env.DB.prepare(`UPDATE mail_threads SET unread = 0 WHERE id = ?1`).bind(id).run();
    const customer = await lookupCustomer(ctx.env.DB, thread.email);
    return json({ thread, messages: messages.results, customer });
  }

  const threads = await ctx.env.DB.prepare(
    `SELECT id, email, name, last_message_at, last_snippet, last_direction, unread, archived
       FROM mail_threads
      WHERE archived = 0
      ORDER BY last_message_at DESC
      LIMIT 300`,
  ).all();
  const unreadRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM mail_threads WHERE unread > 0 AND archived = 0`,
  ).first<{ n: number }>();
  return json({ threads: threads.results, unreadThreads: unreadRow?.n ?? 0 });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const auth = await requireAdmin(ctx);
  if (auth.error) return auth.error;
  await ensureMailTables(ctx.env.DB);

  const body = await (async () => {
    try {
      return (await ctx.request.json()) as {
        action?: string;
        threadId?: string;
        subject?: string;
        body?: string;
        archived?: boolean;
      };
    } catch {
      return null;
    }
  })();
  if (!body?.action) return json({ error: "action required" }, 400);
  const db = ctx.env.DB;

  switch (body.action) {
    case "reply": {
      const threadId = body.threadId?.trim();
      const text = body.body?.trim();
      if (!threadId || !text) return json({ error: "threadId and body required" }, 400);
      const thread = await db
        .prepare(`SELECT email, name FROM mail_threads WHERE id = ?1`)
        .bind(threadId)
        .first<{ email: string; name: string | null }>();
      if (!thread) return json({ error: "Thread not found" }, 404);
      const subject = body.subject?.trim() || "Re: your message";
      const sent = await sendReply(ctx.env, thread.email, subject, text);
      if (!sent.ok) return json({ error: `Could not send: ${sent.error}` }, 502);
      await recordMessage(db, {
        email: thread.email,
        name: thread.name,
        direction: "out",
        from: CONTACT_ADDR,
        to: thread.email,
        subject,
        body: text,
        providerId: sent.id ?? null,
      });
      return json({ ok: true });
    }

    case "mark_read": {
      if (!body.threadId) return json({ error: "threadId required" }, 400);
      await db.prepare(`UPDATE mail_threads SET unread = 0 WHERE id = ?1`).bind(body.threadId).run();
      return json({ ok: true });
    }

    case "archive": {
      if (!body.threadId) return json({ error: "threadId required" }, 400);
      await db
        .prepare(`UPDATE mail_threads SET archived = ?2 WHERE id = ?1`)
        .bind(body.threadId, body.archived === false ? 0 : 1)
        .run();
      return json({ ok: true });
    }

    case "delete": {
      if (!body.threadId) return json({ error: "threadId required" }, 400);
      await db.prepare(`DELETE FROM mail_messages WHERE thread_id = ?1`).bind(body.threadId).run();
      await db.prepare(`DELETE FROM mail_threads WHERE id = ?1`).bind(body.threadId).run();
      return json({ ok: true });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};
