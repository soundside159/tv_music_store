// Shared helpers for Pages Functions. Files starting with "_" are not routed.
// Minimal local typings so we don't need @cloudflare/workers-types yet.

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string; // e.g. "TV Music Store <login@tvmusicstore.com>"
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export interface Ctx {
  request: Request;
  env: Env;
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export const readJson = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};

export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export const getCookie = (request: Request, name: string): string | null => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const SESSION_COOKIE = "tvms_session";
export const SESSION_DAYS = 30;

export const sessionCookieHeader = (token: string, maxAgeSeconds: number) =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export const getSessionUser = async (ctx: Ctx): Promise<SessionUser | null> => {
  const token = getCookie(ctx.request, SESSION_COOKIE);
  if (!token) return null;
  const row = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?1 AND s.expires_at > datetime('now')`,
  )
    .bind(token)
    .first<SessionUser>();
  return row ?? null;
};

/** Sends an email via Resend if configured; otherwise logs (dev fallback). */
export const sendEmail = async (
  env: Env,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> => {
  if (!env.RESEND_API_KEY) {
    console.log(`[email dev-fallback] to=${to} subject="${subject}"`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? "TV Music Store <onboarding@resend.dev>",
      to,
      subject,
      html,
    }),
  });
  return res.ok;
};
