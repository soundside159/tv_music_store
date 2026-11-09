import { getLicensePrices, getVocabularies, type D1Database } from "../_utils";

// ---------------------------------------------------------------------------
// MUSIC SEARCH FOR AI AGENTS (shared by /api/agent/* and the /mcp server).
//
// No language model here on purpose: the caller IS a language model. It gets
// the tag vocabulary (list_tags) and searches by words + filters; scoring is a
// plain keyword match over title, tags and description, done in memory over
// the published catalogue (a few hundred rows, one query). Free and fast.
// Only PUBLISHED tracks: unlisted (link only) and drafts never show up.
// ---------------------------------------------------------------------------

export const SITE = "https://tvmusicstore.com";

interface Row {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  use_case: string | null;
  genre: string | null;
  mood: string | null;
  tags: string | null;
  bpm: number | null;
  duration: string | null;
  cover: string | null;
  artist: string | null;
  created_at: string;
}

export interface SearchArgs {
  query?: string;
  mood?: string;
  genre?: string;
  use_case?: string;
  min_bpm?: number;
  max_bpm?: number;
  min_seconds?: number;
  max_seconds?: number;
  limit?: number;
}

const split = (v: string | null) => (v ?? "").split("/").map((x) => x.trim()).filter(Boolean);
const abs = (u: string | null) => (!u ? null : u.startsWith("http") ? u : SITE + u);
const seconds = (d: string | null): number | null => {
  if (!d) return null;
  const p = d.split(":").map(Number);
  if (p.some((n) => !Number.isFinite(n))) return null;
  return p.reduce((a, n) => a * 60 + n, 0);
};

export const licences = async (db: D1Database) => {
  const p = await getLicensePrices(db);
  return [
    { name: "Personal", price_usd: p.personal, one_time: true,
      covers: "Personal and hobby use, YouTube and social media (monetized OK), podcasts, non-profit. MP3 + WAV." },
    { name: "Commercial", price_usd: p.commercial, one_time: true,
      covers: "Business use, client and freelance work, paid ads and sponsored content. MP3 + WAV + stems." },
    { name: "Professional", price_usd: p.professional, one_time: true,
      covers: "Everything in Commercial plus TV and radio broadcast, streaming/VOD, films, trailers, games and apps. MP3 + WAV + stems." },
  ];
};

const loadCatalogue = async (db: D1Database) => {
  const rows = await db
    .prepare(
      `SELECT t.id, t.slug, t.title, t.description, t.use_case, t.genre, t.mood, t.tags, t.bpm, t.duration,
              t.cover, t.created_at, c.display_name AS artist
         FROM tracks t LEFT JOIN composers c ON c.id = t.composer_id
        WHERE t.status = 'published' AND t.moderation_status = 'approved'`,
    )
    .all<Row>();
  const previews = new Map<string, string>();
  try {
    const v = await db
      .prepare(`SELECT track_id, preview_src FROM track_versions ORDER BY sort ASC`)
      .all<{ track_id: string; preview_src: string }>();
    for (const r of v.results) if (!previews.has(r.track_id) && r.preview_src) previews.set(r.track_id, r.preview_src);
  } catch {
    // no versions table: no previews
  }
  return { rows: rows.results, previews };
};

const card = (r: Row, preview: string | null) => ({
  title: r.title,
  artist: r.artist,
  url: `${SITE}/track/${r.slug}`,
  preview_mp3: abs(preview),
  cover: abs(r.cover),
  length: r.duration,
  bpm: r.bpm,
  genre: split(r.genre),
  mood: split(r.mood),
  use_case: split(r.use_case),
  description: r.description,
});

export const searchMusic = async (db: D1Database, a: SearchArgs) => {
  const { rows, previews } = await loadCatalogue(db);
  const words = (a.query ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const want = (field: string | null, v?: string) =>
    !v || split(field).some((x) => x.toLowerCase().includes(v.toLowerCase().trim()));
  const scored: { r: Row; s: number }[] = [];
  for (const r of rows) {
    if (!want(r.mood, a.mood) || !want(r.genre, a.genre) || !want(r.use_case, a.use_case)) continue;
    if (a.min_bpm && !(r.bpm && r.bpm >= a.min_bpm)) continue;
    if (a.max_bpm && !(r.bpm && r.bpm <= a.max_bpm)) continue;
    const sec = seconds(r.duration);
    if (a.min_seconds && !(sec !== null && sec >= a.min_seconds)) continue;
    if (a.max_seconds && !(sec !== null && sec <= a.max_seconds)) continue;
    let s = 0;
    if (words.length) {
      const title = r.title.toLowerCase();
      const facets = [r.use_case, r.genre, r.mood].join(" ").toLowerCase();
      const rest = `${r.tags ?? ""} ${r.description ?? ""} ${r.artist ?? ""}`.toLowerCase();
      for (const w of words) {
        if (title.includes(w)) s += 3;
        if (facets.includes(w)) s += 2;
        if (rest.includes(w)) s += 1;
      }
      if (s === 0) continue;
    }
    scored.push({ r, s });
  }
  scored.sort((x, y) => y.s - x.s || (x.r.created_at < y.r.created_at ? 1 : -1));
  const limit = Math.min(Math.max(Number(a.limit) || 10, 1), 25);
  return {
    total_matches: scored.length,
    tracks: scored.slice(0, limit).map(({ r }) => card(r, previews.get(r.id) ?? null)),
    how_to_license:
      `Open the track url: the person picks a one-time licence (Personal / Commercial / Professional) or a subscription (${SITE}/pricing). ` +
      "A licence certificate with a licence number comes with every purchase.",
  };
};

export const getTrack = async (db: D1Database, slugOrUrl: string) => {
  const slug = slugOrUrl.replace(/^.*\/track\//, "").replace(/[?#].*$/, "").trim();
  if (!slug) return null;
  const { rows, previews } = await loadCatalogue(db);
  const code = Number(slug.split("-")[0]);
  const r = rows.find((x) => x.slug === slug) ?? rows.find((x) => Number.isFinite(code) && x.slug.startsWith(`${code}-`));
  if (!r) return null;
  return { ...card(r, previews.get(r.id) ?? null), licences: await licences(db) };
};

export const listTags = async (db: D1Database) => {
  const v = await getVocabularies(db);
  return { mood: v.mood, genre: v.genre, use_case: v.useCase };
};

export const LICENSING_INFO = {
  one_time_licences: "Personal, Commercial, Professional: pay once per track, lifetime. Bought on the track page.",
  subscriptions: {
    free: "3 MP3 downloads a month, attribution required",
    pro: "$12/month ($7/month billed yearly): unlimited downloads, personal and small-team use, social media, YouTube, podcasts",
    max: "$29/month ($15/month billed yearly): adds commercial use (ads, client work), WAV and stems",
  },
  films_tv_streaming: "Films, trailers, TV and streaming need the one-time Professional licence; subscriptions do not cover them.",
  youtube_content_id:
    "Tracks are registered in Content ID by their composers. If a claim appears, the customer sends the video link in their account (Copyright Claims) and it is sent for release within one business day. Pro and Max can whitelist YouTube channels: new videos are checked and claims sent for release automatically.",
  catalogue: "Non-exclusive production music written by the store's composers.",
  pricing_page: `${SITE}/pricing`,
  license_terms: `${SITE}/license-terms`,
};
