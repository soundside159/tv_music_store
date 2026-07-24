import { getVocabularies, type D1Database, type Env } from "./api/_utils";
import {
  applyGuideSchedule,
  guideBySlug,
  publishedGuides,
  type Guide,
} from "../src/content/guides";

// ---------------------------------------------------------------------------
// EDGE PRERENDER (SEO)
//
// The site is a client-rendered SPA: every URL served the SAME index.html with
// an empty <div id="root">, one generic <title> and no content. Google can run
// JavaScript, so it eventually sees the page — but Bing, Telegram/WhatsApp/X
// link previews, ChatGPT/Perplexity crawlers and most others do NOT. They saw a
// blank shell for every track, artist and tag page.
//
// This middleware fixes that WITHOUT a rebuild step: on every HTML request it
// looks the route up in D1 and rewrites the shell it is about to serve —
//   * <title>, meta description, canonical, OG/Twitter tags   → real values
//   * a <script type="application/ld+json"> block             → schema.org data
//   * the empty #root                                         → real content
//     (h1, description, and links to the tracks/tags of that page)
//
// React then boots and replaces #root with the live app — same content, so this
// is prerendering, not cloaking. Because the HTML is generated per request from
// the database, a new track is fully indexable the second it is published; a
// build-time prerender would go stale until the next deploy.
// ---------------------------------------------------------------------------

interface RwElement {
  setInnerContent(content: string, options?: { html?: boolean }): void;
  setAttribute(name: string, value: string): void;
  append(content: string, options?: { html?: boolean }): void;
}
interface RwHandlers {
  element?: (element: RwElement) => void;
}
declare class HTMLRewriter {
  on(selector: string, handlers: RwHandlers): HTMLRewriter;
  transform(response: Response): Response;
}

interface MiddlewareCtx {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

const SITE = "https://tvmusicstore.com";
// Default share image for every prerendered page (tracks/collections override
// it with their own art): the minimal wide banner — dark graphite + gold logo.
// It used to be the square 512 app ICON, which messengers showed as a white
// logo card while excluded routes (/admin) showed the cinema og-cover — the
// owner unified on the minimal banner 2026-07-24.
const OG_IMAGE = `${SITE}/images/og-cover-2.jpg`;

// The #root prerender is ONLY for agents that don't run JavaScript. Browsers
// used to get it too, and every F5 flashed the SEO track list for a moment
// before React mounted (the owner saw it and reported it as a bug). So the
// body swap is now gated by User-Agent: crawlers, link-preview fetchers and
// AI bots get the real markup; humans get the untouched empty shell — no
// flash, no layout jump. Meta / canonical / JSON-LD rewrites stay for
// EVERYONE (they're invisible), and this is Google's sanctioned "dynamic
// rendering", not cloaking: bots read the same content React renders.
const BOT_UA =
  /bot|crawl|spider|slurp|preview|fetch|scrape|curl|wget|python|httpx|headless|lighthouse|bingpreview|yandex|baidu|duckduck|facebookexternalhit|meta-external|twitterbot|linkedin|whatsapp|telegram|discord|slack|skype|pinterest|embedly|vkshare|qwant|applebot|amazonbot|petalbot|gptbot|chatgpt|oai-search|claude|anthropic|perplexity|ccbot|bytespider|cohere|youbot|phindbot|semrush|ahrefs|mj12|dotbot|screaming|seznam/i;

interface Seo {
  title: string;
  description: string;
  path: string;
  image?: string;
  jsonLd?: Record<string, unknown>;
  /** Real markup dropped into #root — what a JS-less crawler reads. */
  body: string;
}

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const splitValues = (value: string | null) =>
  (value ?? "").split("/").map((item) => item.trim()).filter(Boolean);

// Inline styles only: this block lives for the few hundred ms before React
// takes over, so it must look right without depending on the app's CSS.
const SHELL_STYLE =
  "max-width:1280px;margin:0 auto;padding:120px 24px 80px;color:#fff;font-family:Inter,system-ui,sans-serif";
const H1_STYLE = "font-size:2.4rem;line-height:1.15;margin:0 0 12px";
const P_STYLE = "color:rgba(255,255,255,0.6);max-width:640px;margin:0 0 28px;line-height:1.6";
const LINK_STYLE = "color:#F4C430;text-decoration:none";
const LIST_STYLE = "list-style:none;padding:0;margin:0;line-height:2";

const shell = (heading: string, intro: string, links: string) =>
  `<div style="${SHELL_STYLE}"><h1 style="${H1_STYLE}">${esc(heading)}</h1>` +
  `<p style="${P_STYLE}">${esc(intro)}</p>${links}</div>`;

const linkList = (items: { href: string; label: string }[]) =>
  items.length === 0
    ? ""
    : `<ul style="${LIST_STYLE}">${items
        .map((i) => `<li><a style="${LINK_STYLE}" href="${esc(i.href)}">${esc(i.label)}</a></li>`)
        .join("")}</ul>`;

/**
 * A guide, rendered as real HTML for JS-less crawlers: the answer first, then
 * the sections (with their tables), then the Q&A block. This is the markup an
 * AI answer engine reads — it is the same content React renders a moment later.
 */
const guideBody = (guide: Guide): string => {
  const parts: string[] = [
    `<h1 style="${H1_STYLE}">${esc(guide.h1)}</h1>`,
    `<p style="color:rgba(255,255,255,0.45);margin:0 0 20px">Updated ${esc(guide.updated)} · TV Music Store</p>`,
    `<p style="${P_STYLE};max-width:760px"><strong>${esc(guide.tldr)}</strong></p>`,
  ];

  for (const section of guide.sections) {
    parts.push(`<h2 style="font-size:1.35rem;margin:32px 0 10px">${esc(section.heading)}</h2>`);
    for (const text of section.paragraphs ?? []) {
      parts.push(`<p style="${P_STYLE}">${esc(text)}</p>`);
    }
    if (section.bullets) {
      parts.push(
        `<ul style="color:rgba(255,255,255,0.6);max-width:760px;line-height:1.8">${section.bullets
          .map((item) => `<li>${esc(item)}</li>`)
          .join("")}</ul>`,
      );
    }
    if (section.table) {
      const head = section.table.headers.map((h) => `<th align="left">${esc(h)}</th>`).join("");
      const rows = section.table.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
        .join("");
      parts.push(
        `<table style="border-collapse:collapse;color:rgba(255,255,255,0.7);margin:12px 0 0"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`,
      );
    }
  }

  parts.push(`<h2 style="font-size:1.35rem;margin:36px 0 10px">Frequently asked</h2>`);
  for (const item of guide.faq) {
    parts.push(
      `<h3 style="font-size:1rem;margin:18px 0 4px">${esc(item.q)}</h3><p style="${P_STYLE}">${esc(item.a)}</p>`,
    );
  }

  const related = (guide.related ?? [])
    .map((slug) => guideBySlug(slug))
    .filter((g): g is Guide => !!g);
  if (related.length > 0) {
    parts.push(`<h2 style="font-size:1.35rem;margin:36px 0 10px">Related guides</h2>`);
    parts.push(linkList(related.map((g) => ({ href: `/guides/${g.slug}`, label: g.h1 }))));
  }
  parts.push(
    linkList([
      { href: "/catalog", label: "Browse the music library" },
      { href: "/pricing", label: "See plans and prices" },
    ]),
  );

  return `<div style="${SHELL_STYLE}">${parts.join("")}</div>`;
};

interface TrackRow {
  slug: string;
  title: string;
  description: string | null;
  use_case: string | null;
  genre: string | null;
  mood: string | null;
  duration: string | null;
  bpm: number | null;
  cover: string | null;
  artist: string | null;
  artist_slug: string | null;
}

const TRACK_SELECT = `SELECT t.slug, t.title, t.description, t.use_case, t.genre, t.mood,
        t.duration, t.bpm, t.cover, c.display_name AS artist, c.slug AS artist_slug
   FROM tracks t LEFT JOIN composers c ON c.id = t.composer_id`;
const PUBLISHED = `t.status = 'published' AND t.moderation_status = 'approved'`;

const trackLinks = (rows: TrackRow[]) =>
  linkList(
    rows.map((t) => ({
      href: `/track/${t.slug}`,
      label: t.artist ? `${t.title} — ${t.artist}` : t.title,
    })),
  );

/** Tracks carrying `value` in a facet column (values are "/"-joined). */
const tracksByFacet = async (
  db: D1Database,
  column: "use_case" | "genre" | "mood",
  slug: string,
): Promise<TrackRow[]> => {
  const rows = await db
    .prepare(`${TRACK_SELECT} WHERE ${PUBLISHED} ORDER BY t.created_at DESC LIMIT 300`)
    .all<TrackRow>();
  return rows.results.filter((t) =>
    splitValues(t[column]).some((value) => slugify(value) === slug),
  );
};

const GROUP_COLUMN: Record<string, "use_case" | "genre" | "mood"> = {
  themes: "use_case",
  genres: "genre",
  moods: "mood",
};

const STATIC_PAGES: Record<string, { title: string; description: string; heading: string }> = {
  "/catalog": {
    title: "Music Library — Royalty-Free Cinematic & Production Music | TV Music Store",
    description:
      "Browse the full TV Music Store library: cinematic, trailer, corporate, documentary and game music. Filter by use case, genre and mood. MP3, WAV and stems, cleared for YouTube and commercial use.",
    heading: "Premium Music Library",
  },
  "/collections": {
    title: "Music Collections | TV Music Store",
    description: "Curated collections of royalty-free music for film, ads, games and video.",
    heading: "Collections",
  },
  "/playlists": {
    title: "Music Playlists | TV Music Store",
    description: "Handpicked royalty-free playlists for your exact use case.",
    heading: "Playlists",
  },
  "/pricing": {
    title: "Pricing — Royalty-Free Music Subscriptions | TV Music Store",
    description:
      "Free, Pro and Max plans: unlimited downloads, WAV and stems, and commercial licensing. Or license a single track one-time.",
    heading: "Pricing",
  },
  "/licensing": {
    title: "Licensing — What You Get With Every Track | TV Music Store",
    description:
      "How TV Music Store licensing works: what is covered, where you can use the music, YouTube Content ID claim release and one-time track licenses.",
    heading: "Licensing",
  },
  "/sync": {
    title: "Sync Licensing for Film & TV | TV Music Store",
    description: "Sync licensing and cue sheets for film, television and advertising productions.",
    heading: "Sync Licensing",
  },
  "/custom": {
    title: "Custom Music — Original Score for Your Project | TV Music Store",
    description: "Commission original, exclusive music written for your project.",
    heading: "Custom Music",
  },
};

/**
 * Pulls the owner's guide publication dates (Admin -> Articles) out of D1 and
 * applies them over the schedule baked into the bundle — so moving an article
 * needs no deploy, and the prerendered HTML agrees with what the app shows.
 */
const loadGuideSchedule = async (db: D1Database | undefined): Promise<void> => {
  if (!db) return;
  try {
    const row = await db
      .prepare(`SELECT value FROM site_config WHERE key = 'guide_schedule'`)
      .first<{ value: string }>();
    if (row) applyGuideSchedule(JSON.parse(row.value) as Record<string, string>);
  } catch {
    // no override / no table — the built-in dates stand
  }
};

const buildSeo = async (env: Env, url: URL): Promise<Seo | null> => {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const db = env.DB;

  // ---- Home -------------------------------------------------------------
  if (path === "/") {
    if (!db) return null;
    const rows = await db
      .prepare(`${TRACK_SELECT} WHERE ${PUBLISHED} ORDER BY t.created_at DESC LIMIT 20`)
      .all<TrackRow>();
    return {
      title:
        "TV Music Store — Royalty-Free Cinematic Music Licensing for YouTube, Ads & Film",
      description:
        "Royalty-free cinematic and production music for YouTube, ads, films, trailers and games. Subscriptions with WAV, stems and commercial licensing, plus one-time track licenses.",
      path: "/",
      body: shell(
        "Royalty-Free Cinematic Music",
        "Music for YouTube, advertising, film, trailers and games — licensed for commercial use, in MP3, WAV and stems.",
        trackLinks(rows.results),
      ),
    };
  }

  // ---- Static marketing pages -------------------------------------------
  const staticPage = STATIC_PAGES[path];
  if (staticPage) {
    let links = "";
    if (path === "/catalog" && db) {
      const rows = await db
        .prepare(`${TRACK_SELECT} WHERE ${PUBLISHED} ORDER BY t.created_at DESC LIMIT 60`)
        .all<TrackRow>();
      links = trackLinks(rows.results);
    }
    return {
      title: staticPage.title,
      description: staticPage.description,
      path,
      body: shell(staticPage.heading, staticPage.description, links),
    };
  }

  // ---- /guides (the articles live in the bundle; only the DATES come from D1)
  // Scheduled guides are invisible until their publication date: not listed,
  // not linked, not indexed, no prerendered content.
  if (path === "/guides" || path.startsWith("/guides/")) {
    await loadGuideSchedule(db);
  }
  if (path === "/guides") {
    const live = publishedGuides();
    return {
      title: "Music Licensing Guides — YouTube, Ads, Film & Sync | TV Music Store",
      description:
        "Straight answers about licensing music: YouTube and Content ID, client work, ads, documentaries, sync and cue sheets, and what royalty-free actually means.",
      path: "/guides",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Music licensing guides",
        itemListElement: live.map((g, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE}/guides/${g.slug}`,
          name: g.h1,
        })),
      },
      body: shell(
        "Music licensing, answered",
        "The questions creators, editors and producers actually ask — answered in plain language by the people who write and license the music.",
        linkList(live.map((g) => ({ href: `/guides/${g.slug}`, label: g.h1 }))),
      ),
    };
  }

  const guideMatch = /^\/guides\/([^/]+)$/.exec(path);
  if (guideMatch) {
    const guide = guideBySlug(decodeURIComponent(guideMatch[1]));
    if (!guide) return null;
    return {
      title: `${guide.title} | TV Music Store`,
      description: guide.description,
      path,
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article",
            headline: guide.h1,
            description: guide.description,
            articleBody: guide.tldr,
            datePublished: guide.updated,
            dateModified: guide.updated,
            author: { "@type": "Organization", name: "TV Music Store" },
            publisher: { "@type": "Organization", name: "TV Music Store" },
            mainEntityOfPage: SITE + path,
          },
          {
            "@type": "FAQPage",
            mainEntity: guide.faq.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          },
        ],
      },
      body: guideBody(guide),
    };
  }

  if (!db) return null;

  // ---- /discover hub ----------------------------------------------------
  if (path === "/discover") {
    const vocab = await getVocabularies(db);
    const groups: [string, string[]][] = [
      ["themes", vocab.useCase],
      ["genres", vocab.genre],
      ["moods", vocab.mood],
    ];
    const links = linkList(
      groups.flatMap(([group, values]) =>
        values.map((value) => ({
          href: `/discover/${group}/${slugify(value)}`,
          label: value,
        })),
      ),
    );
    return {
      title: "Discover Royalty-Free Music by Mood, Genre & Use Case | TV Music Store",
      description:
        "Browse the TV Music Store catalogue by mood, genre and use case — cinematic, trailer, corporate, documentary and game music, licensed for YouTube, ads, film and social.",
      path: "/discover",
      body: shell(
        "Browse by mood, genre and use case",
        "Every tag in the library, one click away.",
        links,
      ),
    };
  }

  // ---- /discover/<group>/<tag> -------------------------------------------
  const tagMatch = /^\/discover\/([a-z]+)\/([^/]+)$/.exec(path);
  if (tagMatch) {
    const column = GROUP_COLUMN[tagMatch[1]];
    if (!column) return null;
    const slug = decodeURIComponent(tagMatch[2]).toLowerCase();
    const vocab = await getVocabularies(db);
    const pool =
      column === "use_case" ? vocab.useCase : column === "genre" ? vocab.genre : vocab.mood;
    const rows = await tracksByFacet(db, column, slug);
    const label =
      pool.find((value) => slugify(value) === slug) ??
      splitValues(rows[0]?.[column] ?? "").find((value) => slugify(value) === slug) ??
      slug.replace(/-/g, " ");
    const description = `Download royalty-free ${label.toLowerCase()} music for video, ads, film, games and social.${
      rows.length > 0 ? ` ${rows.length} track${rows.length === 1 ? "" : "s"} —` : ""
    } MP3, WAV and stems, cleared for YouTube and commercial use.`;
    return {
      title: `${label} Music — Royalty-Free ${label} Tracks | TV Music Store`,
      description,
      path,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${label} Music`,
        description,
        url: SITE + path,
      },
      body: shell(`${label} Music`, description, trackLinks(rows.slice(0, 60))),
    };
  }

  // ---- /track/<slug> ------------------------------------------------------
  const trackMatch = /^\/track\/([^/]+)$/.exec(path);
  if (trackMatch) {
    const slug = decodeURIComponent(trackMatch[1]);
    const code = Number(slug.split("-")[0]);
    let row = await db
      .prepare(`${TRACK_SELECT} WHERE t.slug = ?1 LIMIT 1`)
      .bind(slug)
      .first<TrackRow>();
    if (!row && Number.isFinite(code) && code > 0) {
      row = await db
        .prepare(`${TRACK_SELECT} WHERE t.code = ?1 LIMIT 1`)
        .bind(code)
        .first<TrackRow>();
    }
    if (!row) return null;

    const facets = [...splitValues(row.use_case), ...splitValues(row.genre), ...splitValues(row.mood)];
    const description =
      row.description?.trim() ||
      `License "${row.title}" — royalty-free ${facets.join(", ").toLowerCase()} music for YouTube, ads, film and games. MP3, WAV and stems, one-time or subscription licenses.`;
    const tagLinks = linkList([
      ...splitValues(row.use_case).map((v) => ({ href: `/discover/themes/${slugify(v)}`, label: v })),
      ...splitValues(row.genre).map((v) => ({ href: `/discover/genres/${slugify(v)}`, label: v })),
      ...splitValues(row.mood).map((v) => ({ href: `/discover/moods/${slugify(v)}`, label: v })),
      ...(row.artist && row.artist_slug
        ? [{ href: `/artist/${row.artist_slug}`, label: `More by ${row.artist}` }]
        : []),
    ]);

    return {
      title: `${row.title}${row.artist ? ` by ${row.artist}` : ""} — Royalty-Free Music | TV Music Store`,
      description,
      path,
      image: row.cover ? (row.cover.startsWith("http") ? row.cover : SITE + row.cover) : undefined,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "MusicRecording",
        name: row.title,
        url: SITE + path,
        ...(row.artist ? { byArtist: { "@type": "MusicGroup", name: row.artist } } : {}),
        ...(row.duration ? { duration: row.duration } : {}),
        ...(row.genre ? { genre: splitValues(row.genre) } : {}),
        description,
      },
      body: shell(
        row.title,
        `${row.artist ? `by ${row.artist}. ` : ""}${description}`,
        tagLinks,
      ),
    };
  }

  // ---- /artist/<slug> -----------------------------------------------------
  const artistMatch = /^\/artist\/([^/]+)$/.exec(path);
  if (artistMatch) {
    const slug = decodeURIComponent(artistMatch[1]);
    const composer = await db
      .prepare(`SELECT id, slug, display_name, bio FROM composers WHERE slug = ?1 LIMIT 1`)
      .bind(slug)
      .first<{ id: string; slug: string; display_name: string; bio: string | null }>();
    if (!composer) return null;
    const rows = await db
      .prepare(
        `${TRACK_SELECT} WHERE ${PUBLISHED} AND t.composer_id = ?1 ORDER BY t.created_at DESC LIMIT 100`,
      )
      .bind(composer.id)
      .all<TrackRow>();
    const description =
      composer.bio?.trim() ||
      `Royalty-free music by ${composer.display_name} — license tracks for YouTube, ads, film and games.`;
    return {
      title: `${composer.display_name} — Royalty-Free Music | TV Music Store`,
      description,
      path,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "MusicGroup",
        name: composer.display_name,
        url: SITE + path,
        description,
      },
      body: shell(composer.display_name, description, trackLinks(rows.results)),
    };
  }

  // ---- /collection/<id> and /playlist/<id> --------------------------------
  const listMatch = /^\/(collection|playlist)\/([^/]+)$/.exec(path);
  if (listMatch) {
    const kind = listMatch[1];
    const id = decodeURIComponent(listMatch[2]);
    const table = kind === "collection" ? "collections" : "playlists";
    const joinTable = kind === "collection" ? "collection_tracks" : "playlist_tracks";
    const joinKey = kind === "collection" ? "collection_id" : "playlist_id";
    const item = await db
      .prepare(`SELECT id, title, description FROM ${table} WHERE id = ?1 LIMIT 1`)
      .bind(id)
      .first<{ id: string; title: string; description: string | null }>();
    if (!item) return null;
    const rows = await db
      .prepare(
        `${TRACK_SELECT}
           JOIN ${joinTable} j ON j.track_id = t.id
          WHERE ${PUBLISHED} AND j.${joinKey} = ?1
          ORDER BY j.sort LIMIT 200`,
      )
      .bind(id)
      .all<TrackRow>();
    const description =
      item.description?.trim() ||
      `${item.title} — royalty-free music for video, ads, film and games.`;
    return {
      title: `${item.title} — Royalty-Free Music ${kind === "collection" ? "Collection" : "Playlist"} | TV Music Store`,
      description,
      path,
      body: shell(item.title, description, trackLinks(rows.results)),
    };
  }

  return null;
};

export const onRequest = async (ctx: MiddlewareCtx): Promise<Response> => {
  const url = new URL(ctx.request.url);

  // Never touch the API, static assets or private areas — straight through.
  if (
    ctx.request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    /\.[a-z0-9]+$/i.test(url.pathname) ||
    /^\/(account|admin|cart|login|composer)(\/|$)/.test(url.pathname)
  ) {
    return ctx.next();
  }

  const response = await ctx.next();
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;

  let seo: Seo | null = null;
  try {
    seo = await buildSeo(ctx.env, url);
  } catch {
    // A database hiccup must never take the site down — serve the plain shell.
    return response;
  }
  if (!seo) return response;

  const canonical = SITE + seo.path;
  const image = seo.image ?? OG_IMAGE;
  // No/empty UA = a script of some kind — it doesn't run JS, give it the body.
  const ua = ctx.request.headers.get("user-agent") ?? "";
  const wantsPrerenderBody = ua.trim() === "" || BOT_UA.test(ua);
  // The canonical <link> already exists in index.html — it is REWRITTEN below,
  // never appended twice (two canonicals = Google ignores both).
  const head = seo.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(seo.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(seo!.title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute("content", seo!.description);
      },
    })
    .on('meta[property="og:title"], meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute("content", seo!.title);
      },
    })
    .on('meta[property="og:description"], meta[name="twitter:description"]', {
      element(el) {
        el.setAttribute("content", seo!.description);
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute("content", canonical);
      },
    })
    .on('meta[property="og:image"], meta[name="twitter:image"]', {
      element(el) {
        el.setAttribute("content", image);
      },
    })
    // index.html already ships a canonical for "/" — drop it, ours replaces it.
    .on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute("href", canonical);
      },
    })
    .on("head", {
      element(el) {
        if (head) el.append(head, { html: true });
      },
    })
    .on("#root", {
      element(el) {
        // Browsers keep the empty shell — see the BOT_UA comment for why.
        if (wantsPrerenderBody) el.setInnerContent(seo!.body, { html: true });
      },
    })
    .transform(response);
};
