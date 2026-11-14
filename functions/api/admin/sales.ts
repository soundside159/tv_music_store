import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";
import { allocateDue, ensureRevenueTables, getPayoutPolicy, releaseDateOf } from "../_revenue";
import { axisKeys, inRange, resolvePeriod } from "../_period";

// Admin -> Dashboard "Sales" block. One read-only call:
//   GET /api/admin/sales?period=this_month|last_month|this_year|all
// -> totals for the period and the period before it (for the +/- %),
//    how the net money split (composers / store / still splitting),
//    a per-day (or per-month) series split license / subscription,
//    license sales grouped by composer, active paid subscribers and the
//    latest payments with track, licence tier, composer and buyer.
// Money = gross cents straight from the revenue ledger; refunded rows are
// left out of every total and only flagged in the "latest" list.

export const onRequestGet = async (ctx: Ctx) => {
  try {
    return await handle(ctx);
  } catch (e) {
    // Never let a query error turn into an HTML 500 page.
    return json({ error: `Sales: ${(e as Error).message}` }, 500);
  }
};

const handle = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) return json({ error: "Admin only" }, 403);
  const db = ctx.env.DB;
  await ensureRevenueTables(db);
  // Split what is due first, so the Income block is never stale.
  try {
    await allocateDue(db);
  } catch {
    // never block the dashboard on the splitter
  }

  const period = resolvePeriod(new URL(ctx.request.url).searchParams.get("period"));
  const since = period.from;
  const until = period.to;
  const bucketLen = period.bucket === "month" ? 7 : 10;
  // A single day still charts its whole month (the day is marked on the chart).
  const chartFrom = period.chart?.from ?? since;
  const chartTo = period.chart ? period.chart.to : until;

  type TotRow = { source: string; n: number; gross: number; net: number };
  const totalsFor = async (from: string, to: string | null) => {
    const res = await db
      .prepare(
        `SELECT source, COUNT(*) AS n, COALESCE(SUM(gross_cents),0) AS gross, COALESCE(SUM(net_cents),0) AS net
           FROM revenue_events
          WHERE status != 'refunded' AND ${inRange("created_at", 1, 2)}
          GROUP BY source`,
      )
      .bind(from, to)
      .all<TotRow>();
    const rows = res.results ?? [];
    const pick = (s: string) => rows.find((r) => r.source === s) ?? { n: 0, gross: 0, net: 0 };
    const lic = pick("license");
    const sub = pick("subscription");
    return {
      gross: lic.gross + sub.gross,
      net: lic.net + sub.net,
      sales: lic.n + sub.n,
      licenseGross: lic.gross,
      licenseCount: lic.n,
      subscriptionGross: sub.gross,
      subscriptionCount: sub.n,
    };
  };

  const totals = await totalsFor(since, until);
  const previous = period.prev ? await totalsFor(period.prev.from, period.prev.to) : null;

  // Where the net money went: composers, the store, or not split yet
  // (subscriptions whose paid period has not closed).
  const authorsRow = await db
    .prepare(
      `SELECT COALESCE(SUM(a.amount_cents),0) AS amount
         FROM revenue_allocations a JOIN revenue_events e ON e.id = a.event_id
        WHERE a.kind = 'author' AND e.status = 'allocated' AND ${inRange("e.created_at", 1, 2)}`,
    )
    .bind(since, until)
    .first<{ amount: number }>();
  const netByStatus = await db
    .prepare(
      `SELECT status, COALESCE(SUM(net_cents),0) AS net FROM revenue_events
        WHERE status IN ('allocated','pending') AND ${inRange("created_at", 1, 2)}
        GROUP BY status`,
    )
    .bind(since, until)
    .all<{ status: string; net: number }>();
  const allocatedNet = netByStatus.results.find((r) => r.status === "allocated")?.net ?? 0;
  const composersTotal = authorsRow?.amount ?? 0;
  const split = {
    composers: composersTotal,
    store: allocatedNet - composersTotal,
    splitting: netByStatus.results.find((r) => r.status === "pending")?.net ?? 0,
  };

  const seriesRes = await db
    .prepare(
      `SELECT substr(created_at,1,?2) AS k, source, COALESCE(SUM(gross_cents),0) AS gross, COUNT(*) AS n
         FROM revenue_events
        WHERE status != 'refunded' AND ${inRange("created_at", 1, 3)}
        GROUP BY k, source ORDER BY k`,
    )
    .bind(chartFrom, bucketLen, chartTo)
    .all<{ k: string; source: string; gross: number; n: number }>();
  const seriesMap = new Map<string, { k: string; license: number; subscription: number; sales: number }>();
  for (const r of seriesRes.results ?? []) {
    const row = seriesMap.get(r.k) ?? { k: r.k, license: 0, subscription: 0, sales: 0 };
    if (r.source === "subscription") row.subscription += r.gross;
    else row.license += r.gross;
    row.sales += r.n;
    seriesMap.set(r.k, row);
  }

  const byComposerRes = await db
    .prepare(
      `SELECT COALESCE(c.display_name, 'TV Music Store') AS name, c.slug AS slug,
              COUNT(*) AS n, COALESCE(SUM(e.gross_cents),0) AS gross
         FROM revenue_events e
         LEFT JOIN tracks t ON t.id = e.track_id OR t.slug = e.track_id
         LEFT JOIN composers c ON c.id = t.composer_id
        WHERE e.source = 'license' AND e.status != 'refunded' AND ${inRange("e.created_at", 1, 2)}
        GROUP BY c.display_name, c.slug ORDER BY gross DESC LIMIT 8`,
    )
    .bind(since, until)
    .all<{ name: string; slug: string | null; n: number; gross: number }>();

  let activeSubs = { total: 0, pro: 0, max: 0 };
  try {
    const s = await db
      .prepare(
        `SELECT plan, COUNT(*) AS n FROM subscriptions
          WHERE status = 'active' AND plan IN ('pro','max') GROUP BY plan`,
      )
      .all<{ plan: string; n: number }>();
    for (const r of s.results ?? []) {
      if (r.plan === "pro") activeSubs.pro = r.n;
      if (r.plan === "max") activeSubs.max = r.n;
    }
    activeSubs = { ...activeSubs, total: activeSubs.pro + activeSubs.max };
  } catch {
    // no subscriptions table yet
  }

  type RecentRow = {
    id: string;
    source: string;
    gross: number;
    currency: string;
    status: string;
    created_at: string;
    title: string | null;
    track_slug: string | null;
    composer: string | null;
    composer_slug: string | null;
    tier: string | null;
    buyer_id: string | null;
    buyer_name: string | null;
    buyer_email: string | null;
    plan: string | null;
  };
  // Latest 10 overall by default; ?all=1 = every sale of the selected period.
  const allSales = new URL(ctx.request.url).searchParams.get("all") === "1";
  const recentSql = (withPlan: boolean) =>
    `SELECT e.id, e.source, e.gross_cents AS gross, e.currency, e.status, e.created_at,
            t.title, t.slug AS track_slug, c.display_name AS composer, c.slug AS composer_slug,
            o.tier, u.id AS buyer_id, u.name AS buyer_name, u.email AS buyer_email,
            ${withPlan ? "(SELECT s.plan FROM subscriptions s WHERE s.user_id = e.user_id ORDER BY s.rowid DESC LIMIT 1)" : "NULL"} AS plan
       FROM revenue_events e
       LEFT JOIN tracks t ON t.id = e.track_id OR t.slug = e.track_id
       LEFT JOIN composers c ON c.id = t.composer_id
       LEFT JOIN sync_orders o ON o.id = e.order_id
       LEFT JOIN users u ON u.id = e.user_id
      ${allSales ? `WHERE ${inRange("e.created_at", 1, 2)}` : ""}
      ORDER BY e.created_at DESC LIMIT ${allSales ? 1000 : 10}`;
  let recent: RecentRow[] = [];
  try {
    const q = db.prepare(recentSql(true));
    recent = (await (allSales ? q.bind(since, until) : q).all<RecentRow>()).results ?? [];
  } catch {
    const q = db.prepare(recentSql(false));
    recent = (await (allSales ? q.bind(since, until) : q).all<RecentRow>()).results ?? [];
  }

  const first = await db
    .prepare(`SELECT MIN(substr(created_at,1,10)) AS d FROM revenue_events`)
    .first<{ d: string | null }>();
  const series = axisKeys(
    period.chart ? { ...period, from: period.chart.from, to: period.chart.to } : period,
    first?.d ?? null,
  ).map(
    (k) => seriesMap.get(k) ?? { k, license: 0, subscription: 0, sales: 0 },
  );

  // ---- Dashboard extras ----------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const policy = await getPayoutPolicy(db);
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  // Customers = real buyers: not admins / editors / composers, not the owner.
  const customerWhere = `u.role NOT IN ('admin','editor','composer') AND u.email != ?3
     AND NOT EXISTS (SELECT 1 FROM composers c WHERE c.user_id = u.id)`;
  const customers = await safe(
    async () =>
      (
        await db
          .prepare(
            `SELECT COUNT(*) AS n FROM users u
              WHERE (?1 IS NULL OR substr(u.created_at,1,10) < ?1) AND ${customerWhere.replace("?3", "?2")}`,
          )
          .bind(until, OWNER_EMAIL)
          .first<{ n: number }>()
      )?.n ?? 0,
    0,
  );
  const newToday = await safe(
    async () =>
      (
        await db
          .prepare(
            `SELECT COUNT(*) AS n FROM users u
              WHERE substr(u.created_at,1,10) = ?1 AND ${customerWhere.replace("?3", "?2")}`,
          )
          .bind(today, OWNER_EMAIL)
          .first<{ n: number }>()
      )?.n ?? 0,
    0,
  );
  const downloads = await safe(
    async () =>
      (
        await db
          .prepare(`SELECT COUNT(*) AS n FROM download_log WHERE ${inRange("created_at", 1, 2)}`)
          .bind(since, until)
          .first<{ n: number }>()
      )?.n ?? 0,
    0,
  );

  // Income of the period: the store's share (Admin) and every composer.
  // earned = already payable (month past the hold-back), pending = not yet.
  const composerRows = await safe(
    async () =>
      (
        await db
          .prepare(
            `SELECT c.id, c.display_name AS name, c.slug, c.user_id AS user_id,
                    (SELECT COUNT(*) FROM tracks t WHERE t.composer_id = c.id)
                    + (SELECT COUNT(*) FROM sfx x WHERE x.composer_id = c.id) AS tracks
               FROM composers c ORDER BY c.display_name COLLATE NOCASE`,
          )
          .all<{ id: string; name: string | null; slug: string | null; user_id: string | null; tracks: number }>()
      ).results ?? [],
    [] as { id: string; name: string | null; slug: string | null; user_id: string | null; tracks: number }[],
  );
  const allocRows = await safe(
    async () =>
      (
        await db
          .prepare(
            `SELECT a.composer_id AS composer_id, a.month AS month, SUM(a.amount_cents) AS amount
               FROM revenue_allocations a JOIN revenue_events e ON e.id = a.event_id
              WHERE a.kind = 'author' AND e.status = 'allocated' AND ${inRange("e.created_at", 1, 2)}
              GROUP BY a.composer_id, a.month`,
          )
          .bind(since, until)
          .all<{ composer_id: string | null; month: string; amount: number }>()
      ).results ?? [],
    [] as { composer_id: string | null; month: string; amount: number }[],
  );
  const inc = new Map<string, { earned: number; pending: number }>();
  for (const r of allocRows) {
    if (!r.composer_id) continue;
    const e = inc.get(r.composer_id) ?? { earned: 0, pending: 0 };
    if (releaseDateOf(r.month, policy.holdbackDays) <= today) e.earned += r.amount ?? 0;
    else e.pending += r.amount ?? 0;
    inc.set(r.composer_id, e);
  }
  const income = {
    admin: { earned: split.store, pending: split.splitting },
    // Real composers only: a linked account, tracks or sounds, or money. The old demo
    // rows (Composer One/Two/Three: no account, no tracks) stay out.
    composers: composerRows
      .filter((c) => !!c.user_id || c.tracks > 0 || inc.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name ?? "(no name)",
        slug: c.slug,
        earned: inc.get(c.id)?.earned ?? 0,
        pending: inc.get(c.id)?.pending ?? 0,
      })),
  };

  // Needs your attention (not tied to the period).
  const claimsWaiting = await safe(
    async () =>
      (await db.prepare(`SELECT COUNT(*) AS n FROM claim_requests WHERE status <> 'done'`).first<{ n: number }>())?.n ?? 0,
    0,
  );
  const tracksInReview = await safe(
    async () =>
      (await db.prepare(`SELECT COUNT(*) AS n FROM tracks WHERE moderation_status = 'pending'`).first<{ n: number }>())
        ?.n ?? 0,
    0,
  );
  // Composer payouts due: released (past hold-back), unpaid, over the threshold.
  const payoutsDue = await safe(
    async () => {
      const lines =
        (
          await db
            .prepare(
              `SELECT a.month AS month, a.composer_id AS composer_id, SUM(a.amount_cents) AS amount
                 FROM revenue_allocations a
                 LEFT JOIN payout_runs p ON p.month = a.month AND p.composer_id = a.composer_id
                WHERE a.kind = 'author' AND a.composer_id IS NOT NULL
                  AND (p.status IS NULL OR p.status <> 'paid')
                GROUP BY a.month, a.composer_id`,
            )
            .all<{ month: string; composer_id: string; amount: number }>()
        ).results ?? [];
      const released = new Map<string, number>();
      for (const l of lines) {
        if (releaseDateOf(l.month, policy.holdbackDays) > today) continue;
        released.set(l.composer_id, (released.get(l.composer_id) ?? 0) + (l.amount ?? 0));
      }
      let count = 0;
      let amount = 0;
      for (const v of released.values()) {
        if (v > 0 && v >= policy.thresholdCents) {
          count += 1;
          amount += v;
        }
      }
      return { count, amount };
    },
    { count: 0, amount: 0 },
  );

  // What visitors searched for in the period (functions/api/search-log.ts).
  const searches = await safe(
    async () =>
      (
        await db
          .prepare(
            `SELECT lower(query) AS q, COUNT(*) AS n FROM search_log
              WHERE ${inRange("created_at", 1, 2)}
              GROUP BY lower(query) ORDER BY n DESC, MAX(created_at) DESC LIMIT 100`,
          )
          .bind(since, until)
          .all<{ q: string; n: number }>()
      ).results ?? [],
    [] as { q: string; n: number }[],
  );

  return json({
    searches,
    customers,
    newToday,
    downloads,
    income,
    attention: { claimsWaiting, tracksInReview, payoutsDue },
    period: { id: period.id, label: period.label },
    bucket: period.bucket,
    currency: recent[0]?.currency ?? "usd",
    totals,
    previous,
    split,
    activeSubs,
    series,
    byComposer: byComposerRes.results ?? [],
    recent: recent.map((r) => ({
      id: r.id,
      kind: r.source === "subscription" ? "subscription" : "license",
      amountCents: r.gross,
      currency: r.currency,
      refunded: r.status === "refunded",
      at: r.created_at,
      trackTitle: r.title,
      trackSlug: r.track_slug,
      composer: r.composer,
      composerSlug: r.composer_slug,
      tier: r.tier,
      plan: r.plan,
      buyerId: r.buyer_id,
      buyerName: r.buyer_name,
      buyerEmail: r.buyer_email,
    })),
  });
};
