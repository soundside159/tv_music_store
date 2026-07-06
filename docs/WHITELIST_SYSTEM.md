# Channel Whitelisting — spec (owner idea, 2026-07-06)

> How subscription customers get Content ID claims cleared on their channels.
> NOT built yet — this is the plan. Manual first, monitoring later.

## The model

A subscriber can register their YouTube channel(s) — up to a **per-plan limit** —
while their subscription is active. As long as the subscription is active, TV
Music Store clears Content ID claims on those channels' videos that use our music.
When the subscription ends, videos published **after** that date are no longer
cleared (anything published while active stays cleared).

It is a **manual** process behind the scenes (owner releases claims in the Content
ID dashboard), but it feels automatic to the customer.

Per-plan channel limits (align with `/licensing` page): e.g. Free — none,
Pro — 3, Max — 10. (Owner confirms final numbers.)

## Phase 1 — manual (build first)

**Customer side (account page):**
- "My Channels" section for subscribers: add/remove YouTube channel URLs, up to the
  plan limit. Show status (Active / Pending review). Disabled/limited when not on a
  paid plan.

**Data (D1):**
```sql
CREATE TABLE IF NOT EXISTS whitelist_channels (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  channel_url TEXT NOT NULL,
  channel_id  TEXT,              -- resolved YouTube channel id, if available
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  active      INTEGER NOT NULL DEFAULT 1,  -- follows subscription status
  removed_at  TEXT
);
```
- On subscription cancel/expiry (webhook), mark the user's channels' effective
  cutoff = period end (don't delete — needed for the "published before" rule).

**Admin side:**
- "Whitelist" section: list of active whitelisted channels grouped by customer
  (name, plan, channel URL, added date, subscription status). Owner opens each
  channel and clears claims in YouTube.
- Only channels of **active** subscribers appear as "to service".

## Phase 2 — monitoring (BUILT, on-demand)

Cloudflare **Pages has no cron**, so instead of a background poller this is
on-demand: in /admin -> Whitelisting, each Active channel has a "New videos"
button that calls `GET /api/admin/whitelist-videos?id=<channel>`, which resolves
the channel via the YouTube Data API and returns uploads published **after** the
channel's `added_at`, only while the customer's subscription is active. The owner
opens each and clears the claim. **OWNER STEP:** set `YOUTUBE_API_KEY` (YouTube
Data API v3 key) in Cloudflare Pages env vars. Handles @handle / channel/UC... /
user/... URLs; /c/ custom URLs are best-effort. A true background poller + stored
cursor would need a separate Worker (Pages can't cron) — original plan below.

### Original background-worker plan (if ever moved to a Worker)

Automate the "which videos to clear" part:
- A scheduled worker polls each whitelisted channel's uploads (YouTube Data API,
  `search.list` / `playlistItems` on the uploads playlist) for videos published
  **after** the subscription start.
- Surface **new videos** in admin under each channel with a direct link, so the
  owner just opens them and clears the claim — no hunting.
- Once the subscription ends, stop listing new videos for that channel (videos
  before the end date remain in history as already-cleared).
- Needs a Google API key + quota; store last-checked cursor per channel.

## Notes / caveats

- True automatic Content ID whitelisting requires access to the CMS/reference the
  music is registered under (Identifyy / provider). If the provider exposes a
  channel-allowlist API we could later make it genuinely automatic; until then this
  manual+monitoring approach is the pragmatic path.
- Keep the Terms wording (§6) in sync: whitelisting is subscription-bound; videos
  after cancellation aren't covered.
- Abuse guard: cap channels per plan, and re-verify ownership if a channel URL is
  reused across accounts.
