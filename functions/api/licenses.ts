import { getSessionUser, json, type Ctx } from "./_utils";
import { ensurePlanLicensesTable } from "./_licenses";

// GET /api/licenses — every track this customer is licensed to use.
//
// TWO kinds, one list (tunetank-style):
//   • subscription — a code minted per TRACK when a paying subscriber downloads
//     it (plan_licenses). The code carries the plan and the period it was issued
//     in, so the admin can look it up and see both the track and the subscription
//     behind it.
//   • one-time     — a track bought outright (sync_orders). Refunded ones stay in
//     the list, marked, with their buttons gone.

const prettify = (idOrSlug: string) =>
  idOrSlug
    .replace(/^trk_/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);
  const db = ctx.env.DB;

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  await ensurePlanLicensesTable(db);

  // --- bought outright ------------------------------------------------------
  const orders = await db
    .prepare(
      `SELECT o.id, o.track_id, o.tier, o.price, o.created_at,
              COALESCE(o.status, 'active') AS status,
              t.title AS track_title, t.slug AS track_slug,
              t.cover_thumb AS cover_thumb, t.cover AS cover
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
      created_at: string;
      status: string;
      track_title: string | null;
      track_slug: string | null;
      cover_thumb: string | null;
      cover: string | null;
    }>();

  const boughtTrackIds = new Set(orders.results.map((o) => o.track_id));

  // --- covered by the subscription -----------------------------------------
  const plan = await db
    .prepare(
      `SELECT p.id AS code, p.track_id, p.plan, p.plan_period_end, p.created_at,
              t.title AS track_title, t.slug AS track_slug,
              t.cover_thumb AS cover_thumb, t.cover AS cover
         FROM plan_licenses p
         LEFT JOIN tracks t ON t.id = p.track_id
        WHERE p.user_id = ?1
        ORDER BY p.created_at DESC
        LIMIT 300`,
    )
    .bind(user.id)
    .all<{
      code: string;
      track_id: string;
      plan: string;
      plan_period_end: string | null;
      created_at: string;
      track_title: string | null;
      track_slug: string | null;
      cover_thumb: string | null;
      cover: string | null;
    }>();

  const licenses = [
    ...orders.results.map((o) => ({
      id: o.id,
      kind: "one-time" as const,
      code: o.id,
      trackId: o.track_id,
      trackTitle: o.track_title ?? prettify(o.track_id),
      trackSlug: o.track_slug ?? undefined,
      cover: o.cover_thumb || o.cover || undefined,
      tier: o.tier,
      price: o.price,
      refunded: o.status === "refunded",
      issuedAt: o.created_at,
      pdfHref: `/api/license-pdf?order=${encodeURIComponent(o.id)}`,
    })),
    // A track that was BOUGHT is shown once — the purchase wins, it is the
    // stronger licence.
    ...plan.results
      .filter((p) => !boughtTrackIds.has(p.track_id))
      .map((p) => ({
        id: p.code,
        kind: "subscription" as const,
        code: p.code,
        trackId: p.track_id,
        trackTitle: p.track_title ?? prettify(p.track_id),
        trackSlug: p.track_slug ?? undefined,
        cover: p.cover_thumb || p.cover || undefined,
        tier: p.plan,
        price: 0,
        refunded: false,
        issuedAt: p.created_at,
        periodEnd: p.plan_period_end,
        pdfHref: `/api/license-pdf?track=${encodeURIComponent(p.track_id)}`,
      })),
  ].sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));

  return json({ licenses });
};
