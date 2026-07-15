import { getSessionUser, json, OWNER_EMAIL, type Ctx, type Env } from "../_utils";
import { ensureMailTables, recordMessage } from "../_mail";

// Admin mailbox API. Inbound mail arrives via the separate Email Worker (see
// mail-worker/) into the same D1; this reads threads/messages and sends replies
// through Resend from contact@tvmusicstore.com.
//   GET  /api/admin/mail?tab=inbox|sent|favorites -> { threads, counts }
//   GET  /api/admin/mail?id=<tid>   -> { thread, messages, customer } (marks read)
//   POST /api/admin/mail { action: reply | compose | favorite | mark_read |
//                          archive | delete, ... }
// Tabs are a TRIAGE view over per-person threads: Inbox = the client spoke
// last (needs an answer), Sent = we spoke last, Favorites = starred people.

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

const SITE_URL = "https://tvmusicstore.com";
const SIGNATURE_NAME = "TV Music Store Team";
const POSTAL = "TV Music Store · 5 Brayford Square, London, E1 0SG, United Kingdom";

/** Branded wrapper for every outgoing email: logo, gold accent, the message,
 *  a Best-regards signature and a small footer. Table layout + inline styles
 *  only — that's what survives Gmail/Outlook; fancy web fonts don't. */
const emailHtml = (bodyText: string) => {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#26251f">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f3ef">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
          <tr>
            <td style="background:#0d0d0f;padding:20px 32px">
              <a href="${SITE_URL}" style="text-decoration:none">
                <img src="${SITE_URL}/images/icons/logo-header.png" alt="TV Music Store" height="34" style="display:inline-block;vertical-align:middle;border:0">
                <span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#ffffff;font-size:14px;font-weight:bold;letter-spacing:2px">TV MUSIC STORE</span>
              </a>
            </td>
          </tr>
          <tr><td style="height:3px;background:#F4C430;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px 32px 8px">
              ${paragraphs}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 26px">
              <p style="margin:0;font-size:14px;line-height:1.65;color:#26251f">Best regards,<br>
              <strong>${SIGNATURE_NAME}</strong><br>
              <a href="${SITE_URL}" style="color:#a8841c;text-decoration:none">tvmusicstore.com</a></p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #eceae2;padding:16px 32px 20px">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#9a968a">
                You're receiving this email because you contacted TV Music Store or have an account with us.
                Just reply to this email to reach us.<br>${escapeHtml(POSTAL)}
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};

const sendReply = async (
  env: Env,
  to: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; id?: string; error?: string }> => {
  if (!env.RESEND_API_KEY) return { ok: false, error: "Email is not configured (RESEND_API_KEY)" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to,
      reply_to: CONTACT_ADDR,
      subject,
      html: emailHtml(body),
      text: `${body}\n\nBest regards,\n${SIGNATURE_NAME}\ntvmusicstore.com`,
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

  // Search across correspondents AND message bodies (e.g. paste a YouTube link to
  // find who sent it). Searching also looks inside archived threads.
  const q = new URL(ctx.request.url).searchParams.get("q")?.trim();
  if (q) {
    const like = `%${q}%`;
    const found = await ctx.env.DB.prepare(
      `SELECT DISTINCT t.id, t.email, t.name, t.last_message_at, t.last_snippet,
              t.last_direction, t.unread, t.archived, t.priority, t.favorite
         FROM mail_threads t
         LEFT JOIN mail_messages m ON m.thread_id = t.id
        WHERE t.email LIKE ?1 OR t.name LIKE ?1 OR m.subject LIKE ?1 OR m.body LIKE ?1
        ORDER BY t.last_message_at DESC
        LIMIT 300`,
    )
      .bind(like)
      .all();
    return json({ threads: found.results, unreadThreads: 0 });
  }

  const tab = new URL(ctx.request.url).searchParams.get("tab") ?? "inbox";
  const where =
    tab === "sent"
      ? "archived = 0 AND last_direction = 'out'"
      : tab === "favorites"
        ? "archived = 0 AND favorite = 1"
        : "archived = 0 AND (last_direction = 'in' OR last_direction IS NULL)";
  const threads = await ctx.env.DB.prepare(
    `SELECT id, email, name, last_message_at, last_snippet, last_direction, unread, archived, priority, favorite
       FROM mail_threads
      WHERE ${where}
      ORDER BY priority DESC, last_message_at DESC
      LIMIT 300`,
  ).all();
  const countOf = async (w: string) => {
    const r = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM mail_threads WHERE ${w}`).first<{ n: number }>();
    return r?.n ?? 0;
  };
  const unreadRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM mail_threads WHERE unread > 0 AND archived = 0`,
  ).first<{ n: number }>();
  return json({
    threads: threads.results,
    unreadThreads: unreadRow?.n ?? 0,
    counts: {
      inbox: await countOf("archived = 0 AND (last_direction = 'in' OR last_direction IS NULL)"),
      sent: await countOf("archived = 0 AND last_direction = 'out'"),
      favorites: await countOf("archived = 0 AND favorite = 1"),
    },
  });
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
        to?: string;
        name?: string;
        favorite?: boolean;
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

    case "compose": {
      // A brand-new outgoing email (not a reply): creates/reuses the person's
      // thread, so the conversation continues in one place when they answer.
      const to = (body.to ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "A valid recipient email is required" }, 400);
      const text = body.body?.trim();
      if (!text) return json({ error: "Message text is required" }, 400);
      const subject = body.subject?.trim() || "Message from TV Music Store";
      const sent = await sendReply(ctx.env, to, subject, text);
      if (!sent.ok) return json({ error: `Could not send: ${sent.error}` }, 502);
      const threadId = await recordMessage(db, {
        email: to,
        name: body.name?.trim() || null,
        direction: "out",
        from: CONTACT_ADDR,
        to,
        subject,
        body: text,
        providerId: sent.id ?? null,
      });
      return json({ ok: true, threadId });
    }

    case "favorite": {
      if (!body.threadId) return json({ error: "threadId required" }, 400);
      await db
        .prepare(`UPDATE mail_threads SET favorite = ?2 WHERE id = ?1`)
        .bind(body.threadId, body.favorite === false ? 0 : 1)
        .run();
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
