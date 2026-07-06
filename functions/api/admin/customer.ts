import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "../_utils";

// GET /api/admin/customer?id=<userId> — admin only.
// Full customer profile: identity, subscription history, purchases, recent
// downloads, whitelisted channels, and an aggregated "taste" (top genres / moods
// / use-cases from the tracks they engaged with) to power targeted marketing.

const prettify = (s: string) =>
  s.replace(/^trk_/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const tally = (rows: { genre: string | null; mood: string | null; use_case: string | null }[]) => {
  const bump = (map: Map<string, number>, val: string | null) => {
    if (!val) return;
    for (const part of val.split(/\s*\/\s*/)) {
      const v = part.trim();
      if (v) map.set(v, (map.get(v) ?? 0) + 1);
    }
  };
  const g = new Map<string, number>();
  const m = new Map<string, number>();
  const u = new Map<string, number>();
  for (const r of rows) {
    bump(g, r.genre);
    bump(m, r.mood);
    bump(u, r.use_case);
  }
  const top = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count }));
  return { genres: top(g), moods: top(m), useCases: top(u) };
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const admin = await getSessionUser(ctx);
  if (!admin) return json({ error: "Not signed in" }, 401);
  if (admin.role !== "admin" && admin.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }

  const db = ctx.env.DB;
  const id = new URL(ctx.request.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  const user = await db
    .prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?1`)
    .bind(id)
    .first<{ id: string; email: string; name: string | null; role: string; created_at: string }>();
  if (!user) return json({ error: "Customer not found" }, 404);

  const subs = await db
    .prepare(
      `SELECT plan, status, interval, current_period_end FROM subscriptions
        WHERE user_id = ?1 ORDER BY rowid DESC`,
    )
    .bind(id)
    .all<{ plan: string; status: string | null; interval: string | null; current_period_end: string | null }>();

  const purchases = await db
    .prepare(
      `SELECT o.id, o.tier, o.price, o.created_at, o.track_id, t.title AS track_title
         FROM sync_orders o LEFT JOIN tracks t ON t.id = o.track_id
        WHERE o.user_id = ?1 ORDER BY o.created_at DESC`,
    )
    .bind(id)
    .all<{ id: string; tier: string; price: number; created_at: string; track_id: string; track_title: string | null }>();

  const downloads = await db
    .prepare(
      `SELECT d.track_id, d.format, d.plan_at_download, d.created_at, t.title AS track_title
         FROM download_log d LEFT JOIN tracks t ON t.id = d.track_id
        WHERE d.user_id = ?1 ORDER BY d.created_at DESC LIMIT 100`,
    )
    .bind(id)
    .all<{ track_id: string; format: string; plan_at_download: string; created_at: string; track_title: string | null }>();

  const dlCount = await db
    .prepare(`SELECT COUNT(*) AS n FROM download_log WHERE user_id = ?1`)
    .bind(id)
    .first<{ n: number }>();

  let channels: { channel_url: string }[] = [];
  try {
    const wl = await db
      .prepare(`SELECT channel_url FROM whitelist_channels WHERE user_id = ?1 ORDER BY added_at DESC`)
      .bind(id)
      .all<{ channel_url: string }>();
    channels = wl.results;
  } catch {
    // table not created yet
  }

  // Taste: tracks the customer downloaded or bought.
  const trackIds = Array.from(
    new Set([...downloads.results.map((d) => d.track_id), ...purchases.results.map((p) => p.track_id)]),
  ).slice(0, 200);
  let taste = { genres: [], moods: [], useCases: [] } as ReturnType<typeof tally>;
  if (trackIds.length) {
    const ph = trackIds.map((_, i) => `?${i + 1}`).join(",");
    const trows = await db
      .prepare(`SELECT genre, mood, use_case FROM tracks WHERE id IN (${ph})`)
      .bind(...trackIds)
      .all<{ genre: string | null; mood: string | null; use_case: string | null }>();
    taste = tally(trows.results);
  }

  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? "",
      role: user.role,
      memberSince: user.created_at,
    },
    subscriptions: subs.results,
    purchases: purchases.results.map((p) => ({
      id: p.id,
      tier: p.tier,
      price: p.price,
      createdAt: p.created_at,
      trackTitle: p.track_title ?? prettify(p.track_id),
    })),
    downloads: downloads.results.map((d) => ({
      format: d.format,
      plan: d.plan_at_download,
      createdAt: d.created_at,
      trackTitle: d.track_title ?? prettify(d.track_id),
    })),
    downloadTotal: dlCount?.n ?? 0,
    channels: channels.map((c) => c.channel_url),
    taste,
  });
};
