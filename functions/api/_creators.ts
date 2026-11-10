import type { D1Database } from "./_utils";

// ---------------------------------------------------------------------------
// CONTENT CREATORS (bloggers who promote the store).
//
// The owner gives a user free Max until a date (Admin -> Users -> menu ->
// Content Creator). It is a normal `subscriptions` row (id "crt_...", no
// stripe_sub_id), so every plan check on the site (downloads, WAV/stems,
// whitelist slots, licence PDFs) treats him as Max with no extra code.
//
// content_creators keeps the creator FOREVER, active or not, so he stays in
// the admin "Creators" tab after the grant runs out (owner request: he must
// not disappear among plain users).
//
// Expiry: expireCreatorGrants() runs from getSessionUser (at most every 10
// minutes per isolate, one UPDATE) and turns overdue grants into Free - the
// same shape Stripe leaves behind when a paid subscription ends.
// ---------------------------------------------------------------------------

let tableReady = false;

export const ensureCreatorTable = async (db: D1Database): Promise<void> => {
  if (tableReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS content_creators (
         user_id TEXT PRIMARY KEY,
         granted_at TEXT NOT NULL,
         until TEXT NOT NULL,
         note TEXT,
         sub_id TEXT
       )`,
    )
    .run();
  tableReady = true;
};

const EXPIRE_EVERY_MS = 10 * 60_000;
let lastExpireRun = 0;

/** Overdue free-Max grants -> Free. Cheap and safe to call on every request. */
export const expireCreatorGrants = async (db: D1Database): Promise<void> => {
  const now = Date.now();
  if (now - lastExpireRun < EXPIRE_EVERY_MS) return;
  lastExpireRun = now;
  try {
    await db
      .prepare(
        `UPDATE subscriptions
            SET plan = 'free', status = 'canceled'
          WHERE stripe_sub_id IS NULL
            AND status = 'active'
            AND id IN (SELECT sub_id FROM content_creators
                        WHERE sub_id IS NOT NULL AND until < ?1)`,
      )
      .bind(new Date(now).toISOString())
      .run();
  } catch {
    // table not created yet - nobody has been granted anything
  }
};

/** Was the user an ACTIVE creator (free Max) on this day (YYYY-MM-DD)? */
export const creatorOn = async (db: D1Database, userId: string, day: string): Promise<boolean> => {
  try {
    const r = await db
      .prepare(
        `SELECT 1 AS x FROM content_creators
          WHERE user_id = ?1 AND substr(granted_at, 1, 10) <= ?2 AND substr(until, 1, 10) >= ?2
          LIMIT 1`,
      )
      .bind(userId, day)
      .first<{ x: number }>();
    return !!r;
  } catch {
    return false;
  }
};
