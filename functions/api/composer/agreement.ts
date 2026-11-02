import { getSessionUser, json, newId, OWNER_EMAIL, readJson, type Ctx } from "../_utils";
import { AGREEMENT_VERSION } from "../../../src/content/composerAgreement";
import { ensureAgreementTable, latestAgreement, type AgreementRow } from "../_agreement";

// Composer Agreement (click-to-sign).
// GET            -> { version, signed: row | null, current: bool } for the signed-in composer
// GET ?id=<id>   -> one signed record (its owner or an admin) for the printable view
// GET ?userId=   -> latest record of that user (admin only)
// POST {legalName, address, country, payout, pro?, ipi?, publisher?, categories?, agree:true}
//                -> stores the signature for the current version.

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
  const composer = await db
    .prepare(`SELECT id, display_name FROM composers WHERE user_id = ?1 LIMIT 1`)
    .bind(user.id)
    .first<{ id: string; display_name: string }>();
  return json({
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
    if (b?.agree !== true) return json({ error: "Please tick the box to agree" }, 400);
    const legalName = clean(b.legalName, 120);
    const address = clean(b.address, 400);
    const country = clean(b.country, 80);
    const payout = clean(b.payout, 200);
    if (legalName.length < 3) return json({ error: "Please enter your full legal name" }, 400);
    if (address.length < 5) return json({ error: "Please enter your address" }, 400);
    if (country.length < 2) return json({ error: "Please enter your country" }, 400);
    if (payout.length < 3) return json({ error: "Please enter how you want to be paid" }, 400);

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
        clean(b.publisher, 200) || null,
        payout,
        signedAt,
        (ctx.request.headers.get("user-agent") ?? "").slice(0, 200),
      )
      .run();

    // Copy cue-sheet data onto the composer profile (best effort: lazy columns).
    try {
      await db
        .prepare(
          `UPDATE composers SET cue_name = COALESCE(NULLIF(cue_name,''), ?1),
                  pro = COALESCE(NULLIF(pro,''), ?2), ipi = COALESCE(NULLIF(ipi,''), ?3)
            WHERE id = ?4`,
        )
        .bind(legalName, clean(b.pro, 40) || null, clean(b.ipi, 40) || null, composer.id)
        .run();
    } catch {
      // cue columns not created yet
    }
    return json({ ok: true, id, version: AGREEMENT_VERSION, signedAt });
  } catch (e) {
    return json({ error: `Agreement: ${(e as Error).message}` }, 500);
  }
};
