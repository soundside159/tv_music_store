import { json, type Ctx } from "./_utils";

export const onRequestGet = async (ctx: Ctx) => {
  let db = "not bound";
  try {
    if (ctx.env.DB) {
      const row = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM plan_config").first<{ n: number }>();
      db = `ok (${row?.n ?? 0} plans)`;
    }
  } catch (e) {
    db = `error: ${e instanceof Error ? e.message : "unknown"}`;
  }
  return json({
    ok: true,
    db,
    resend: ctx.env.RESEND_API_KEY ? "configured" : "missing",
    stripe: ctx.env.STRIPE_SECRET_KEY ? "configured" : "missing",
    stripe_webhook: ctx.env.STRIPE_WEBHOOK_SECRET ? "configured" : "missing",
    google: ctx.env.GOOGLE_CLIENT_ID ? "configured" : "missing",
    r2: ctx.env.R2 ? "bound" : "not bound",
  });
};
