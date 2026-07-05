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

export interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  size: number;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  R2?: R2Bucket;
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
    headers: {
      "content-type": "application/json; charset=utf-8",
      // API responses must never be cached at the edge (stale /api/health confused us once).
      "cache-control": "no-store",
      ...headers,
    },
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

// ---------------------------------------------------------------------------
// Password auth (PBKDF2 via WebCrypto — no external services needed)
// ---------------------------------------------------------------------------

/** The site owner: this email automatically gets the admin role. */
export const OWNER_EMAIL = "soundside159@gmail.com";

const PBKDF2_ITERATIONS = 100_000;

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const deriveBits = async (password: string, salt: Uint8Array, iterations: number) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations },
    key,
    256,
  );
};

/** Returns "pbkdf2$<iterations>$<saltB64>$<hashB64>". */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt.buffer)}$${toB64(bits)}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = fromB64(parts[2]);
  const expected = parts[3];
  const bits = await deriveBits(password, salt, iterations);
  return toB64(bits) === expected;
};

/** Adds users.password_hash on first use — saves the owner a wrangler migration. */
export const ensurePasswordColumn = async (db: D1Database): Promise<void> => {
  try {
    await db.prepare(`ALTER TABLE users ADD COLUMN password_hash TEXT`).run();
  } catch {
    // column already exists — fine
  }
};

/** Creates a session row and returns the Set-Cookie header value. */
export const openSession = async (db: D1Database, userId: string): Promise<string> => {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  await db
    .prepare(
      `INSERT INTO sessions (token, user_id, expires_at)
       VALUES (?1, ?2, datetime('now', '+${SESSION_DAYS} days'))`,
    )
    .bind(token, userId)
    .run();
  return sessionCookieHeader(token, SESSION_DAYS * 86400);
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
      from: env.EMAIL_FROM ?? "TV Music Store <no-reply@e.tvmusicstore.com>",
      reply_to: "contact@tvmusicstore.com",
      to,
      subject,
      html,
    }),
  });
  return res.ok;
};
