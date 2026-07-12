import { getSessionUser, json, type Ctx } from "../_utils";
import { allocateDue, ensureRevenueTables, getPayoutPolicy, releaseDateOf } from "../_revenue";

// GET /api/composer/earnings — the signed-in composer's real money.
//
// Everything here comes from `revenue_allocations`, i.e. from actual payments —
// nothing is estimated. The composer sees exactly what the owner sees for him,
// which is the point: a payout system nobody can audit is a payout system
// nobody trusts.

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const db = ctx.env.DB;

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const composer = await db
    .prepare(`SELECT id, display_name FROM composers WHERE user_id = ?1 LIMIT 1`)
    .bind(user.id)
    .first<{ id: string; display_name: string }>();
  if (!composer) return json({ error: "No composer profile", code: "not_composer" }, 403);

  await ensureRevenueTables(db);
  await allocateDue(db);

  const policy = await getPayoutPolicy(db);
  const today = new Date().toISOString().slice(0, 10);

  // Per-month earnings + whether the owner has already paid that month.
  const months = await db
    .prepare(
      `SELECT a.month AS month,
              SUM(a.amount_cents) AS amount,
              SUM(a.points) AS points,
              MAX(COALESCE(p.status, 'due')) AS status,
              MAX(p.paid_at) AS paid_at
         FROM revenue_allocations a
         LEFT JOIN payout_runs p ON p.month = a.month AND p.composer_id = a.composer_id
        WHERE a.kind = 'author' AND a.composer_id = ?1
        GROUP BY a.month
        ORDER BY a.month DESC
        LIMIT 24`,
    )
    .bind(composer.id)
    .all<{
      month: string;
      amount: number;
      points: number;
      status: string;
      paid_at: string | null;
    }>();

  const rows = months.results.map((m) => {
    const releaseDate = releaseDateOf(m.month, policy.holdbackDays);
    const paid = m.status === "paid";
    return {
      month: m.month,
      amountCents: m.amount ?? 0,
      points: m.points ?? 0,
      paid,
      paidAt: m.paid_at,
      releaseDate,
      /** paid | payable | held — held = waiting out the refund window. */
      state: paid ? "paid" : releaseDate <= today ? "payable" : "held",
    };
  });

  const lifetime = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const paidOut = rows.filter((r) => r.paid).reduce((sum, r) => sum + r.amountCents, 0);
  const releasedUnpaid = rows
    .filter((r) => r.state === "payable")
    .reduce((sum, r) => sum + r.amountCents, 0);
  const held = rows.filter((r) => r.state === "held").reduce((sum, r) => sum + r.amountCents, 0);

  // Which of his tracks earned, this month and overall — the "why is it this
  // number" answer. Points, not money: a track's value depends on who downloaded
  // it, so a per-track dollar figure would be a lie.
  const tracks = await db
    .prepare(
      `SELECT t.title AS title, t.slug AS slug, COUNT(DISTINCT d.user_id || ':' || d.track_id) AS points
         FROM download_log d
         JOIN tracks t ON t.id = d.track_id
        WHERE d.composer_id = ?1
          AND (d.format IN ('wav','stems') OR (d.format = 'mp3' AND d.quality = 320))
        GROUP BY d.track_id
        ORDER BY points DESC
        LIMIT 20`,
    )
    .bind(composer.id)
    .all<{ title: string; slug: string; points: number }>();

  return json({
    composer: { id: composer.id, name: composer.display_name },
    policy: {
      holdbackDays: policy.holdbackDays,
      thresholdCents: policy.thresholdCents,
    },
    totals: {
      lifetimeCents: lifetime,
      paidOutCents: paidOut,
      payableCents: releasedUnpaid,
      heldCents: held,
      payable: releasedUnpaid >= policy.thresholdCents && releasedUnpaid > 0,
    },
    months: rows,
    tracks: tracks.results,
  });
};
