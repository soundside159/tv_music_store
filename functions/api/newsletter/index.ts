import { json, readJson, type Ctx } from "../_utils";
import { subscribeEmail } from "../_newsletter";

// POST /api/newsletter { email, source? } — opt-in to the marketing list.
// Idempotent; re-subscribes a previously-unsubscribed email. Never reveals
// whether an email already existed.

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const body = await readJson<{ email?: string; source?: string }>(ctx.request);
  const ok = await subscribeEmail(ctx.env.DB, body?.email ?? "", body?.source ?? "site");
  if (!ok) return json({ error: "Enter a valid email address." }, 400);
  return json({ ok: true });
};
