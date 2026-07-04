import {
  getCookie,
  json,
  newId,
  openSession,
  OWNER_EMAIL,
  type Ctx,
} from "../../_utils";

// GET ?code=...&state=... -> exchanges the code for Google tokens, reads the
// user's email from the id_token, creates/finds the user and opens a session.

const STATE_COOKIE = "tvms_oauth_state";

const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  try {
    const payload = jwt.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const onRequestGet = async (ctx: Ctx) => {
  const url = new URL(ctx.request.url);
  const origin = url.origin;
  const fail = (reason: string) =>
    Response.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`, 302);

  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  if (!ctx.env.GOOGLE_CLIENT_ID || !ctx.env.GOOGLE_CLIENT_SECRET) return fail("google-not-configured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = getCookie(ctx.request, STATE_COOKIE);
  if (!code || !state || !cookieState || state !== cookieState) return fail("google-state-mismatch");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ctx.env.GOOGLE_CLIENT_ID,
      client_secret: ctx.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail("google-token-exchange");

  const tokens = (await tokenRes.json()) as { id_token?: string };
  const claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  const emailVerified = claims?.email_verified === true || claims?.email_verified === "true";
  const name = typeof claims?.name === "string" ? claims.name : null;
  if (!email || !emailVerified) return fail("google-no-verified-email");

  const role = email === OWNER_EMAIL ? "admin" : "customer";

  let user = await ctx.env.DB.prepare(`SELECT id, role FROM users WHERE email = ?1`)
    .bind(email)
    .first<{ id: string; role: string }>();

  if (!user) {
    const id = newId("usr");
    await ctx.env.DB.prepare(
      `INSERT INTO users (id, email, name, role) VALUES (?1, ?2, ?3, ?4)`,
    )
      .bind(id, email, name, role)
      .run();
    await ctx.env.DB.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, status) VALUES (?1, ?2, 'free', 'active')`,
    )
      .bind(newId("sub"), id)
      .run();
    user = { id, role };
  } else if (role === "admin" && user.role !== "admin") {
    await ctx.env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?1`).bind(user.id).run();
  }

  const cookie = await openSession(ctx.env.DB, user.id);
  return new Response(null, {
    status: 302,
    headers: {
      location: `${origin}/account`,
      "set-cookie": cookie,
    },
  });
};
