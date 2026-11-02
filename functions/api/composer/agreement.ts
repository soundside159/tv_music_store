import { getSessionUser, json, newId, OWNER_EMAIL, readJson, type Ctx } from "../_utils";
import { AGREEMENT_VERSION, AI_ADDENDUM_VERSION } from "../../../src/content/composerAgreement";
import {
  ensureAgreementTable,
  ensureAiOptinTable,
  latestAgreement,
  type AgreementRow,
  type AiOptinRow,
} from "../_agreement";

// Composer Agreement (click-to-sign).
// GET            -> { version, signed: row | null, current: bool } for the signed-in composer
// GET ?id=<id>   -> one signed record (its owner or an admin) for the printable view
// GET ?userId=   -> latest record of that user (admin only)
// POST {legalName, address, country, payout, pro?, ipi?, publisher?, categories?, agree:true}
//                -> stores the signature for the current version.

/** Cue-sheet columns on the composer profile (same lazy ALTERs as admin/users.ts). */
const ensureCueColumns = async (db: Ctx["env"]["DB"]) => {
  for (const col of ["cue_name", "pro", "ipi", "publisher_name", "publisher_pro", "publisher_ipi"]) {
    try {
      await db!.prepare(`ALTER TABLE composers ADD COLUMN ${col} TEXT`).run();
    } catch {
      // exists
    }
  }
};

const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const toPublic = (r: AgreementRow) => ({
  id: r.id,
  version: r.version,
  legalName: r.legal_name,
  artistName: r.artist_name,
  address: r.address,
  country: r.country,
  email: r.email,
  categories: r.categories,
  pro: r.pro,
  ipi: r.ipi,
  publisher: r.publisher,
  payout: r.payout,
  signedAt: r.signed_at,
});

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const db = ctx.env.DB;
  await ensureAgreementTable(db);
  const isAdmin = user.role === "admin" || user.email === OWNER_EMAIL;
  const url = new URL(ctx.request.url);

  const id = url.searchParams.get("id");
  if (id) {
    const row = await db.prepare(`SELECT * FROM composer_agreements WHERE id = ?1`).bind(id).first<AgreementRow>();
    if (!row || (row.user_id !== user.id && !isAdmin)) return json({ error: "Not found" }, 404);
    return json({ version: AGREEMENT_VERSION, signed: toPublic(row) });
  }

  const forUser = url.searchParams.get("userId");
  if (forUser) {
    if (!isAdmin) return json({ error: "Admin only" }, 403);
    const row = await latestAgreement(db, forUser);
    return json({ version: AGREEMENT_VERSION, signed: row ? toPublic(row) : null });
  }

  const row = await latestAgreement(db, user.id);
  await ensureCueColumns(db);
  const composer = await db
    .prepare(
      `SELECT id, display_name, cue_name, pro, ipi, publisher_name, publisher_pro, publisher_ipi
         FROM composers WHERE user_id = ?1 LIMIT 1`,
    )
    .bind(user.id)
    .first<{
      id: string;
      display_name: string;
      cue_name: string | null;
      pro: string | null;
      ipi: string | null;
      publisher_name: string | null;
      publisher_pro: string | null;
      publisher_ipi: string | null;
    }>();
  await ensureAiOptinTable(db);
  const ai = await db
    .prepare(`SELECT * FROM composer_ai_optin WHERE user_id = ?1`)
    .bind(user.id)
    .first<AiOptinRow>();
  return json({
    aiOptin: ai
      ? { optedIn: !!ai.opted_in, version: ai.version, signedAt: ai.signed_at, withdrawnAt: ai.withdrawn_at }
      : null,
    aiVersion: AI_ADDENDUM_VERSION,
    // Cue-sheet data the admin already entered: pre-fills the signing form.
    profile: composer
      ? {
          legalName: composer.cue_name,
          pro: composer.pro,
          ipi: composer.ipi,
          publisherName: composer.publisher_name,
          publisherPro: composer.publisher_pro,
          publisherIpi: composer.publisher_ipi,
        }
      : null,
    version: AGREEMENT_VERSION,
    signed: row ? toPublic(row) : null,
    current: !!row && row.version === AGREEMENT_VERSION,
    artistName: composer?.display_name ?? null,
    email: user.email,
  });
};

export const onRequestPost = async (ctx: Ctx) => {
  try {
    if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
    const user = await getSessionUser(ctx);
    if (!user) return json({ error: "Not signed in" }, 401);
    const db = ctx.env.DB;
    const composer = await db
      .prepare(`SELECT id, display_name FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(user.id)
      .first<{ id: string; display_name: string }>();
    if (!composer) return json({ error: "Only composer accounts can sign the Composer Agreement" }, 403);

    const b = await readJson<Record<string, unknown>>(ctx.request);

    // Optional AI Training Addendum: opt in / withdraw (main agreement first).
    if (b?.action === "ai_optin") {
      const signed = await latestAgreement(db, user.id);
      if (!signed || signed.version !== AGREEMENT_VERSION) {
        return json({ error: "Sign the Composer Agreement first" }, 400);
      }
      await ensureAiOptinTable(db);
      const now = new Date().toISOString();
      const optIn = b.optIn === true;
      if (optIn && b.agree !== true) return json({ error: "Please tick the box to agree" }, 400);
      await db
        .prepare(
          `INSERT INTO composer_ai_optin (user_id, composer_id, version, opted_in, signed_at, withdrawn_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(user_id) DO UPDATE SET
             composer_id = excluded.composer_id,
             version = CASE WHEN excluded.opted_in = 1 THEN excluded.version ELSE composer_ai_optin.version END,
             opted_in = excluded.opted_in,
             signed_at = CASE WHEN excluded.opted_in = 1 THEN excluded.signed_at ELSE composer_ai_optin.signed_at END,
             withdrawn_at = CASE WHEN excluded.opted_in = 1 THEN NULL ELSE excluded.withdrawn_at END,
             updated_at = excluded.updated_at`,
        )
        .bind(user.id, composer.id, AI_ADDENDUM_VERSION, optIn ? 1 : 0, optIn ? now : null, optIn ? null : now, now)
        .run();
      return json({ ok: true, optedIn: optIn });
    }

    if (b?.agree !== true) return json({ error: "Please tick the box to agree" }, 400);
    const legalName = clean(b.legalName, 120);
    const address = clean(b.address, 400);
    const country = clean(b.country, 80);
    const payout = clean(b.payout, 400);
    if (legalName.length < 3) return json({ error: "Please enter your full legal name" }, 400);
    if (address.length < 5) return json({ error: "Please enter your address" }, 400);
    if (country.length < 2) return json({ error: "Please enter your country" }, 400);
    if (payout.length < 3) return json({ error: "Please enter your bank details for payouts" }, 400);

    await ensureAgreementTable(db);
    const id = newId("agr");
    const signedAt = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO composer_agreements
           (id, user_id, composer_id, version, legal_name, artist_name, address, country, email,
            categories, pro, ipi, publisher, payout, signed_at, user_agent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`,
      )
      .bind(
        id,
        user.id,
        composer.id,
        AGREEMENT_VERSION,
        legalName,
        composer.display_name,
        address,
        country,
        user.email,
        null, // categories: upload rights are set by the admin, not chosen here
        clean(b.pro, 40) || null,
        clean(b.ipi, 40) || null,
        [clean(b.publisherName, 120), clean(b.publisherPro, 40), clean(b.publisherIpi, 40)]
          .filter(Boolean)
          .join(", ") || null,
        payout,
        signedAt,
        (ctx.request.headers.get("user-agent") ?? "").slice(0, 200),
      )
      .run();

    // The signed details become the composer's cue-sheet info (Admin -> Users
    // shows them, license PDFs print them). Empty answers keep what was there.
    try {
      await ensureCueColumns(db);
      await db
        .prepare(
          `UPDATE composers SET cue_name = ?1,
                  pro = COALESCE(NULLIF(?2,''), pro), ipi = COALESCE(NULLIF(?3,''), ipi),
                  publisher_name = COALESCE(NULLIF(?4,''), publisher_name),
                  publisher_pro = COALESCE(NULLIF(?5,''), publisher_pro),
                  publisher_ipi = COALESCE(NULLIF(?6,''), publisher_ipi)
            WHERE id = ?7`,
        )
        .bind(
          legalName,
          clean(b.pro, 40),
          clean(b.ipi, 40),
          clean(b.publisherName, 120),
          clean(b.publisherPro, 40),
          clean(b.publisherIpi, 40),
          composer.id,
        )
        .run();
    } catch {
      // best effort
    }
    return json({ ok: true, id, version: AGREEMENT_VERSION, signedAt });
  } catch (e) {
    return json({ error: `Agreement: ${(e as Error).message}` }, 500);
  }
};
