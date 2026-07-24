// Minimal Stripe REST helpers for Cloudflare Pages Functions (no SDK needed).
// Files starting with "_" are not routed.

import { newId, type D1Database } from "../_utils";

// ---------------------------------------------------------------------------
// REST client (form-encoded, like Stripe expects)
// ---------------------------------------------------------------------------

export const stripeCall = async <T>(
  secretKey: string,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> => {
  const encoded = params
    ? new URLSearchParams(
        Object.entries(params).flatMap(([k, v]) =>
          v === undefined ? [] : [[k, String(v)] as [string, string]],
        ),
      ).toString()
    : "";
  const url = `https://api.stripe.com/v1${path}${method === "GET" && encoded ? `?${encoded}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" && encoded ? encoded : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Stripe ${path} failed (HTTP ${res.status})`);
  }
  return data;
};

// ---------------------------------------------------------------------------
// Webhook signature verification (stripe-signature: t=...,v1=...)
// ---------------------------------------------------------------------------

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const verifyStripeSignature = async (
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> => {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1s = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || v1s.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)),
  );
  // Constant-time-ish comparison.
  return v1s.some((v) => {
    if (v.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ v.charCodeAt(i);
    return diff === 0;
  });
};

// ---------------------------------------------------------------------------
// subscriptions table helpers
// ---------------------------------------------------------------------------

/** Adds subscriptions.stripe_customer_id + cancel_at_period_end on first use
 *  (no manual migration — same lazy-ALTER pattern as everywhere else). */
export const ensureStripeColumns = async (db: D1Database): Promise<void> => {
  try {
    await db.prepare(`ALTER TABLE subscriptions ADD COLUMN stripe_customer_id TEXT`).run();
  } catch {
    // column already exists — fine
  }
  try {
    await db
      .prepare(`ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER DEFAULT 0`)
      .run();
  } catch {
    // column already exists — fine
  }
};

export interface SubUpsert {
  stripeSubId?: string | null;
  stripeCustomerId?: string | null;
  plan: string;
  interval: string | null;
  status: string;
  currentPeriodEnd: string | null;
  /** true = customer canceled in the portal; plan stays active until period end. */
  cancelAtPeriodEnd?: boolean;
}

/** One live subscription row per user: update the latest or insert a new one. */
export const upsertSubscription = async (
  db: D1Database,
  userId: string,
  s: SubUpsert,
): Promise<void> => {
  await ensureStripeColumns(db);
  const existing = await db
    .prepare(`SELECT id FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`)
    .bind(userId)
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare(
        `UPDATE subscriptions
            SET plan = ?1, interval = ?2, status = ?3, current_period_end = ?4,
                cancel_at_period_end = ?5,
                stripe_sub_id = COALESCE(?6, stripe_sub_id),
                stripe_customer_id = COALESCE(?7, stripe_customer_id)
          WHERE id = ?8`,
      )
      .bind(
        s.plan,
        s.interval,
        s.status,
        s.currentPeriodEnd,
        s.cancelAtPeriodEnd ? 1 : 0,
        s.stripeSubId ?? null,
        s.stripeCustomerId ?? null,
        existing.id,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO subscriptions
           (id, user_id, stripe_sub_id, stripe_customer_id, plan, interval, status, current_period_end, cancel_at_period_end)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        newId("sub"),
        userId,
        s.stripeSubId ?? null,
        s.stripeCustomerId ?? null,
        s.plan,
        s.interval,
        s.status,
        s.currentPeriodEnd,
        s.cancelAtPeriodEnd ? 1 : 0,
      )
      .run();
  }
};

/** Stripe subscription statuses -> our three states. */
export const mapStripeStatus = (status: string): "active" | "past_due" | "canceled" => {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "canceled";
};

export const unixToIso = (unix: number | null | undefined): string | null =>
  typeof unix === "number" && unix > 0 ? new Date(unix * 1000).toISOString() : null;

// Shapes we read from Stripe responses (only the fields we use).
export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: {
    data?: {
      price?: { id: string; recurring?: { interval?: string } };
      // 2025+ API versions moved the period off the subscription top level
      // onto each item — read it from either place (see subPeriodEnd).
      current_period_end?: number;
    }[];
  };
}

/** The period end, wherever this API version keeps it (top-level was moved to
 *  the subscription items in the 2025+ schema). */
export const subPeriodEnd = (sub: StripeSubscription): number | null =>
  sub.current_period_end ?? sub.items?.data?.find((i) => !!i.current_period_end)?.current_period_end ?? null;
