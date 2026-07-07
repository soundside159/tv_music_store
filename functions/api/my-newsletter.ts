import { getSessionUser, json, type Ctx } from "./_utils";
import { isSubscribed, subscribeEmail, unsubscribeEmail } from "./_newsletter";

// The signed-in user's own marketing-email preference (for Account -> Notifications).
//   GET  -> { subscribed: boolean }
//   POST { subscribed: boolean } -> toggles the newsletter for this account's email
// (Named my-newsletter, not me/newsletter, to avoid a file/folder route clash with me.ts.)

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  return json({ subscribed: await isSubscribed(ctx.env.DB, user.email) });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const body = (await ctx.request.json().catch(() => ({}))) as { subscribed?: boolean };
  const subscribed = body.subscribed === true;
  if (subscribed) await subscribeEmail(ctx.env.DB, user.email, "account");
  else await unsubscribeEmail(ctx.env.DB, user.email);
  return json({ ok: true, subscribed });
};
