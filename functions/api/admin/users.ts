import { ensureAgreementTable, ensureAiOptinTable } from "../_agreement";
import { ensureWithholdingColumns } from "../_revenue";
import { ensureUploadPermColumns } from "./upload-audio";
import { ensureStripeColumns } from "../stripe/_stripe";
import { ensureCreatorTable } from "../_creators";
import {
  deleteUserAccount,
  getSessionUser,
  json,
  newId,
  OWNER_EMAIL,
  readJson,
  type Ctx,
  type D1Database,
} from "../_utils";

// Admin-only user management.
// GET  -> latest 200 users with plan info (+ composer pseudonym when one exists).
// PATCH { userId, role?, pseudonym?, removeComposer? }
//   role           — customer | composer | admin (admin/customer is the main switch now)
//   pseudonym      — upserts a `composers` row linked via user_id; being a composer
//                    is a PROFILE FLAG independent of the role (an admin can compose).
//                    The pseudonym is shown as the track artist site-wide.
//   removeComposer — deletes the composer profile (refused while the composer still
//                    has tracks); legacy role 'composer' downgrades to 'customer'.

const requireAdmin = async (ctx: Ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return { error: json({ error: "Not signed in" }, 401) };
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return { error: json({ error: "Admin only" }, 403) };
  }
  return { user };
};

/** composers.photo — artist page background; added lazily on first use. */
const ensurePhotoColumn = async (db: NonNullable<Ctx["env"]["DB"]>) => {
  try {
    await db.prepare(`ALTER TABLE composers ADD COLUMN photo TEXT`).run();
  } catch {
    // already there
  }
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;
  if (ctx.env.DB) await ensurePhotoColumn(ctx.env.DB);

  // Drops legacy random suffixes from artist-page slugs (idempotent).
  await normalizeComposerSlugs(ctx.env.DB);
  // Makes subscriptions.cancel_at_period_end exist (lazy ALTER) so the plan
  // subselects below never blow up on an older database.
  await ensureStripeColumns(ctx.env.DB);

  const rows = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.created_at,
            (SELECT s.plan FROM subscriptions s
              WHERE s.user_id = u.id ORDER BY s.rowid DESC LIMIT 1) AS plan,
            (SELECT s.status FROM subscriptions s
              WHERE s.user_id = u.id ORDER BY s.rowid DESC LIMIT 1) AS plan_status,
            (SELECT s.cancel_at_period_end FROM subscriptions s
              WHERE s.user_id = u.id ORDER BY s.rowid DESC LIMIT 1) AS plan_cancels,
            (SELECT s.current_period_end FROM subscriptions s
              WHERE s.user_id = u.id ORDER BY s.rowid DESC LIMIT 1) AS plan_until,
            (SELECT COUNT(*) FROM download_log d WHERE d.user_id = u.id) AS downloads,
            (SELECT c.display_name FROM composers c
              WHERE c.user_id = u.id LIMIT 1) AS pseudonym,
            (SELECT c.bio FROM composers c
              WHERE c.user_id = u.id LIMIT 1) AS bio,
            (SELECT c.photo FROM composers c
              WHERE c.user_id = u.id LIMIT 1) AS photo
       FROM users u
      ORDER BY u.created_at DESC
      LIMIT 200`,
  ).all<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    created_at: string;
    plan: string | null;
    /** Latest subscription status (active | past_due | canceled) — null = never subscribed. */
    plan_status: string | null;
    /** 1 = canceled in the portal, runs to plan_until, then Free. */
    plan_cancels: number | null;
    plan_until: string | null;
    downloads: number;
    pseudonym: string | null;
    /** "About the composer" — shown on the public /artist/<slug> page. */
    bio: string | null;
    /** Artist page background photo (/api/file/covers/...). */
    photo: string | null;
  }>();

  // Sync / cue-sheet info per composer profile (printed on license PDFs).
  let cueByUser = new Map<string, Record<string, string | null>>();
  try {
    await ensureCueColumns(ctx.env.DB);
    await ensureUploadPermColumns(ctx.env.DB);
    await ensureWithholdingColumns(ctx.env.DB);
    const cues = await ctx.env.DB.prepare(
      `SELECT user_id, cue_name, pro, ipi, publisher_name, publisher_pro, publisher_ipi,
              tax_country, withholding_bps,
              COALESCE(can_upload_tracks, 1) AS can_upload_tracks,
              COALESCE(can_upload_sfx, 0) AS can_upload_sfx
         FROM composers WHERE user_id IS NOT NULL`,
    ).all<{
      user_id: string;
      cue_name: string | null;
      pro: string | null;
      ipi: string | null;
      publisher_name: string | null;
      publisher_pro: string | null;
      publisher_ipi: string | null;
      tax_country: string | null;
      withholding_bps: number | null;
      can_upload_tracks: number;
      can_upload_sfx: number;
    }>();
    cueByUser = new Map(
      cues.results.map((c) => [
        c.user_id,
        {
          cueName: c.cue_name,
          pro: c.pro,
          ipi: c.ipi,
          publisherName: c.publisher_name,
          publisherPro: c.publisher_pro,
          publisherIpi: c.publisher_ipi,
          taxCountry: c.tax_country,
          /** UK withholding on royalties, as a percent string ("5"). */
          withholdingPercent: c.withholding_bps == null ? null : String(c.withholding_bps / 100),
          canUploadTracks: c.can_upload_tracks ? "1" : "0",
          canUploadSfx: c.can_upload_sfx ? "1" : "0",
        },
      ]),
    );
  } catch {
    // cue columns unavailable — fields just come back empty
  }

  // Sound downloads live in their own table (a sound is not a track) — one
  // total for the dashboard card. Guarded: the sfx tables may not exist yet.
  let sfxDownloads = 0;
  try {
    const r = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM sfx_downloads`).first<{
      n: number;
    }>();
    sfxDownloads = r?.n ?? 0;
  } catch {
    // no sfx tables yet
  }

  // Composer Agreement: latest signature per user (click-to-sign on the site).
  const agreementByUser = new Map<string, { id: string; version: string; signedAt: string }>();
  try {
    await ensureAgreementTable(ctx.env.DB);
    const ag = await ctx.env.DB.prepare(
      `SELECT a.user_id, a.id, a.version, a.signed_at FROM composer_agreements a
        WHERE a.signed_at = (SELECT MAX(b.signed_at) FROM composer_agreements b WHERE b.user_id = a.user_id)`,
    ).all<{ user_id: string; id: string; version: string; signed_at: string }>();
    for (const r of ag.results ?? []) {
      agreementByUser.set(r.user_id, { id: r.id, version: r.version, signedAt: r.signed_at });
    }
  } catch {
    // table missing - nobody has signed yet
  }

  // Optional AI Training Addendum opt-ins.
  const aiByUser = new Map<string, { optedIn: boolean; since: string | null }>();
  try {
    await ensureAiOptinTable(ctx.env.DB);
    const ai = await ctx.env.DB.prepare(
      `SELECT user_id, opted_in, signed_at FROM composer_ai_optin`,
    ).all<{ user_id: string; opted_in: number; signed_at: string | null }>();
    for (const r of ai.results ?? []) aiByUser.set(r.user_id, { optedIn: !!r.opted_in, since: r.signed_at });
  } catch {
    // table missing
  }

  // Content creators (free Max until a date): ALL of them, active or not, so
  // the Creators tab never loses one behind the 200-newest-users limit.
  let creators: Array<{
    user_id: string;
    email: string;
    name: string | null;
    granted_at: string;
    until: string;
    note: string | null;
  }> = [];
  try {
    await ensureCreatorTable(ctx.env.DB);
    const cr = await ctx.env.DB.prepare(
      `SELECT c.user_id, u.email, u.name, c.granted_at, c.until, c.note
         FROM content_creators c JOIN users u ON u.id = c.user_id
        ORDER BY c.until DESC`,
    ).all<(typeof creators)[number]>();
    creators = cr.results ?? [];
  } catch {
    // table missing - no creators yet
  }

  return json({
    creators,
    users: rows.results.map((u) => ({
      ...u,
      cue: cueByUser.get(u.id) ?? null,
      agreement: agreementByUser.get(u.id) ?? null,
      aiOptin: aiByUser.get(u.id) ?? null,
    })),
    sfxDownloads,
  });
};

/** Sync / cue-sheet fields on the composer profile (lazy ALTERs). */
const ensureCueColumns = async (db: D1Database) => {
  const alters = [
    `ALTER TABLE composers ADD COLUMN cue_name TEXT`,
    `ALTER TABLE composers ADD COLUMN pro TEXT`,
    `ALTER TABLE composers ADD COLUMN ipi TEXT`,
    `ALTER TABLE composers ADD COLUMN publisher_name TEXT`,
    `ALTER TABLE composers ADD COLUMN publisher_pro TEXT`,
    `ALTER TABLE composers ADD COLUMN publisher_ipi TEXT`,
  ];
  for (const sql of alters) {
    try {
      await db.prepare(sql).run();
    } catch {
      // column exists — fine
    }
  }
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * Creates or renames the composer profile (pseudonym) linked to a user.
 * Pseudonyms are UNIQUE (case-insensitive) and the artist-page slug is the
 * plain slugified nick — NO random suffix (owner rule: /artist/lumine-wave,
 * never /artist/lumine-wave-6cab66). A name whose slug is already taken by
 * another composer is REFUSED instead of being silently suffixed. If the
 * pseudonym belongs to a DETACHED profile (its user was deleted), the profile —
 * with all its tracks — is re-attached to this user. Returns an error string or
 * null on success.
 */
const upsertComposer = async (
  db: D1Database,
  userId: string,
  pseudonym: string,
): Promise<string | null> => {
  // Who else carries this name?
  const sameName = await db
    .prepare(`SELECT id, user_id FROM composers WHERE lower(display_name) = lower(?1) LIMIT 1`)
    .bind(pseudonym)
    .first<{ id: string; user_id: string | null }>();
  if (sameName && sameName.user_id && sameName.user_id !== userId) {
    return "This pseudonym is already taken by another composer";
  }

  const existing = await db
    .prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
    .bind(userId)
    .first<{ id: string }>();

  // Same name exists but is detached (its user was deleted) — re-attach it so
  // the new user inherits that composer's tracks. If this user already had
  // another profile without tracks, it would just linger; keep it simple and
  // only re-attach when the user has no profile yet.
  if (sameName && !sameName.user_id && !existing) {
    await db.prepare(`UPDATE composers SET user_id = ?2 WHERE id = ?1`).bind(sameName.id, userId).run();
    return null;
  }

  const slug = slugify(pseudonym);
  if (!slug) return "The pseudonym needs at least one letter or digit";
  // The slug is the public artist URL — it must be free (two different nicks can
  // still collapse to the same slug, e.g. "Neo Wave" and "neo-wave").
  const slugOwner = await db
    .prepare(`SELECT id FROM composers WHERE slug = ?1 LIMIT 1`)
    .bind(slug)
    .first<{ id: string }>();
  if (slugOwner && slugOwner.id !== existing?.id) {
    return "That artist page name is already taken — pick a different pseudonym";
  }

  if (existing) {
    // Rename: the slug follows the nick, so the artist URL stays readable.
    await db
      .prepare(`UPDATE composers SET display_name = ?2, slug = ?3 WHERE id = ?1`)
      .bind(existing.id, pseudonym, slug)
      .run();
    return null;
  }
  await db
    .prepare(
      `INSERT INTO composers (id, user_id, slug, display_name, bio, styles)
       VALUES (?1, ?2, ?3, ?4, '', '[]')`,
    )
    .bind(newId("cmp"), userId, slug, pseudonym)
    .run();
  return null;
};

/**
 * One-time cleanup of legacy suffixed slugs ("lumine-wave-6cab66"): give every
 * composer the plain slug of his nick whenever that slug is free. Runs on the
 * admin Users load — idempotent, and never touches a slug that would clash.
 */
const normalizeComposerSlugs = async (db: D1Database) => {
  try {
    const rows = await db
      .prepare(`SELECT id, slug, display_name FROM composers`)
      .all<{ id: string; slug: string; display_name: string }>();
    const used = new Set(rows.results.map((c) => c.slug));
    for (const c of rows.results) {
      const want = slugify(c.display_name);
      if (!want || want === c.slug || used.has(want)) continue;
      await db.prepare(`UPDATE composers SET slug = ?2 WHERE id = ?1`).bind(c.id, want).run();
      used.delete(c.slug);
      used.add(want);
    }
  } catch {
    // composers table missing / read-only hiccup — slugs just stay as they are
  }
};

/**
 * Content Creator switch. `until` (YYYY-MM-DD) grants or extends free Max to the
 * end of that day; null switches it off now. The creator row is never deleted:
 * an inactive creator stays in the admin Creators tab.
 */
const setCreator = async (
  db: D1Database,
  userId: string,
  until: string | null,
  note?: string,
): Promise<string | null> => {
  await ensureCreatorTable(db);
  await ensureStripeColumns(db);
  const nowIso = new Date().toISOString();
  const existing = await db
    .prepare(`SELECT sub_id, granted_at, until FROM content_creators WHERE user_id = ?1`)
    .bind(userId)
    .first<{ sub_id: string | null; granted_at: string; until: string }>();
  const latest = await db
    .prepare(
      `SELECT id, stripe_sub_id, plan, status FROM subscriptions
        WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: string; stripe_sub_id: string | null; plan: string; status: string }>();
  // Our own grant row = the latest row, made by us, never touched by Stripe.
  const ownRow =
    existing?.sub_id && latest && latest.id === existing.sub_id && !latest.stripe_sub_id ? latest.id : null;

  if (until === null) {
    if (!existing) return "This user is not a content creator";
    await db.prepare(`UPDATE content_creators SET until = ?2 WHERE user_id = ?1`).bind(userId, nowIso).run();
    if (ownRow) {
      await db
        .prepare(`UPDATE subscriptions SET plan = 'free', status = 'canceled', current_period_end = ?2 WHERE id = ?1`)
        .bind(ownRow, nowIso)
        .run();
    }
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return "Pick an end date";
  const untilIso = `${until}T23:59:59.000Z`;
  if (untilIso <= nowIso) return "The end date must be in the future";

  // A real paid subscription is running: don't stack a free grant on top of it
  // (Stripe renewals update the latest row and would overwrite ours).
  if (latest && latest.stripe_sub_id && latest.status === "active" && latest.plan !== "free") {
    return "This user already pays for a subscription - cancel it first or wait until it ends";
  }

  let subId = ownRow;
  if (subId) {
    await db
      .prepare(
        `UPDATE subscriptions SET plan = 'max', status = 'active', current_period_end = ?2, cancel_at_period_end = 0
          WHERE id = ?1`,
      )
      .bind(subId, untilIso)
      .run();
  } else {
    subId = newId("crt");
    await db
      .prepare(
        `INSERT INTO subscriptions (id, user_id, plan, interval, status, current_period_end, cancel_at_period_end)
         VALUES (?1, ?2, 'max', NULL, 'active', ?3, 0)`,
      )
      .bind(subId, userId, untilIso)
      .run();
  }
  // A new period starts when the old grant had already ended (or was switched off).
  const stillRunning = !!existing && existing.until > nowIso;
  await db
    .prepare(
      `INSERT INTO content_creators (user_id, granted_at, until, note, sub_id)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO UPDATE SET
         granted_at = CASE WHEN ?6 = 1 THEN content_creators.granted_at ELSE excluded.granted_at END,
         until = excluded.until,
         note = COALESCE(excluded.note, content_creators.note),
         sub_id = excluded.sub_id`,
    )
    .bind(userId, nowIso, untilIso, note?.trim() ? note.trim().slice(0, 200) : null, subId, stillRunning ? 1 : 0)
    .run();
  return null;
};

export const onRequestPatch = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const body = await readJson<{
    userId?: string;
    role?: string;
    pseudonym?: string;
    /** "About the composer" text shown on the public /artist/<slug> page. */
    bio?: string;
    /** Artist page background photo path ("" clears it). */
    photo?: string;
    removeComposer?: boolean;
    /** Content Creator: free Max until this day (YYYY-MM-DD); null = switch off now. */
    creator?: { until: string | null; note?: string };
    /** Change the user's login email (unique; the owner account is protected). */
    email?: string;
    /** Upload rights of the composer profile: music and sounds are separate. */
    uploads?: { tracks?: boolean; sfx?: boolean };
    /** Sync / cue-sheet info for the composer profile (license PDFs). */
    cue?: {
      cueName?: string;
      pro?: string;
      ipi?: string;
      publisherName?: string;
      publisherPro?: string;
      publisherIpi?: string;
      /** UK withholding tax on his royalties, percent ("5", "0", "20"). */
      withholdingPercent?: string;
      taxCountry?: string;
    };
  }>(ctx.request);
  const userId = body?.userId;
  const role = body?.role;
  const removeComposer = body?.removeComposer === true;
  const cue = body?.cue;
  const uploads = body?.uploads;
  const pseudonym = typeof body?.pseudonym === "string" ? body.pseudonym.trim() : undefined;
  const bio = typeof body?.bio === "string" ? body.bio.trim().slice(0, 2000) : undefined;
  const photo = typeof body?.photo === "string" ? body.photo.trim().slice(0, 500) : undefined;
  const newEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;
  const creator = body?.creator;
  if (
    !userId ||
    (!role &&
      !creator &&
      pseudonym === undefined &&
      bio === undefined &&
      photo === undefined &&
      !removeComposer &&
      !cue &&
      !uploads &&
      newEmail === undefined)
  ) {
    return json({ error: "userId and role, pseudonym, bio, cue, email or removeComposer required" }, 400);
  }
  if (newEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return json({ error: "That doesn't look like a valid email" }, 400);
  }
  if (role && !["customer", "composer", "admin", "editor"].includes(role)) {
    return json({ error: "Invalid role" }, 400);
  }
  if (pseudonym !== undefined && !pseudonym) {
    return json({ error: "Pseudonym cannot be empty" }, 400);
  }

  const target = await ctx.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ email: string }>();
  if (!target) return json({ error: "User not found" }, 404);

  // The owner account always stays admin.
  if (role && target.email === OWNER_EMAIL && role !== "admin") {
    return json({ error: "The owner account must stay admin" }, 400);
  }

  if (newEmail !== undefined) {
    if (target.email === OWNER_EMAIL) {
      return json({ error: "The owner account's email cannot be changed here" }, 400);
    }
    const taken = await ctx.env.DB.prepare(`SELECT id FROM users WHERE email = ?1 AND id != ?2`)
      .bind(newEmail, userId)
      .first();
    if (taken) return json({ error: "Another account already uses that email" }, 400);
    await ctx.env.DB.prepare(`UPDATE users SET email = ?1 WHERE id = ?2`).bind(newEmail, userId).run();
  }
  if (role) {
    await ctx.env.DB.prepare(`UPDATE users SET role = ?1 WHERE id = ?2`).bind(role, userId).run();
  }
  if (creator) {
    const err = await setCreator(ctx.env.DB, userId, creator.until, creator.note);
    if (err) return json({ error: err }, 400);
  }
  if (pseudonym !== undefined) {
    const err = await upsertComposer(ctx.env.DB, userId, pseudonym.slice(0, 60));
    if (err) return json({ error: err }, 400);
  }
  if (bio !== undefined) {
    const has = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(userId)
      .first();
    if (!has) return json({ error: "Set a composer pseudonym first, then add the about text" }, 400);
    await ctx.env.DB.prepare(`UPDATE composers SET bio = ?2 WHERE user_id = ?1`)
      .bind(userId, bio)
      .run();
  }
  if (photo !== undefined) {
    if (photo && !photo.startsWith("/api/file/")) return json({ error: "Bad photo path" }, 400);
    await ensurePhotoColumn(ctx.env.DB);
    const has = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(userId)
      .first();
    if (!has) return json({ error: "Set a composer pseudonym first, then add the photo" }, 400);
    await ctx.env.DB.prepare(`UPDATE composers SET photo = ?2 WHERE user_id = ?1`)
      .bind(userId, photo || null)
      .run();
  }
  if (uploads) {
    await ensureUploadPermColumns(ctx.env.DB);
    const has = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(userId)
      .first();
    if (!has) return json({ error: "Set a composer pseudonym first" }, 400);
    if (typeof uploads.tracks === "boolean") {
      await ctx.env.DB.prepare(`UPDATE composers SET can_upload_tracks = ?2 WHERE user_id = ?1`)
        .bind(userId, uploads.tracks ? 1 : 0)
        .run();
    }
    if (typeof uploads.sfx === "boolean") {
      await ctx.env.DB.prepare(`UPDATE composers SET can_upload_sfx = ?2 WHERE user_id = ?1`)
        .bind(userId, uploads.sfx ? 1 : 0)
        .run();
    }
  }

  if (cue) {
    await ensureCueColumns(ctx.env.DB);
    const has = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(userId)
      .first();
    if (!has) return json({ error: "Set a composer pseudonym first, then add cue-sheet info" }, 400);
    const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
    await ctx.env.DB.prepare(
      `UPDATE composers
          SET cue_name = ?2, pro = ?3, ipi = ?4,
              publisher_name = ?5, publisher_pro = ?6, publisher_ipi = ?7
        WHERE user_id = ?1`,
    )
      .bind(userId, s(cue.cueName), s(cue.pro), s(cue.ipi), s(cue.publisherName), s(cue.publisherPro), s(cue.publisherIpi))
      .run();
    // Withholding rate + tax country (only when sent; blank leaves them as they are).
    if (cue.withholdingPercent !== undefined || cue.taxCountry !== undefined) {
      await ensureWithholdingColumns(ctx.env.DB);
      const pct = String(cue.withholdingPercent ?? "").trim();
      const bps = pct === "" ? null : Math.round(Math.max(0, Math.min(100, Number(pct) || 0)) * 100);
      const cc = String(cue.taxCountry ?? "").trim().toUpperCase().slice(0, 2);
      await ctx.env.DB.prepare(
        `UPDATE composers SET
           withholding_bps = COALESCE(?2, withholding_bps),
           tax_country = COALESCE(NULLIF(?3, ''), tax_country)
         WHERE user_id = ?1`,
      )
        .bind(userId, bps, cc)
        .run();
    }
  }
  if (removeComposer) {
    const cmp = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(userId)
      .first<{ id: string }>();
    if (cmp) {
      // Never orphan tracks: the profile can only go when it owns none.
      const n = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM tracks WHERE composer_id = ?1`)
        .bind(cmp.id)
        .bind(cmp.id)
        .first<{ n: number }>();
      if ((n?.n ?? 0) > 0) {
        return json(
          { error: `This composer still has ${n!.n} track(s) — delete or reassign them first` },
          400,
        );
      }
      await ctx.env.DB.prepare(`DELETE FROM composers WHERE id = ?1`).bind(cmp.id).run();
    }
    // Legacy pure-composer role loses its meaning without a profile.
    await ctx.env.DB.prepare(`UPDATE users SET role = 'customer' WHERE id = ?1 AND role = 'composer'`)
      .bind(userId)
      .run();
  }
  return json({ ok: true });
};

// DELETE { userId } — remove a user account. Composer profiles are DETACHED
// (tracks are never touched); the owner and your own account are protected.
export const onRequestDelete = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const gate = await requireAdmin(ctx);
  if (gate.error) return gate.error;

  const body = await readJson<{ userId?: string }>(ctx.request);
  const userId = body?.userId;
  if (!userId) return json({ error: "userId required" }, 400);

  const target = await ctx.env.DB.prepare(`SELECT id, email FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ id: string; email: string }>();
  if (!target) return json({ error: "User not found" }, 404);
  if (target.email === OWNER_EMAIL) {
    return json({ error: "The owner account cannot be deleted" }, 400);
  }
  if (gate.user && target.id === gate.user.id) {
    return json({ error: "You cannot delete the account you are signed in with" }, 400);
  }

  await deleteUserAccount(ctx.env.DB, target.id, target.email);
  return json({ ok: true });
};
