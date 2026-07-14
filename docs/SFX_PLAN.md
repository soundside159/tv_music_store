# Sound Effects — build plan

Status: **P0 + P1 BUILT (2026-07-13)** — tables, composer permissions, admin section with upload,
the public `/sound-effects` pages (DB-paged) and the WAV download gate (Pro+).
P2 next: the SFX licence PDF and the payout weights (track 1.0 / sound 0.2) in the revenue engine.
Read `AI_CONTEXT.md` first — the honesty rules and the existing music pipeline apply here too.

---

## 0. The one decision everything else hangs on

**Sound effects are NOT tracks.** They have no BPM, no versions, no stems, no Content ID, no PRO/IPI
cue-sheet data, no covers — and there will be tens of thousands of them, against a few hundred
tracks. They also sell differently (people search "glass break", they don't browse moods).

So: **a separate `sfx` table and a separate admin section**, sharing the plumbing that is already
good (composers, upload endpoints, R2 storage, download gate, licence PDF builder, revenue ledger).

The tempting shortcut — reuse `tracks` with a `kind = 'sfx'` flag — saves a week now and costs far
more later: every catalogue query, every tag vocabulary, every payout rule and every download-limit
check would need "…and not an SFX" bolted on, and a 20 000-row SFX library would drown the music
catalogue in the admin. Not worth it.

---

## 1. Data model

**`sfx`** — one row per sound.

| column | why |
|---|---|
| `id`, `slug`, `code` | same scheme as tracks (code → filename + URL) |
| `name` | "Glass Bottle Smash 03" |
| `composer_id` | who gets paid; NULL = house |
| `category_id`, `subcategory_id` | Whoosh / Glass Breaking / … + the chip under it |
| `tags` (JSON) | free search keywords ("shatter, crash, debris") |
| `duration` | "0:02" |
| `preview_src` | public MP3 (streamed on the site) |
| `wav_key`, `wav_size`, `wav_crc` | the WAV master in R2 (the thing customers download) |
| `status`, `moderation_status` | draft / published, pending / approved — same as tracks |
| `import_no` | the "#" from a source sheet, like tracks |
| `created_at`, `downloads` | newness + popularity sorting |

**No cover column.** Per the owner: the artwork is per-CATEGORY, not per-sound. The category row
carries the image (the card art in the mockup); a sound shows its category's art.

**`sfx_categories`** (`id, title, description, image, sort`) and **`sfx_subcategories`**
(`id, category_id, title, sort`). Both admin-editable, exactly like playlists/collections are today.
The counts in the mockup ("1,248 SOUNDS") are computed, never typed.

---

## 2. Composer permissions (the "upload tab appears / disappears" part)

Two flags on the composer profile: **`can_upload_tracks`** and **`can_upload_sfx`**
(defaults: tracks ON, sfx OFF).

- **Admin → Users**: two checkboxes on each composer row. That is the only place they are set.
- **Composer panel**: the sidebar shows **Upload music** only if the first flag is on, **Upload
  sounds** only if the second is. Both off → no upload group at all (the composer can still see his
  earnings and his existing items).
- **The server enforces it on every upload endpoint.** The UI hiding a tab is a convenience, never a
  security boundary — a composer with `can_upload_sfx = 0` gets a 403 from the SFX endpoint even if
  he hand-crafts the request.
- The owner's friend with the SFX library gets `can_upload_sfx = 1, can_upload_tracks = 0`.

---

## 3. Admin → Sound Effects (new section, next to Tracks Edit)

Same shape as Tracks Edit, minus what SFX don't have:

- **Table**: ID (#) · name · category → subcategory · composer · duration · status. Search, filter by
  category/composer/status, bulk select. No versions column, no stems, no trending, no BPM.
- **Bulk upload**: drop a folder → **the folder name is the category**, each file is one sound, the
  filename is its name. WAV in → MP3 preview rendered in the browser (the pipeline we already have),
  WAV master uploaded, row created as **draft**. Duplicate filename on the same category = skipped
  with a message, same as the music uploader.
- **Bulk edit panel**: category, subcategory, tags — for the whole selection at once.
- **AI tagging**: the same `suggest-tags` endpoint, given the SFX category tree instead of the music
  vocabularies; the owner types "breaking glass, sharp, debris" (or lets it read the name) and the AI
  ticks category + subcategory + keywords. This is what makes 20 000 sounds tractable.
- **Publish / draft / review** and **delete** behave exactly like tracks — and, like tracks, deleting
  a sound deletes its files (WAV + MP3) from storage. The storage sweep counts SFX files as
  referenced.

---

## 4. Public pages (the owner's mockup, in order)

1. **`/sfx`** — hero + a real search box ("Search 18,542 sound effects…") + popular searches +
   **Featured Categories** (the big art cards) + **Browse All Categories** (every category with its
   subcategory chips and a count). Straight from the mockup.
2. **`/sfx/:category`** — the sounds of one category: search within it, subcategory chips as filters,
   sort (new / popular / duration), and the familiar row player (waveform, play, favourite,
   download).
3. **`/sfx/:category/:subcategory`** — same, pre-filtered. Both are real URLs, for search engines.
4. **Search results** — one flat list, because that is how people actually use an SFX library.

### URLs (owner: copy TuneTank's scheme)

```
/sound-effects/                       the landing page
/sound-effects/boing/                 one category
/sound-effects/boing/?page=2          page 2, 3, …  (a real URL, indexable, shareable)
/sound-effects/?q=glass+break         search results (also paged)
```
Page NUMBERS, not infinite scroll: every page is its own URL, which is what makes the library
indexable — and it is what the owner is used to.

### Loading — the numbers, not opinions (measured 2026-07-13 against the live `/api/tracks`)

Only METADATA travels in that JSON — titles, tags, durations, and the *paths* to the audio. The MP3
itself is fetched only when someone presses play. So the question is just how big the metadata gets:

| | raw JSON | over the wire (gzip) |
|---|---|---|
| 200 tracks | 0.4 MB | ~0.1 MB |
| **900 tracks** | **1.6 MB** | **~0.4 MB** |
| 2 000 tracks | 3.6 MB | ~0.9 MB |
| 20 000 sounds (smaller rows) | 6.7 MB | ~1.7 MB |

(A fully tagged track is ~1.9 KB of JSON — 41 tags + description + 4 versions. An SFX row is ~0.35 KB.)

So: **900 tracks is fine** — ~0.4 MB gzipped, arriving once, and the page renders in slices anyway.
I would revisit the music catalogue somewhere around 2 000–3 000 tracks, not before.

**20 000 sounds is not fine**: ~1.7 MB before the page can draw anything, re-downloaded on every
visit, and a 20 000-element array being filtered on every keystroke of the search box. That is why
SFX pages in the DB from day one: `/api/sfx?q=&cat=&sub=&page=` returns 50 rows, the page shows
"1 2 3 …" like TuneTank, and the browser never holds more than a page.

Also: the nav's "Sound Effects" item is currently a dead chip — it becomes a real link when this
ships.

---

## 5. Licensing, plans and money — DECIDED (owner, 2026-07-13)

- **Format:** one **WAV master** per sound. An **MP3 is rendered at upload** — for STREAMING on the
  site only (previews, search results, the player). MP3 is never a download.
- **Download = WAV, and only from Pro upwards.** No free SFX downloads at all: Free accounts can
  listen, not take. So SFX never touch the 3-a-month free allowance — there is nothing to count.
- **Storage:** sounds live under their own R2 prefix (`sfx/…`), separate from `masters/` and
  `previews/`, so the storage sweep and the size reports can talk about them separately.
- **SFX are never in Content ID and are never claimed.** No whitelisting or claim copy anywhere near
  them. Their licence certificate is the track builder with SFX scope wording and zero claim
  language.

### Composer payouts — DECIDED: weighted points (owner, 2026-07-13)

**Track = 1.0 point, sound = 0.2**, inside the existing per-payer/per-cycle allocation. When a
customer took BOTH kinds in a cycle, sounds are capped at 50% of that cycle's points (so "2 tracks +
30 sounds" splits 50/50, not 12/88). A customer who took only sounds sends 100% of his author share
to the SFX composer — the cap is only a referee between the two kinds, never a haircut.
Both numbers (0.2 and the 50% cap) live in config and can be retuned after a real month of data.

### The reasoning behind it (kept for the record)

The problem in one line: a subscriber pays once, and in that month he might take **2 tracks and 30
sounds**. If every download is worth one point, the SFX composer earns 15× the music composer from
the same money — not because his work is worth more, but because sounds are grabbed by the handful.
The reverse is just as true: a customer who only takes sounds should not fund music composers.

The engine already allocates **per payer, per cycle** — a customer's money is split only between the
people he actually downloaded. That part is right and must stay. The only question is the **weight**
of one sound against one track. Three ways to answer it:

1. **Weighted points — CHOSEN.** Track = 1.0 point, sound = 0.2, and — when a customer
   took *both* kinds in a cycle — sounds are capped at half of that cycle's points. A month of 2
   tracks + 30 sounds then splits 50/50 instead of 12/88. A customer who took *only* sounds still
   sends 100% of his author share to the SFX composer (no cap applies — the cap is only a referee
   between the two kinds). Honest, self-balancing, and needs no negotiation.
2. **Flat rate per sound.** e.g. $0.02 per WAV downloaded, paid off the top; the rest goes to music.
   Predictable for the SFX composer, but a heavy month can eat more than the subscription brought in
   — you would need a cap anyway, which is option 1 with extra steps.
3. **Fixed revenue share.** Since the SFX library comes from **one** composer, agree a flat % of net
   subscription revenue (or a monthly fee) for the whole library and skip per-download maths
   entirely. Simplest to run, hardest to defend the day a second SFX composer appears.

Start with **1**; the weight (0.2) and the cap (50%) are two numbers in the config, so the split can
be retuned after a real month of data without touching the engine.

## 6. Phases

| phase | what ships | why this order |
|---|---|---|
| **P0** | `sfx` tables, composer permission flags + admin toggles, admin Sound Effects section with bulk upload and AI tagging | the owner (and his friend) can start loading the library while the storefront is built |
| **P1** | `/sfx` landing, category + subcategory pages, server-side search & pagination, download gate | the product goes live |
| **P2** | SFX licence PDF, favourites, packs ("download the whole category"), pricing-page copy | the polish that makes it sellable |
| **P3** | SEO pass (`docs/AI_VISIBILITY.md` already has the keyword research) | only worth doing once there is something to index |

---

## 7. Owner's answers (2026-07-13)

1. **Free tier:** no free SFX downloads at all. Streaming only. → nothing to count against the
   3-a-month allowance.
2. **Payouts:** weighted points — track 1.0, sound 0.2, sounds capped at half a cycle when the
   customer took both kinds. (Option 3, a flat share with the single SFX composer, stays as a
   fallback if the maths ever proves annoying in practice.)
3. **WAV from Pro upwards.** (Max keeps its edge on music: stems + commercial licence.)
4. **Categories:** the owner builds them himself in the admin — the AI proposes nothing.
