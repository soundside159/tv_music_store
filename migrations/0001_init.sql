-- TVMUSICSTORE — D1 schema V2 (subscription model, 3 composers)
-- Apply: npx wrangler d1 execute tvmusicstore-db --remote --file=./migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'customer', -- customer | composer | admin
  google_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_email ON auth_codes(email);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS composers (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  styles TEXT, -- JSON array
  payout_details TEXT,
  revenue_weight REAL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  composer_id TEXT REFERENCES composers(id),
  category TEXT NOT NULL,
  genre TEXT,
  mood TEXT,
  use_case TEXT,
  style_of TEXT,
  bpm INTEGER,
  duration TEXT,
  description TEXT,
  tags TEXT, -- JSON array
  has_stems INTEGER NOT NULL DEFAULT 0,
  moderation_status TEXT NOT NULL DEFAULT 'approved', -- pending | approved | rejected
  status TEXT NOT NULL DEFAULT 'published', -- draft | scheduled | published
  publish_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS track_versions (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id),
  version_id TEXT NOT NULL, -- full | short | 60s | ...
  label TEXT NOT NULL,
  duration TEXT,
  preview_src TEXT NOT NULL, -- public MP3 preview path
  r2_key_wav TEXT,           -- private master (later)
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_versions_track ON track_versions(track_id);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  short_title TEXT,
  description TEXT,
  image TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS collection_tracks (
  collection_id TEXT NOT NULL REFERENCES collections(id),
  track_id TEXT NOT NULL REFERENCES tracks(id),
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, track_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  image TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id),
  track_id TEXT NOT NULL REFERENCES tracks(id),
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS plan_config (
  id TEXT PRIMARY KEY, -- free | pro | max
  name TEXT NOT NULL,
  price_monthly REAL NOT NULL,
  price_annual_per_month REAL NOT NULL,
  download_limit INTEGER, -- NULL = unlimited
  wav_and_stems INTEGER NOT NULL DEFAULT 0,
  commercial_license INTEGER NOT NULL DEFAULT 0,
  whitelist_slots INTEGER NOT NULL DEFAULT 0,
  priority_support INTEGER NOT NULL DEFAULT 0,
  stripe_price_monthly TEXT, -- Stripe price ids, filled later
  stripe_price_annual TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  stripe_sub_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  interval TEXT, -- monthly | annual | NULL for free
  status TEXT NOT NULL DEFAULT 'active', -- active | canceled | past_due
  current_period_end TEXT
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS download_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  track_id TEXT NOT NULL,
  composer_id TEXT,
  plan_at_download TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'mp3', -- mp3 | wav | stems
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dl_user ON download_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dl_composer ON download_log(composer_id, created_at);

CREATE TABLE IF NOT EXISTS whitelist_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claim_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  track_id TEXT,
  composer_id TEXT,
  video_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', -- new | in_progress | done
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS payout_periods (
  id TEXT PRIMARY KEY, -- pp_2026-07
  month TEXT NOT NULL UNIQUE,
  net_revenue REAL NOT NULL DEFAULT 0,
  platform_share REAL NOT NULL DEFAULT 0,
  author_pool REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' -- draft | final | paid
);

CREATE TABLE IF NOT EXISTS payout_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id TEXT NOT NULL REFERENCES payout_periods(id),
  composer_id TEXT NOT NULL REFERENCES composers(id),
  downloads_count INTEGER NOT NULL DEFAULT 0,
  weighted_points REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  statement_r2_key TEXT
);

CREATE TABLE IF NOT EXISTS sync_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  track_id TEXT NOT NULL,
  tier TEXT NOT NULL, -- standard | broadcast
  price REAL NOT NULL,
  stripe_session_id TEXT,
  license_r2_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Persistent, signed license codes for subscription (plan) certificates.
-- One code per (user, track, plan); minted by functions/api/_licenses.ts.
-- Also created lazily at runtime, so this is only needed for fresh DBs.
CREATE TABLE IF NOT EXISTS plan_licenses (
  id TEXT PRIMARY KEY,              -- the printed code, e.g. TVMS-MAX-7QF3-9AB2-K4
  user_id TEXT NOT NULL REFERENCES users(id),
  track_id TEXT NOT NULL,
  plan TEXT NOT NULL,               -- free | pro | max (plan at issue time)
  plan_period_end TEXT,             -- subscription period end, snapshotted
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plan_licenses_user ON plan_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_licenses_track ON plan_licenses(track_id);

-- YouTube channels a subscriber whitelists for Content ID claim clearing.
-- Serviceable only while the owning user's subscription is active (checked at
-- query time by joining subscriptions). Also created lazily at runtime.
CREATE TABLE IF NOT EXISTS whitelist_channels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel_url TEXT NOT NULL,
  channel_ref TEXT,                 -- parsed @handle or channel id, if detectable
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_whitelist_user ON whitelist_channels(user_id);

-- Newsletter/marketing opt-in list (may include non-account visitors).
-- Each row has an unsubscribe token used in campaign emails. Lazy-created too.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  source TEXT,
  subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT
);

CREATE TABLE IF NOT EXISTS briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  type TEXT NOT NULL, -- adaptation | custom
  assigned_composer_id TEXT,
  references_text TEXT,
  description TEXT,
  budget TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY,
  percent_off INTEGER NOT NULL,
  valid_until TEXT,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  email TEXT,
  type TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  results_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  subject TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO plan_config
  (id, name, price_monthly, price_annual_per_month, download_limit, wav_and_stems, commercial_license, whitelist_slots, priority_support)
VALUES
  ('free', 'Free', 0, 0, 3, 0, 0, 0, 0),
  ('pro',  'Pro', 12, 7, NULL, 0, 0, 3, 0),
  ('max',  'Max', 29, 15, NULL, 1, 1, 10, 1);

INSERT OR IGNORE INTO composers (id, slug, display_name, bio, styles) VALUES
  ('cmp_1', 'composer-one',   'Composer One',   'Cinematic score composer. Modern score, thriller, game OST and production music.', '["Modern Score","Thriller","Game OST","Production"]'),
  ('cmp_2', 'composer-two',   'Composer Two',   'Premium sport and electronic music.', '["Sport","Electronic","Action"]'),
  ('cmp_3', 'composer-three', 'Composer Three', 'Guitar-driven cinematic tracks.', '["Guitar","Cinematic Rock","Acoustic"]');
