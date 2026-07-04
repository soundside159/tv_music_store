import { getCookie, json, SESSION_COOKIE, sessionCookieHeader, type Ctx } from "../_utils";

export const onRequestPost = async (ctx: Ctx) => {
  const token = getCookie(ctx.request, SESSION_COOKIE);
  if (token && ctx.env.DB) {
    await ctx.env.DB.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(token).run();
  }
  return json({ ok: true }, 200, { "set-cookie": sessionCookieHeader("", 0) });
};
