import { json, readJson, sendEmail, type Ctx } from "../_utils";

// POST { email } -> creates a 6-digit login code valid for 10 minutes.
// With RESEND_API_KEY set the code is emailed; without it (dev) it is logged
// in the Functions console so the owner can test the flow before Resend.

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const body = await readJson<{ email?: string }>(ctx.request);
  const email = body?.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Valid email required" }, 400);
  }

  // Basic rate limit: max 3 fresh codes per email at a time
  const recent = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM auth_codes
      WHERE email = ?1 AND used = 0 AND expires_at > datetime('now')`,
  )
    .bind(email)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 3) {
    return json({ ok: true }); // silently accept; codes already issued
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await ctx.env.DB.prepare(
    `INSERT INTO auth_codes (email, code, expires_at)
     VALUES (?1, ?2, datetime('now', '+10 minutes'))`,
  )
    .bind(email, code)
    .run();

  const html = `
<div style="margin:0 auto;max-width:480px;font-family:Arial,Helvetica,sans-serif">
  <div style="background:#111;padding:22px 20px;text-align:center;border-radius:12px 12px 0 0">
    <img src="https://tvmusicstore.com/images/icons/web-app-manifest-192x192.png" width="44" height="44" alt="TV Music Store"
      style="display:block;margin:0 auto 10px;border-radius:10px"/>
    <span style="color:#F4C430;font-size:16px;font-weight:bold;letter-spacing:3px">TV MUSIC STORE</span>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:0;padding:36px 24px;text-align:center">
    <p style="margin:0 0 6px;color:#111;font-size:34px;font-weight:bold;letter-spacing:6px">${code}</p>
    <p style="margin:0;color:#555;font-size:14px;line-height:1.6">
      This is your single-use login code for TV&nbsp;Music&nbsp;Store.<br/>
      It expires 10 minutes from when it was requested.
    </p>
    <p style="margin:18px 0 0;color:#999;font-size:12px">Didn't request it? Just ignore this email.</p>
  </div>
  <div style="background:#111;padding:18px 24px;text-align:center;border-radius:0 0 12px 12px">
    <p style="margin:0;color:#aaa;font-size:12px;line-height:1.7">
      Need help? Contact us at
      <a href="mailto:contact@tvmusicstore.com" style="color:#F4C430;text-decoration:none">contact@tvmusicstore.com</a>
      <br/>
      <span style="color:#666">&copy; ${new Date().getFullYear()} TV Music Store &middot; tvmusicstore.com</span>
    </p>
  </div>
</div>`;

  const sent = await sendEmail(ctx.env, email, "Here is your code", html);
  if (!sent) console.log(`[auth dev-fallback] login code for ${email}: ${code}`);

  return json({ ok: true });
};
