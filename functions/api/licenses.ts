import { getSessionUser, json, type Ctx } from "./_utils";

// GET -> the signed-in user's one-time sync licenses (sync_orders), newest
// first, with track titles resolved via a LEFT JOIN (falls back to a prettified
// id/slug when the track row is gone).

const prettify = (idOrSlug: string) =>
  idOrSlug
    .replace(/^trk_/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  // A refunded licence STAYS in the list — plainly marked, with its download and
  // certificate buttons gone. Hiding it would just make the customer wonder
  // where his purchase went; showing it says exactly what happened.
  // (Older DBs have no `status` column — COALESCE keeps them working.)
  const rows = await ctx.env.DB.prepare(
    `SELECT o.id, o.track_id, o.tier, o.price, o.license_r2_key, o.created_at,
            COALESCE(o.status, 'active') AS status,
            t.title AS track_title, t.slug AS track_slug
       FROM sync_orders o
       LEFT JOIN tracks t ON t.id = o.track_id
      WHERE o.user_id = ?1
      ORDER BY o.created_at DESC
      LIMIT 200`,
  )
    .bind(user.id)
    .all<{
      id: string;
      track_id: string;
      tier: string;
      price: number;
      license_r2_key: string | null;
      created_at: string;
      status: string;
      track_title: string | null;
      track_slug: string | null;
    }>();

  return json({
    licenses: rows.results.map((r) => ({
      id: r.id,
      trackId: r.track_id,
      trackTitle: r.track_title ?? prettify(r.track_id),
      trackSlug: r.track_slug ?? undefined,
      tier: r.tier,
      price: r.price,
      // Refunded: no file, no certificate — the rights went back with the money.
      hasPdf: r.status !== "refunded" && !!r.license_r2_key,
      refunded: r.status === "refunded",
      createdAt: r.created_at,
    })),
  });
};
