import { type Ctx } from "../_utils";

// GET -> redirects to Google's OAuth consent screen.
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Cloudflare settings;
// without them the user is sent back to /login?error=google-not-configured.

const STATE_COOKIE = "tvms_oauth_state";
const NEXT_COOKIE = "tvms_oauth_next";

export const onRequestGet = async (ctx: Ctx) => {
  const url = new URL(ctx.request.url);
  const origin = url.origin;

  if (!ctx.env.GOOGLE_CLIENT_ID || !ctx.env.GOOGLE_CLIENT_SECRET) {
    return Response.redirect(`${origin}/login?error=google-not-configured`, 302);
  }

  // Where to land after login (e.g. back to the catalog the user downloaded from).
  const nextRaw = url.searchParams.get("next") ?? "";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/account";

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: ctx.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  const headers = new Headers({
    location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  });
  headers.append(
    "set-cookie",
    `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );
  headers.append(
    "set-cookie",
    `${NEXT_COOKIE}=${encodeURIComponent(next)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );
  return new Response(null, { status: 302, headers });
};
