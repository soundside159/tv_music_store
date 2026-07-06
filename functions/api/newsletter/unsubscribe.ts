import type { Ctx } from "../_utils";
import { ensureNewsletterTable } from "../_newsletter";

// GET /api/newsletter/unsubscribe?token=... — one-click unsubscribe from a
// campaign email. Returns a small branded HTML confirmation page.

const page = (title: string, message: string, ok: boolean) => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} · TV Music Store</title></head>
<body style="margin:0;background:#0d0d10;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:460px;margin:12vh auto;padding:0 20px;text-align:center">
    <div style="color:#F4C430;font-size:15px;font-weight:bold;letter-spacing:3px;margin-bottom:24px">TV MUSIC STORE</div>
    <div style="background:#fff;border-radius:12px;padding:36px 28px">
      <div style="font-size:20px;font-weight:bold;color:#111;margin-bottom:10px">${title}</div>
      <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">${message}</p>
      <a href="https://tvmusicstore.com" style="display:inline-block;background:${ok ? "#F4C430" : "#eee"};color:#111;font-size:13.5px;font-weight:bold;text-decoration:none;padding:11px 24px;border-radius:8px">Back to TV Music Store</a>
    </div>
    <p style="color:#666;font-size:12px;margin-top:18px">&copy; ${new Date().getFullYear()} TV Music Store</p>
  </div>
</body></html>`;

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export const onRequestGet = async (ctx: Ctx) => {
  const token = new URL(ctx.request.url).searchParams.get("token");
  if (!ctx.env.DB || !token) {
    return html(page("Invalid link", "This unsubscribe link is missing or invalid.", false), 400);
  }
  await ensureNewsletterTable(ctx.env.DB);
  const row = await ctx.env.DB.prepare(`SELECT id FROM newsletter_subscribers WHERE token = ?1`)
    .bind(token)
    .first<{ id: string }>();
  if (!row) {
    return html(page("Link not found", "We couldn't find that subscription. It may already have been removed.", false), 404);
  }
  await ctx.env.DB.prepare(
    `UPDATE newsletter_subscribers SET unsubscribed_at = datetime('now') WHERE id = ?1`,
  )
    .bind(row.id)
    .run();
  return html(page("You're unsubscribed", "You won't receive any more marketing emails from us. You'll still get essential emails about your account and purchases.", true));
};
