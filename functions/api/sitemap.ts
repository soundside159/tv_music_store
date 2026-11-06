import { getVocabularies, type Ctx } from "./_utils";
import { applyGuideSchedule, publishedGuides } from "../../src/content/guides";

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

// lastmod (YYYY-MM-DD) is the field Google actually uses to decide what to
// re-crawl; changefreq/priority are ignored by it but harmless for others.
const url = (path: string, changefreq: string, priority: string, lastmod?: string | null) =>
  `  <url><loc>${xmlEscape(SITE + path)}</loc>${
    lastmod && /^\d{4}-\d{2}-\d{2}/.test(lastmod) ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""
  }<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

export const onRequestGet = async (ctx: Ctx) => {
  // The owner's publication dates (Admin -> Articles) override the built-in ones.
  if (ctx.env.DB) {
    try {
      const row = await ctx.env.DB
        .prepare(`SELECT value FROM site_config WHERE key = 'guide_schedule'`)
        .first<{ value: string }>();
      if (row) applyGuideSchedule(JSON.parse(row.value) as Record<string, string>);
    } catch {
      // no override — built-in schedule stands
    }
  }

  const live = publishedGuides();
  const newestGuide = live.map((g) => g.updated).sort().pop();
  const lines: string[] = [
    url("/discover", "weekly", "0.8"),
    url("/guides", "weekly", "0.8", newestGuide),
    // The answer library — these are the pages AI engines and Google quote.
    // Only RELEASED guides: a scheduled one must not be advertised before it exists.
    ...live.map((guide) => url(`/guides/${guide.slug}`, "monthly", "0.8", guide.updated)),
  ];

  if (ctx.env.DB) {
    const db = ctx.env.DB;

    // Tag pages — from the live (admin-editable) vocabularies.
    try {
      const vocab = await getVocabularies(db);
      // Only tags with real music behind them: a near-empty tag page is thin
      // content (served noindex by functions/_middleware.ts, same threshold).
      const MIN_TAG_TRACKS = 3;
      const tagRows = await db
        .prepare(
          `SELECT use_case, genre, mood FROM tracks
            WHERE status = 'published' AND moderation_status = 'approved'`,
        )
        .all<{ use_case: string | null; genre: string | null; mood: string | null }>();
      const counts: Record<string, Map<string, number>> = {
        themes: new Map(),
        genres: new Map(),
        moods: new Map(),
      };
      const bump = (group: string, raw: string | null) => {
        for (const v of (raw ?? "").split("/")) {
          const slug = slugify(v);
          if (slug) counts[group].set(slug, (counts[group].get(slug) ?? 0) + 1);
        }
      };
      for (const t of tagRows.results) {
        bump("themes", t.use_case);
        bump("genres", t.genre);
        bump("moods", t.mood);
      }
      const groups: [string, string[]][] = [
        ["themes", vocab.useCase],
        ["genres", vocab.genre],
        ["moods", vocab.mood],
      ];
      for (const [group, values] of groups) {
        const seen = new Set<string>();
        for (const value of values) {
          const slug = slugify(value);
          if (!slug || seen.has(slug)) continue;
          seen.add(slug);
          if ((counts[group].get(slug) ?? 0) >= MIN_TAG_TRACKS) {
            lines.push(url(`/discover/${group}/${slug}`, "weekly", "0.8"));
          }
        }
      }
    } catch {
      // vocabularies unreadable — the static pages still ship
    }

    // Published tracks.
    try {
      const rows = await db
        .prepare(
          `SELECT slug, COALESCE(publish_at, created_at) AS since FROM tracks
            WHERE status = 'published' AND moderation_status = 'approved'
            ORDER BY created_at DESC LIMIT 5000`,
        )
        .all<{ slug: string; since: string | null }>();
      for (const t of rows.results) lines.push(url(`/track/${t.slug}`, "weekly", "0.7", t.since));
    } catch {
      // tracks table missing
    }

    // Sound effects: the landing page + every category that has published sounds.
    try {
      const rows = await db
        .prepare(
          `SELECT c.id, MAX(s.created_at) AS newest
             FROM sfx_categories c
             JOIN sfx s ON s.category_id = c.id AND s.status = 'published'
            GROUP BY c.id ORDER BY c.sort, c.title`,
        )
        .all<{ id: string; newest: string | null }>();
      if (rows.results.length > 0) {
        const newest = rows.results.map((r) => r.newest ?? "").sort().pop();
        lines.push(url("/sound-effects", "weekly", "0.8", newest));
        for (const c of rows.results) {
          lines.push(url(`/sound-effects/${encodeURIComponent(c.id)}`, "weekly", "0.7", c.newest));
        }
      }
    } catch {
      // sfx tables missing
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
      // Only collections customers can see (5+ tracks, same rule as the site).
      const rows = await db
        .prepare(
          `SELECT c.id FROM collections c
            WHERE (SELECT COUNT(*) FROM collection_tracks j WHERE j.collection_id = c.id) >= 5`,
        )
        .all<{ id: string }>();
      for (const c of rows.results) lines.push(url(`/collection/${c.id}`, "weekly", "0.6"));
    } catch {
      // collections table missing
    }
    try {
      const rows = await db
        .prepare(
          `SELECT p.id FROM playlists p
            WHERE (SELECT COUNT(*) FROM playlist_tracks j WHERE j.playlist_id = p.id) >= 5`,
        )
        .all<{ id: string }>();
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
