# TV Music Store — Next steps (hand-off spec for the next AI)

Concrete, owner-approved work to build next. Read `AI_CONTEXT.md` first, then this.
Everything below is UI/UX polish + admin workflow; the funnel/CRM/whitelist
backends already exist.

---

## 1. Whitelisting admin — claim workflow (priority)

Goal: make it fast for the owner to grab new YouTube video links across all
whitelisted channels, copy them, send to the Content ID provider (Epidemic /
Identifyy) for claim removal, and mark them done — while still being able to see
what was already handled.

### 1.1 "Show all new" across channels
- Add a top button/tab in `/admin → Whitelisting`: **"All new videos"** that
  aggregates new uploads from **every active** whitelisted channel (not just one).
- Implementation: a new endpoint `GET /api/admin/whitelist-videos-all` that loops
  active `wl_channels` (subscription active) and calls the same YouTube logic as
  `whitelist-videos.ts`, returning a flat list grouped by channel:
  `[{ channelId, channelUrl, customer, videos: [{videoId, title, publishedAt, url, handled}] }]`.
  (Mind YouTube quota — cache per channel for a few minutes if needed.)

### 1.2 Copy links
- **Copy** button next to each video → copies its YouTube URL to clipboard.
- **Copy All** button → copies all currently-shown (or selected) video URLs,
  newline-separated, to clipboard (ready to paste into the provider's bulk tool).

### 1.3 Checkboxes + "mark as handled"
- Checkbox per video + a "select all / select none".
- **"Mark as sent"** action on the selection → records those videos as handled so
  they drop out of the default "new" list (they've been sent for claim removal).
- Marked videos are shown **struck through** and hidden by default, with a
  **"Show handled"** toggle to reveal them (so the owner can see what was already
  claimed and when).

### 1.4 Data model
New table (lazy-created + in `0001_init.sql`):
```sql
CREATE TABLE IF NOT EXISTS wl_handled (
  video_id   TEXT PRIMARY KEY,   -- YouTube video id
  user_id    TEXT NOT NULL,      -- channel owner (customer)
  channel_id TEXT,               -- wl_channels.id
  video_url  TEXT,
  title      TEXT,
  marked_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```
- `whitelist-videos.ts` (+ the new `-all` endpoint): LEFT JOIN `wl_handled` and
  return `handled: boolean` per video; by default filter handled out unless
  `?includeHandled=1`.
- New `POST /api/admin/whitelist-handled { videoIds: [{videoId, userId, channelId, url, title}] }`
  to insert, and `DELETE ?videoId=` to un-mark.

### 1.5 UX notes
- Keep it keyboard-friendly: select many, one "Copy All", one "Mark as sent".
- Show a small counter: "X new / Y handled" per channel and overall.

---

## 2. Header user menu + simpler dashboard nav (tunetank-style)

Owner reference: tunetank shows a **dropdown when you click the logged-in user
avatar** in the header — quick links everywhere, your plan visible, an Upgrade
button — and the in-dashboard sidebar is more minimal.

### 2.1 Header avatar dropdown (new)
When signed in, clicking the header account icon opens a dropdown with:
- Avatar + display name + email.
- **Plan badge** (Free / Pro / Max) and an **Upgrade** button (hidden if already Max).
- Quick links: Profile / Settings, Plan & Billing, Licenses, Downloads,
  Whitelisting, "Join our community" (Discord), **Log out**.
- (Nice touch) the free-plan **download counter "N / 3"** shown in the header, as
  tunetank does.
- Build as a small popover component (`HeaderAccountMenu.tsx`) used in
  `Navigation.tsx`; reuse `useCurrentUser` + the plan from `/api/me`.

### 2.2 Minimalist dashboard sidebar
- The account (`/account`) sidebar already groups ACCOUNT / ORGANIZATION / MUSIC —
  keep it but trim labels and spacing to feel lighter.
- Most navigation now lives in the header dropdown, so the sidebar can be shorter.

---

## 3. Admin audit — consolidation proposals (owner to approve)

The admin sidebar has grown to ~14 flat items. Suggested regrouping (collapsible
groups, fewer top-level entries):

- **Catalog** (content management, currently separate): Tracks, Tracks Edit,
  Collections, Playlists, Categories, Trending, Vocabulary → one "Catalog" group.
  (These were one "Content" tab before; they belong together.)
- **Customers** (people + what they got): Customers, Licenses, Campaigns,
  Whitelisting, Copyright Claims → one "Customers/CRM" group. The customer profile
  modal already links these together conceptually.
- **Business**: Dashboard, Finance → "Overview".
- **Requests**: the current "Requests" section mixes three things:
  - *Whitelist requests* (mock) — **redundant now**, the real Whitelisting section
    replaces it → remove.
  - *Claim removals* (mock) — turn into a real admin **Copyright Claims** view (to
    mirror the customer's Copyright Claims page) or fold into Whitelisting.
  - *Briefs* (custom-music requests) — keep as its own "Briefs/Requests" item.

Net: ~4 groups (Overview, Catalog, Customers, Briefs) instead of 14 flat items.
Only a proposal — get owner sign-off before restructuring `adminNav.ts` + `Admin.tsx`.

---

## 4. Small follow-ups already noted elsewhere
- Campaign sender: batching/queue for >300 recipients.
- Whitelist Phase 2: a true background poller needs a separate Worker (Pages has no
  cron) — see `WHITELIST_SYSTEM.md`.
- Purchase/receipt email after a sale (see `EMAIL_LIFECYCLE.md`).
- Fill owner placeholders (address, effective date, live prices, social URLs) — see
  `DEPLOY_CHECKLIST.md` / `BACKLOG.md`.
