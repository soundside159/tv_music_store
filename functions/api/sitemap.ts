import { getVocabularies, type Ctx } from "../_utils";

// Dynamic half of the sitemap: every tag landing page (/discover/...), every
// track, artist, collection and playlist. public/sitemap.xml is the INDEX that
// points here and to the static page list, so Google finds both.
//
// Kept out of public/ on purpose: vocabularies, tracks and composers change in
// the admin, and a hand-written file would go stale the same day.

const SITE = "https://tvmusicstore.com";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const url = (path: string, changefreq: string, priority: string) =>
  `  <url><loc>${xmlEscape(SITE + path)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

export const onRequestGet = async (ctx: Ctx) => {
  const lines: string[] = [url("/discover", "weekly", "0.8")];

  if (ctx.env.DB) {
    const db = ctx.env.DB;

    // Tag pages — from the live (admin-editable) vocabularies.
    try {
      const vocab = await getVocabularies(db);
      const groups: [string, string[]][] = [
        ["themes", vocab.useCase],
        ["genres", vocab.genre],
        ["moods", vocab.mood],
      ];
      for (const [group, values] of groups) {
        for (const value of values) {
          const slug = slugify(value);
          if (slug) lines.push(url(`/discover/${group}/${slug}`, "weekly", "0.8"));
        }
      }
    } catch {
      // vocabularies unreadable — the static pages still ship
    }

    // Published tracks.
    try {
      const rows = await db
        .prepare(
          `SELECT slug FROM tracks
            WHERE status = 'published' AND moderation_status = 'approved'
            ORDER BY created_at DESC LIMIT 5000`,
        )
        .all<{ slug: string }>();
      for (const t of rows.results) lines.push(url(`/track/${t.slug}`, "weekly", "0.7"));
    } catch {
      // tracks table missing
    }

    // Composer pages.
    try {
      const rows = await db.prepare(`SELECT slug FROM composers`).all<{ slug: string }>();
      for (const c of rows.results) lines.push(url(`/artist/${c.slug}`, "monthly", "0.6"));
    } catch {
      // composers table missing
    }

    // Collections + playlists.
    try {
      const rows = await db.prepare(`SELECT id FROM collections`).all<{ id: string }>();
      for (const c of rows.results) lines.push(url(`/collection/${c.id}`, "weekly", "0.6"));
    } catch {
      // collections table missing
    }
    try {
      const rows = await db.prepare(`SELECT id FROM playlists`).all<{ id: string }>();
      for (const p of rows.results) lines.push(url(`/playlist/${p.id}`, "weekly", "0.6"));
    } catch {
      // playlists table missing
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${lines.join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
