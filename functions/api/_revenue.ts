import { newId, type D1Database } from "./_utils";

// ---------------------------------------------------------------------------
// REVENUE ENGINE — how money is split between the platform and the composers.
//
// MODEL: "the money follows the user" (user-centric), NOT a shared pool.
// Each payment is split only between the composers that THIS payer actually
// downloaded during the cycle he paid for. A shared pool (Spotify-style) is
// what makes self-download fraud profitable — a composer buys a fake
// subscription, farms his own tracks and dilutes everyone else's slice of the
// pool. Here he would pay $15 to get back, at most, his own author share of
// that same $15: a guaranteed loss. The model defends itself.
//
// WHAT IS SPLIT: the NET, never the gross.
//   gross paid by the customer
//   − tax / VAT            (never ours — it belongs to the state)
//   − payment fees         (Stripe / PayPal)
//   = net  →  author share (default 50%) + platform share
// Everything is snapshotted at payment time: a later price or percentage change
// must never rewrite history.
//
// POINTS (owner's rules):
//   • 1 point per UNIQUE TRACK per payer per cycle. Re-downloading the same
//     track — or taking WAV, then stems, then MP3 of it — is still ONE point.
//   • MP3 128 does NOT count (it is the free-tier format; free money is no
//     money, and it would otherwise be a free farming surface).
//   • A composer's own downloads of his own tracks count for nothing.
//   • Points reset every cycle: the next invoice opens a new window, and the
//     same track can earn again.
//
// A payer who downloaded nothing in his cycle: his author share stays with the
// platform (owner's decision — must be stated in the composer agreement).
// ---------------------------------------------------------------------------

/** Default author share, in basis points (5000 = 50%). Snapshotted per event. */
export const DEFAULT_AUTHOR_SHARE_BPS = 5000;

export type RevenueSource = "subscription" | "license";

export interface RevenueEventInput {
  source: RevenueSource;
  userId: string | null;
  provider: "stripe" | "paypal";
  /** Invoice / capture id — the idempotency key (a webhook can fire twice). */
  providerRef: string;
  grossCents: number;
  taxCents: number;
  feeCents: number;
  currency?: string;
  /** Subscription cycle the payment covers (ISO). Licenses: both null. */
  periodStart?: string | null;
  periodEnd?: string | null;
  /** Single-track licenses only. */
  trackId?: string | null;
  authorShareBps?: number;
}

export const ensureRevenueTables = async (db: D1Database): Promise<void> => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS revenue_events (
         id TEXT PRIMARY KEY,
         source TEXT NOT NULL,
         user_id TEXT,
         provider TEXT NOT NULL,
         provider_ref TEXT NOT NULL UNIQUE,
         gross_cents INTEGER NOT NULL,
         tax_cents INTEGER NOT NULL DEFAULT 0,
         fee_cents INTEGER NOT NULL DEFAULT 0,
         net_cents INTEGER NOT NULL,
         currency TEXT NOT NULL DEFAULT 'usd',
         author_share_bps INTEGER NOT NULL DEFAULT 5000,
         period_start TEXT,
         period_end TEXT,
         track_id TEXT,
         status TEXT NOT NULL DEFAULT 'pending',
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         allocated_at TEXT
       )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS revenue_allocations (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         event_id TEXT NOT NULL,
         composer_id TEXT,
         kind TEXT NOT NULL,
         points INTEGER NOT NULL DEFAULT 0,
         amount_cents INTEGER NOT NULL,
         month TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS payout_runs (
         month TEXT NOT NULL,
         composer_id TEXT NOT NULL,
         amount_cents INTEGER NOT NULL,
         status TEXT NOT NULL DEFAULT 'due',
         paid_at TEXT,
         PRIMARY KEY (month, composer_id)
       )`,
    )
    .run();
  // download_log.quality tells MP3 128 from MP3 320 — the whole "free format
  // earns nothing" rule depends on it. Lazy ALTER: older DBs simply get NULL.
  try {
    await db.prepare(`ALTER TABLE download_log ADD COLUMN quality INTEGER`).run();
  } catch {
    // column already there
  }
};

/**
 * Books a payment. Idempotent on `providerRef` — a webhook delivered twice
 * inserts nothing the second time. Returns the event id (new or existing).
 */
export const recordRevenueEvent = async (
  db: D1Database,
  input: RevenueEventInput,
): Promise<string | null> => {
  await ensureRevenueTables(db);

  const existing = await db
    .prepare(`SELECT id FROM revenue_events WHERE provider_ref = ?1`)
    .bind(input.providerRef)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const gross = Math.max(0, Math.round(input.grossCents));
  const tax = Math.max(0, Math.round(input.taxCents));
  const fee = Math.max(0, Math.round(input.feeCents));
  const net = Math.max(0, gross - tax - fee);
  const id = newId("rev");

  await db
    .prepare(
      `INSERT INTO revenue_events
         (id, source, user_id, provider, provider_ref, gross_cents, tax_cents, fee_cents,
          net_cents, currency, author_share_bps, period_start, period_end, track_id, status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'pending')`,
    )
    .bind(
      id,
      input.source,
      input.userId,
      input.provider,
      input.providerRef,
      gross,
      tax,
      fee,
      net,
      input.currency ?? "usd",
      input.authorShareBps ?? DEFAULT_AUTHOR_SHARE_BPS,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      input.trackId ?? null,
    )
    .run();

  return id;
};

/** YYYY-MM the money is booked into. */
const monthOf = (iso: string) => iso.slice(0, 7);

// --- Payout policy (site_config, editable in Admin -> Finance) --------------

export interface PayoutPolicy {
  /** Nothing is paid out before the month has aged this long (refunds net out). */
  holdbackDays: number;
  /** A balance under this simply rolls into the next payout. */
  thresholdCents: number;
}

export const DEFAULT_POLICY: PayoutPolicy = { holdbackDays: 30, thresholdCents: 5000 };

export const getPayoutPolicy = async (db: D1Database): Promise<PayoutPolicy> => {
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'payout_policy'`)
      .first<{ value: string }>();
    if (!row) return DEFAULT_POLICY;
    const parsed = JSON.parse(row.value) as Partial<PayoutPolicy>;
    return {
      holdbackDays: Number.isFinite(parsed.holdbackDays)
        ? Math.max(0, Math.round(parsed.holdbackDays as number))
        : DEFAULT_POLICY.holdbackDays,
      thresholdCents: Number.isFinite(parsed.thresholdCents)
        ? Math.max(0, Math.round(parsed.thresholdCents as number))
        : DEFAULT_POLICY.thresholdCents,
    };
  } catch {
    return DEFAULT_POLICY;
  }
};

export const savePayoutPolicy = async (db: D1Database, policy: PayoutPolicy): Promise<void> => {
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
    .run();
  await db
    .prepare(
      `INSERT INTO site_config (key, value) VALUES ('payout_policy', ?1)
       ON CONFLICT(key) DO UPDATE SET value = ?1`,
    )
    .bind(JSON.stringify(policy))
    .run();
};

/** The day a month's money becomes payable: end of that month + holdback. */
export const releaseDateOf = (month: string, holdbackDays: number): string => {
  const [year, mon] = month.split("-").map(Number);
  // First day of the NEXT month, plus the holdback.
  const date = new Date(Date.UTC(year, mon, 1));
  date.setUTCDate(date.getUTCDate() + holdbackDays);
  return date.toISOString().slice(0, 10);
};

/**
 * Splits `authorPool` between composers by points, largest-remainder style so
 * the cents always add up to the pool exactly (no money invented or lost).
 */
const splitByPoints = (
  authorPool: number,
  points: { composerId: string; points: number }[],
): { composerId: string; points: number; amount: number }[] => {
  const total = points.reduce((sum, p) => sum + p.points, 0);
  if (total === 0) return [];
  const raw = points.map((p) => ({
    ...p,
    exact: (authorPool * p.points) / total,
  }));
  const out = raw.map((p) => ({
    composerId: p.composerId,
    points: p.points,
    amount: Math.floor(p.exact),
  }));
  let left = authorPool - out.reduce((sum, p) => sum + p.amount, 0);
  // Hand the leftover cents to the biggest fractional parts first.
  const order = raw
    .map((p, i) => ({ i, frac: p.exact - Math.floor(p.exact) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i].amount += 1;
    left -= 1;
  }
  return out;
};

interface EventRow {
  id: string;
  source: RevenueSource;
  user_id: string | null;
  net_cents: number;
  author_share_bps: number;
  period_start: string | null;
  period_end: string | null;
  track_id: string | null;
  created_at: string;
}

/**
 * The points a payer earned for the composers during one subscription cycle:
 * DISTINCT tracks, countable formats only (MP3 320 / WAV / stems — never MP3
 * 128), never his own tracks if he happens to be a composer himself.
 */
const pointsForCycle = async (
  db: D1Database,
  userId: string,
  from: string,
  to: string,
): Promise<{ composerId: string; points: number }[]> => {
  const rows = await db
    .prepare(
      `SELECT d.composer_id AS composer_id, COUNT(DISTINCT d.track_id) AS points
         FROM download_log d
         LEFT JOIN composers c ON c.id = d.composer_id
        WHERE d.user_id = ?1
          AND d.created_at >= ?2
          AND d.created_at < ?3
          AND d.composer_id IS NOT NULL
          AND (d.format IN ('wav','stems') OR (d.format = 'mp3' AND d.quality = 320))
          AND (c.user_id IS NULL OR c.user_id <> ?1)
        GROUP BY d.composer_id`,
    )
    .bind(userId, from, to)
    .all<{ composer_id: string; points: number }>();
  return rows.results.map((r) => ({ composerId: r.composer_id, points: r.points }));
};

/** Allocates ONE booked payment. Safe to call twice (status guards it). */
export const allocateEvent = async (db: D1Database, eventId: string): Promise<void> => {
  const event = await db
    .prepare(
      `SELECT id, source, user_id, net_cents, author_share_bps, period_start, period_end,
              track_id, created_at
         FROM revenue_events WHERE id = ?1 AND status = 'pending'`,
    )
    .bind(eventId)
    .first<EventRow>();
  if (!event) return;

  const authorPool = Math.round((event.net_cents * event.author_share_bps) / 10000);
  const month = monthOf(event.period_end ?? event.created_at);

  let lines: { composerId: string; points: number; amount: number }[] = [];

  if (event.source === "license" && event.track_id) {
    // A single-track license pays exactly one composer — no points needed.
    const track = await db
      .prepare(`SELECT composer_id FROM tracks WHERE id = ?1`)
      .bind(event.track_id)
      .first<{ composer_id: string | null }>();
    if (track?.composer_id) {
      lines = [{ composerId: track.composer_id, points: 1, amount: authorPool }];
    }
  } else if (event.source === "subscription" && event.user_id && event.period_start && event.period_end) {
    const points = await pointsForCycle(db, event.user_id, event.period_start, event.period_end);
    lines = splitByPoints(authorPool, points);
  }

  const allocated = lines.reduce((sum, l) => sum + l.amount, 0);
  for (const line of lines) {
    await db
      .prepare(
        `INSERT INTO revenue_allocations (event_id, composer_id, kind, points, amount_cents, month)
         VALUES (?1, ?2, 'author', ?3, ?4, ?5)`,
      )
      .bind(event.id, line.composerId, line.points, line.amount, month)
      .run();
  }

  // Nothing downloaded (or the track has no composer): the author share stays
  // with the platform. Booked explicitly so the report always balances.
  const leftover = authorPool - allocated;
  if (leftover > 0) {
    await db
      .prepare(
        `INSERT INTO revenue_allocations (event_id, composer_id, kind, points, amount_cents, month)
         VALUES (?1, NULL, 'platform_unallocated', 0, ?2, ?3)`,
      )
      .bind(event.id, leftover, month)
      .run();
  }

  await db
    .prepare(
      `UPDATE revenue_events SET status = 'allocated', allocated_at = datetime('now') WHERE id = ?1`,
    )
    .bind(event.id)
    .run();
};

/** YYYY-MM of today (UTC) — where a reversal is booked. */
const currentMonth = () => new Date().toISOString().slice(0, 7);

/**
 * Money came back (refund or chargeback). Two cases, and the difference matters
 * to the composer:
 *
 *   • Not paid out yet  → the allocation is simply deleted. Nobody notices.
 *   • Already paid out  → we do NOT claw money out of his account. A NEGATIVE
 *     allocation is booked into the CURRENT month, so the refund is netted off
 *     his next payout. That is how every serious platform handles it: the
 *     composer is not punished for a customer's chargeback, he just carries the
 *     balance forward.
 *
 * The event itself is marked `refunded`, which drops it out of the revenue
 * totals — so the platform absorbs it in the month it happened.
 * Idempotent: a webhook may fire twice.
 */
export const reverseEvent = async (
  db: D1Database,
  ref: { eventId?: string; providerRef?: string },
): Promise<boolean> => {
  await ensureRevenueTables(db);

  const event = ref.eventId
    ? await db
        .prepare(`SELECT id, status FROM revenue_events WHERE id = ?1`)
        .bind(ref.eventId)
        .first<{ id: string; status: string }>()
    : await db
        .prepare(`SELECT id, status FROM revenue_events WHERE provider_ref = ?1`)
        .bind(ref.providerRef ?? "")
        .first<{ id: string; status: string }>();
  if (!event || event.status === "refunded") return false;

  const allocations = await db
    .prepare(
      `SELECT id, composer_id, kind, amount_cents, month
         FROM revenue_allocations WHERE event_id = ?1`,
    )
    .bind(event.id)
    .all<{
      id: number;
      composer_id: string | null;
      kind: string;
      amount_cents: number;
      month: string;
    }>();

  const month = currentMonth();

  for (const line of allocations.results) {
    if (line.kind !== "author" || !line.composer_id) {
      // The platform's own share needs no carry-forward — dropping the event
      // from the totals already takes it back.
      await db.prepare(`DELETE FROM revenue_allocations WHERE id = ?1`).bind(line.id).run();
      continue;
    }

    const payout = await db
      .prepare(`SELECT status FROM payout_runs WHERE month = ?1 AND composer_id = ?2`)
      .bind(line.month, line.composer_id)
      .first<{ status: string }>();

    if (payout?.status === "paid") {
      // Already in his pocket — carry the minus forward, never reach back in.
      await db
        .prepare(
          `INSERT INTO revenue_allocations (event_id, composer_id, kind, points, amount_cents, month)
           VALUES (?1, ?2, 'author', 0, ?3, ?4)`,
        )
        .bind(event.id, line.composer_id, -line.amount_cents, month)
        .run();
    } else {
      await db.prepare(`DELETE FROM revenue_allocations WHERE id = ?1`).bind(line.id).run();
    }
  }

  await db
    .prepare(`UPDATE revenue_events SET status = 'refunded' WHERE id = ?1`)
    .bind(event.id)
    .run();
  return true;
};

/**
 * Allocates every payment that is ready: licenses immediately, subscriptions
 * once their cycle has CLOSED (the points window must be finished before the
 * money can be divided). Cheap and idempotent — call it before any report.
 */
export const allocateDue = async (db: D1Database): Promise<number> => {
  await ensureRevenueTables(db);
  const due = await db
    .prepare(
      `SELECT id FROM revenue_events
        WHERE status = 'pending'
          AND (source = 'license' OR (period_end IS NOT NULL AND period_end <= datetime('now')))
        LIMIT 200`,
    )
    .all<{ id: string }>();
  for (const row of due.results) await allocateEvent(db, row.id);
  return due.results.length;
};
