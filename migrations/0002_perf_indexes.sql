-- TVMUSICSTORE — perf indexes (cut D1 rows_read; Cloudflare enforces the free
-- daily limits from 2026-09-01 and this account got the warning email 2026-08-26).
-- Apply: npx wrangler d1 execute tvmusicstore-db --remote --file=./migrations/0002_perf_indexes.sql
--
-- Why: the SEO middleware (functions/_middleware.ts) runs on every HTML page
-- view — bots included — and its "published tracks, newest first, LIMIT n"
-- queries had no matching index, so every page view scanned and sorted the
-- WHOLE tracks table. Same story for /artist pages (filter by composer_id),
-- the /track/<slug> numeric-code fallback, and the per-track download counts
-- in /api/tracks. With these indexes the queries read only the rows they use.

-- Serves: WHERE status='published' AND moderation_status='approved'
--         ORDER BY created_at DESC LIMIT n   (home, /catalog, sitemap, facets)
CREATE INDEX IF NOT EXISTS idx_tracks_pub_created
  ON tracks(status, moderation_status, created_at DESC);

-- /track/<slug> falls back to a lookup by numeric code — was a full scan.
CREATE INDEX IF NOT EXISTS idx_tracks_code ON tracks(code);

-- /artist/<slug> lists that composer's tracks — was a full scan.
CREATE INDEX IF NOT EXISTS idx_tracks_composer ON tracks(composer_id);

-- /api/tracks aggregates download counts per track on every catalog load.
CREATE INDEX IF NOT EXISTS idx_dl_track ON download_log(track_id);
