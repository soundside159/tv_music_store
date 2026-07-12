// Persistent, tamper-evident license codes for SUBSCRIPTION (plan-based)
// certificates. One-time PayPal licenses already have a stable code (their
// sync_orders.id); this module is the equivalent for plan certificates issued
// via /api/license-pdf?slug= / ?track= (the "Include PDF License" flow).
//
// A code is minted once per (user, track, plan), stored in D1, and printed on
// the PDF. It carries a short HMAC signature so an obviously-fake code is
// rejectable without a DB hit, and a real one always resolves in the admin
// Licenses lookup (who / which track / which plan / when).
// Files starting with "_" are not routed.

import type { D1Database, Env } from "./_utils";

export interface PlanLicense {
  code: string;
  userId: string;
  trackId: string;
  plan: string;
  planPeriodEnd: string | null;
  createdAt: string;
}

// Crockford base32 — no I, L, O, U (avoids visual ambiguity when a customer
// reads a code over the phone / retypes it from a PDF).
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const base32 = (bytes: Uint8Array, chars: number): string => {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length && out.length < chars; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  while (out.length < chars) out += "0";
  return out;
};

const hmacBytes = async (secret: string, msg: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
};

// The signing secret. If the owner hasn't set LICENSE_SIGNING_SECRET yet, we
// still work (codes are stored, so admin lookup is authoritative) — but the
// signature is only meaningful once a real secret is configured.
const secretOf = (env: Env): string => env.LICENSE_SIGNING_SECRET || "tvms-default-unsigned";

/** Canonical string the signature is computed over. */
const canonical = (userId: string, trackId: string, plan: string, ymd: string, rand: string) =>
  `${userId}|${trackId}|${plan.toLowerCase()}|${ymd}|${rand}`;

/**
 * Builds a `TVMS-YYYY-MMDD-XXXX` code (issue date + 4-char tail = 2 random +
 * 2-char HMAC check). The signature binds user + track + plan + date, so a
 * fabricated code fails verifyCode and never resolves in admin.
 */
const mintCode = async (
  env: Env,
  userId: string,
  trackId: string,
  plan: string,
): Promise<string> => {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mmdd = `${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const rand = base32(crypto.getRandomValues(new Uint8Array(2)), 2);
  const sig = base32(await hmacBytes(secretOf(env), canonical(userId, trackId, plan, `${yyyy}${mmdd}`, rand)), 2);
  return `TVMS-${yyyy}-${mmdd}-${rand}${sig}`;
};

/** Recomputes the check part of a code — true if the signature matches. */
export const verifyCode = async (env: Env, license: PlanLicense): Promise<boolean> => {
  const m = license.code.match(/^TVMS-(\d{4})-(\d{4})-([0-9A-Z]{2})([0-9A-Z]{2})$/);
  if (!m) return false;
  const [, yyyy, mmdd, rand, expected] = m;
  const sig = base32(await hmacBytes(secretOf(env), canonical(license.userId, license.trackId, license.plan, `${yyyy}${mmdd}`, rand)), 2);
  return sig === expected;
};

// ---------------------------------------------------------------------------
// SUBSCRIPTION LICENCE — one per customer per BILLING PERIOD (owner's design).
//
// A subscriber should not collect a separate certificate for every track he
// downloads. He holds ONE licence that covers the whole library for as long as
// the period he paid for: buy a month, it is valid for that month; buy a year,
// it is valid for the year. When the subscription renews, a NEW code is issued
// and the old one becomes historic — the admin can look up any code and see
// exactly which period it covered and whether it has expired.
//
// Per-track certificates remain, but only for tracks bought ONE-OFF.
// ---------------------------------------------------------------------------

export interface SubscriptionLicense {
  code: string;
  userId: string;
  plan: string;
  periodStart: string;
  periodEnd: string | null;
  createdAt: string;
}

export const ensureSubscriptionLicensesTable = async (db: D1Database): Promise<void> => {
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS subscription_licenses (
           code         TEXT PRIMARY KEY,
           user_id      TEXT NOT NULL,
           plan         TEXT NOT NULL,
           period_start TEXT NOT NULL,
           period_end   TEXT,
           created_at   TEXT NOT NULL DEFAULT (datetime('now'))
         )`,
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_sub_lic_user ON subscription_licenses(user_id, period_end)`,
      )
      .run();
  } catch {
    // already there
  }
};

/**
 * The customer's licence for the period he is IN right now. Issued once per
 * period: the same period always returns the same code; a renewal (new
 * period_end) mints a new one and leaves the previous row untouched as history.
 */
export const getOrCreateSubscriptionLicense = async (
  env: Env,
  userId: string,
  plan: string,
  periodEnd: string | null,
): Promise<SubscriptionLicense | null> => {
  if (!env.DB || plan === "free") return null;
  await ensureSubscriptionLicensesTable(env.DB);

  const existing = await env.DB.prepare(
    `SELECT code, user_id, plan, period_start, period_end, created_at
       FROM subscription_licenses
      WHERE user_id = ?1 AND plan = ?2
        AND ((period_end IS NULL AND ?3 IS NULL) OR period_end = ?3)
      LIMIT 1`,
  )
    .bind(userId, plan, periodEnd)
    .first<{
      code: string;
      user_id: string;
      plan: string;
      period_start: string;
      period_end: string | null;
      created_at: string;
    }>();

  if (existing) {
    return {
      code: existing.code,
      userId: existing.user_id,
      plan: existing.plan,
      periodStart: existing.period_start,
      periodEnd: existing.period_end,
      createdAt: existing.created_at,
    };
  }

  // The code is signed over the PERIOD, not a track — "SUB" takes the track slot.
  const code = await mintCode(env, userId, `SUB:${periodEnd ?? "open"}`, plan);
  const periodStart = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO subscription_licenses (code, user_id, plan, period_start, period_end)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(code, userId, plan, periodStart, periodEnd)
    .run();

  return { code, userId, plan, periodStart, periodEnd, createdAt: periodStart };
};

/** Admin lookup: who held this code, for which period, and is it still valid. */
export const findSubscriptionLicense = async (
  db: D1Database,
  code: string,
): Promise<SubscriptionLicense | null> => {
  await ensureSubscriptionLicensesTable(db);
  const row = await db
    .prepare(
      `SELECT code, user_id, plan, period_start, period_end, created_at
         FROM subscription_licenses WHERE code = ?1 LIMIT 1`,
    )
    .bind(code)
    .first<{
      code: string;
      user_id: string;
      plan: string;
      period_start: string;
      period_end: string | null;
      created_at: string;
    }>();
  if (!row) return null;
  return {
    code: row.code,
    userId: row.user_id,
    plan: row.plan,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
  };
};

/** Creates the plan_licenses table on first use (no manual migration needed). */
export const ensurePlanLicensesTable = async (db: D1Database): Promise<void> => {
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS plan_licenses (
           id              TEXT PRIMARY KEY,
           user_id         TEXT NOT NULL,
           track_id        TEXT NOT NULL,
           plan            TEXT NOT NULL,
           plan_period_end TEXT,
           created_at      TEXT NOT NULL DEFAULT (datetime('now'))
         )`,
      )
      .run();
    await db
      .prepare(`CREATE INDEX IF NOT EXISTS idx_plan_licenses_user ON plan_licenses(user_id)`)
      .run();
    await db
      .prepare(`CREATE INDEX IF NOT EXISTS idx_plan_licenses_track ON plan_licenses(track_id)`)
      .run();
  } catch {
    // table/index already exists — fine
  }
};

/**
 * Returns the existing code for (user, track, plan) or mints + stores a new one.
 * Stable: re-downloading the same track on the same plan yields the same code;
 * a plan change (free->pro->max) mints a new one because the granted rights
 * differ. `planPeriodEnd` is snapshotted on first issue.
 */
export const getOrCreatePlanLicense = async (
  env: Env,
  userId: string,
  trackId: string,
  plan: string,
  planPeriodEnd: string | null,
): Promise<PlanLicense> => {
  const db = env.DB;
  await ensurePlanLicensesTable(db);

  const existing = await db
    .prepare(
      `SELECT id, user_id, track_id, plan, plan_period_end, created_at
         FROM plan_licenses
        WHERE user_id = ?1 AND track_id = ?2 AND plan = ?3
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(userId, trackId, plan)
    .first<{
      id: string;
      user_id: string;
      track_id: string;
      plan: string;
      plan_period_end: string | null;
      created_at: string;
    }>();

  if (existing) {
    return {
      code: existing.id,
      userId: existing.user_id,
      trackId: existing.track_id,
      plan: existing.plan,
      planPeriodEnd: existing.plan_period_end,
      createdAt: existing.created_at,
    };
  }

  // Mint a fresh code, retrying on the (astronomically unlikely) PK collision.
  let code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = await mintCode(env, userId, trackId, plan);
    try {
      await db
        .prepare(
          `INSERT INTO plan_licenses (id, user_id, track_id, plan, plan_period_end)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(code, userId, trackId, plan, planPeriodEnd)
        .run();
      break;
    } catch {
      if (attempt === 4) throw new Error("Could not allocate a license code");
      code = "";
    }
  }

  return { code, userId, trackId, plan, planPeriodEnd, createdAt: new Date().toISOString() };
};
