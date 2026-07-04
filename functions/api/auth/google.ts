import { type Ctx } from "../_utils";

// GET -> redirects to Google's OAuth consent screen.
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Cloudflare settings;
// without them the user is sent back to /login?error=google-not-configured.

const STATE_COOKIE = "tvms_oauth_state";

export const onRequestGet = async (ctx: Ctx) => {
  const origin = new URL(ctx.request.url).origin;

  if (!ctx.env.GOOGLE_CLIENT_ID || !ctx.env.GOOGLE_CLIENT_SECRET) {
    return Response.redirect(`${origin}/login?error=google-not-configured`, 302);
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: ctx.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      "set-cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
};
