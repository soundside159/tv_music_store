import { getSessionUser, json, type Ctx } from "./_utils";

// GET -> the signed-in user's download history (latest 100), with track titles.

const prettify = (idOrSlug: string) =>
  idOrSlug
    .replace(/^trk_/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound. See docs/SETUP_BACKEND.md" }, 503);

  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  // ONE ROW PER TRACK — the newest download of it. A customer who re-downloaded
  // the same track four times wants his library, not a log file.
  const rows = await ctx.env.DB.prepare(
    `SELECT d.id, d.track_id, d.composer_id, d.plan_at_download, d.format, d.created_at,
            t.title AS track_title, t.slug AS track_slug
       FROM download_log d
       LEFT JOIN tracks t ON t.id = d.track_id
      WHERE d.user_id = ?1
        AND d.id = (
          SELECT MAX(d2.id) FROM download_log d2
           WHERE d2.user_id = d.user_id AND d2.track_id = d.track_id
        )
      ORDER BY d.created_at DESC
      LIMIT 200`,
  )
    .bind(user.id)
    .all<{
      id: number;
      track_id: string;
      composer_id: string | null;
      plan_at_download: string;
      format: string;
      created_at: string;
      track_title: string | null;
      track_slug: string | null;
    }>();

  return json({
    downloads: rows.results.map((r) => ({
      id: String(r.id),
      trackId: r.track_id,
      composerId: r.composer_id ?? "",
      planAtDownload: r.plan_at_download,
      format: r.format,
      createdAt: r.created_at,
      trackTitle: r.track_title ?? prettify(r.track_id),
      trackSlug: r.track_slug ?? "",
    })),
  });
};
