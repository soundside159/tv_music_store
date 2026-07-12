import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";
import {
  fetchOpenAiSpend,
  getUsageReport,
  saveUsageLimits,
  type UsageLimits,
} from "../_usage";

// Admin → Usage. What we have spent this month on Resend, the YouTube Data API
// and OpenAI, against the limits the owner enters.
//
// GET  -> today + this month + a 14-day history + the limits
// POST { resendMonthly, youtubeDaily, openaiMonthlyCents } -> update the limits

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return { error: json({ error: "Admin only" }, 403) };
  }
  return { user };
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const report = await getUsageReport(ctx.env.DB);

  // The REAL OpenAI bill when an Admin key is set; our own estimate otherwise —
  // and the UI always says which of the two it is showing.
  const openai = await fetchOpenAiSpend(ctx.env, report.month.openai.costCents);

  return json({
    ...report,
    openaiSpend: openai,
    // Which providers are actually wired up — a zero next to a missing key means
    // "not configured", not "nothing spent".
    configured: {
      resend: !!ctx.env.RESEND_API_KEY,
      youtube: !!ctx.env.YOUTUBE_API_KEY,
      openai: !!ctx.env.OPENAI_API_KEY,
      openaiAdmin: !!ctx.env.OPENAI_ADMIN_KEY,
    },
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const body = await readJson<Partial<UsageLimits>>(ctx.request);
  await saveUsageLimits(ctx.env.DB, {
    resendMonthly: Math.max(0, Math.round(Number(body?.resendMonthly ?? 0))) || 3000,
    youtubeDaily: Math.max(0, Math.round(Number(body?.youtubeDaily ?? 0))) || 10000,
    openaiMonthlyCents: Math.max(0, Math.round(Number(body?.openaiMonthlyCents ?? 0))) || 2000,
  });
  return json({ ok: true });
};
