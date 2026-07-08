# Catalog ordering — plan (build AFTER the code system + after the first big import)

Owner-approved direction for how tracks are ordered on `/catalog`.

**STATUS 2026-07-08: sort modes 1-3 are BUILT** — `src/lib/catalogSort.ts`
(daily-seeded mulberry32 mix; featured = admin trending ids via `useTrendingIds`,
genre round-robin for the rest), wired in `Catalog.tsx` (default sort renamed
Featured → Recommended); `/api/tracks` now returns `created_at` (New) and
per-track `downloads` from download_log (Popular; ties fall back to the mix).
The star-rating staging section below is still NOT built (post-import task).

## Sort modes

The Sort dropdown keeps three modes; **Recommended** is the default.

### 1. Recommended (default) — "smart diverse mix"
Goal: a fresh visitor sees VARIETY on the first page, never 300 tracks of one
genre in a row, even after a big single-genre import.

- **Featured pinned first.** The tracks the owner marks as featured/trending in
  admin come first. On the daily reset they are **shuffled among themselves**, so
  picking 50 featured looks like a rotating hand-picked set (pick another 50 next
  week and the look changes).
- **The rest = genre/mood round-robin.** Group the remaining tracks by primary
  Genre (or Use Case / Mood), then take one from each group in rotation:
  Dark → Sport → Cinematic → Electronic → Emotional → … So a 300-track batch of
  one genre spreads across the whole list instead of clumping.
- **Daily seed.** The shuffle/rotation uses a seed derived from the date, so the
  order is STABLE within a day (pagination doesn't repeat or jump) and refreshes
  once a day (catalog feels alive). Implement client-side in Catalog (it already
  loads the full track list): group → seeded round-robin → featured on top.

### 2. New — by date
Strictly newest first. Accepts that a single big batch dominates (that's the
point of "New"). Needs the staging system below to be meaningful after the first
bulk import (where all tracks share ~one import date).

### 3. Popular — later
Currently a placeholder (sorts by BPM). Switch to REAL popularity (download
counts from `download_log`) once enough stats accumulate. Until then Popular can
fall back to the Recommended diverse mix.

## New-track staging / star-rating (separate later task)

Problem: the first catalog is a bulk import (owner's ~300 + composer friends'
batches), so every track has ~the same created_at — "New" would be meaningless,
and one composer's whole genre would sit together.

Owner's plan (simplified to a rating, easier than a multi-page wizard):
- Add a **1-10 star rating** next to each track in admin (owner sets it). Think of
  it as "newness / priority tiers" — 10 = freshest/best, 1 = oldest.
- New order = by rating tier (10 first, then 9, …). **Within the same tier,
  interleave across composers** round-robin: composer1, composer2, composer3,
  composer1, … so the same-tier tracks alternate instead of grouping by composer/
  genre.
- The owner sets ratings, presses **Apply**, and that becomes the New ordering
  seed. After the initial import, normally-uploaded tracks flow into New by real
  date as usual.
- Store the rating on the track (e.g. `tracks.new_rank INTEGER`); New sort uses
  `new_rank DESC, created_at DESC` with the per-tier composer interleave applied
  client-side.

Build order: code system → Recommended/New/Popular sorting → (after the big
import) the star-rating staging.
