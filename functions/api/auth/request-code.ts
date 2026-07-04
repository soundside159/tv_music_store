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

  const sent = await sendEmail(
    ctx.env,
    email,
    `${code} — your TV Music Store login code`,
    `<p>Your login code:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't request it, ignore this email.</p>`,
  );
  if (!sent) console.log(`[auth dev-fallback] login code for ${email}: ${code}`);

  return json({ ok: true });
};
