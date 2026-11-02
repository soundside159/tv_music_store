import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";
import { ensureRevenueTables } from "../_revenue";

// Admin -> Dashboard "Sales" block. One read-only call:
//   GET /api/admin/sales?days=30|90|365
// -> totals for the window and the window before it (for the +/- %),
//    a per-day (or per-month for 365) series split license / subscription,
//    license sales grouped by composer, active paid subscribers and the
//    latest payments with track, licence tier, composer and buyer.
// Money = gross cents straight from the revenue ledger; refunded rows are
// left out of every total and only flagged in the "latest" list.

const RANGES = [30, 90, 365];

const isoDay = (offsetDays: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
};

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

  const asked = Number(new URL(ctx.request.url).searchParams.get("days"));
  const days = RANGES.includes(asked) ? asked : 30;
  const since = isoDay(days - 1);
  const prevSince = isoDay(days * 2 - 1);
  const bucketLen = days > 90 ? 7 : 10; // month buckets for the 12-month view

  type TotRow = { source: string; n: number; gross: number; net: number };
  const totalsFor = async (from: string, to: string | null) => {
    const res = await db
      .prepare(
        `SELECT source, COUNT(*) AS n, COALESCE(SUM(gross_cents),0) AS gross, COALESCE(SUM(net_cents),0) AS net
           FROM revenue_events
          WHERE status != 'refunded' AND substr(created_at,1,10) >= ?1
            AND (?2 IS NULL OR substr(created_at,1,10) < ?2)
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

  const totals = await totalsFor(since, null);
  const previous = await totalsFor(prevSince, since);

  const seriesRes = await db
    .prepare(
      `SELECT substr(created_at,1,?2) AS k, source, COALESCE(SUM(gross_cents),0) AS gross, COUNT(*) AS n
         FROM revenue_events
        WHERE status != 'refunded' AND substr(created_at,1,10) >= ?1
        GROUP BY k, source ORDER BY k`,
    )
    .bind(since, bucketLen)
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
        WHERE e.source = 'license' AND e.status != 'refunded' AND substr(e.created_at,1,10) >= ?1
        GROUP BY c.display_name, c.slug ORDER BY gross DESC LIMIT 8`,
    )
    .bind(since)
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
    buyer_name: string | null;
    buyer_email: string | null;
    plan: string | null;
  };
  const recentSql = (withPlan: boolean) =>
    `SELECT e.id, e.source, e.gross_cents AS gross, e.currency, e.status, e.created_at,
            t.title, t.slug AS track_slug, c.display_name AS composer, c.slug AS composer_slug,
            o.tier, u.name AS buyer_name, u.email AS buyer_email,
            ${withPlan ? "(SELECT s.plan FROM subscriptions s WHERE s.user_id = e.user_id ORDER BY s.rowid DESC LIMIT 1)" : "NULL"} AS plan
       FROM revenue_events e
       LEFT JOIN tracks t ON t.id = e.track_id OR t.slug = e.track_id
       LEFT JOIN composers c ON c.id = t.composer_id
       LEFT JOIN sync_orders o ON o.id = e.order_id
       LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.created_at DESC LIMIT 10`;
  let recent: RecentRow[] = [];
  try {
    recent = (await db.prepare(recentSql(true)).all<RecentRow>()).results ?? [];
  } catch {
    recent = (await db.prepare(recentSql(false)).all<RecentRow>()).results ?? [];
  }

  return json({
    days,
    bucket: bucketLen === 7 ? "month" : "day",
    currency: recent[0]?.currency ?? "usd",
    totals,
    previous,
    activeSubs,
    series: [...seriesMap.values()],
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
      buyerName: r.buyer_name,
      buyerEmail: r.buyer_email,
    })),
  });
};
