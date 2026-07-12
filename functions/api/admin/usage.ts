import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";
import { fetchOpenAiSpend, getUsageReport } from "../_usage";

// Services & credits (rendered at the bottom of Admin → Dashboard).
//
// GET -> today's YouTube quota use (the only figure we can honestly meter),
//        plus OpenAI's REAL monthly spend when an Admin key is configured.
//        Resend has no usage API at all — the UI just links to its dashboard.

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
