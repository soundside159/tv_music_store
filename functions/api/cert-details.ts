import { getSessionUser, json, readJson, type Ctx, type D1Database } from "./_utils";

// The name / company / VAT / address / project the customer wants PRINTED on his
// licence certificates ("Edit certificate").
//
// Two levels:
//   - DEFAULT details (cert_details, one row per user): used for licences that
//     have no details of their own yet.
//   - PER-LICENCE details (license_cert_details, one row per licence code: a
//     sync order id or a plan licence code). A video editor can put a different
//     client on every licence.
//
// When a licence PDF is first downloaded while the user has default details,
// those defaults are copied onto the licence (a snapshot), so changing the
// defaults later never rewrites certificates that were already issued.
//
// GET  ?license=<code> -> that licence's details (or the defaults if it has none)
// GET                  -> the default details
// POST {license?, setDefault?, ...fields}
//        license given  -> saves on that licence (owner only); setDefault also
//                          copies them to the defaults
//        no license     -> saves the defaults

export interface CertDetails {
  firstName: string;
  lastName: string;
  company: string;
  vat: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  project: string;
}

const EMPTY: CertDetails = {
  firstName: "",
  lastName: "",
  company: "",
  vat: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postcode: "",
  country: "",
  project: "",
};

export const ensureCertDetailsTable = async (db: D1Database): Promise<void> => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS cert_details (
         user_id   TEXT PRIMARY KEY,
         data      TEXT NOT NULL,
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
};

const clean = (value: unknown, max = 80): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** What the PDF prints. Safe to call for any user — falls back to blanks. */
export const getCertDetails = async (
  db: D1Database,
  userId: string,
): Promise<CertDetails> => {
  try {
    await ensureCertDetailsTable(db);
    const row = await db
      .prepare(`SELECT data FROM cert_details WHERE user_id = ?1`)
      .bind(userId)
      .first<{ data: string }>();
    if (!row) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(row.data) as Partial<CertDetails>) };
  } catch {
    return EMPTY;
  }
};

/** Trims and length-limits every field of an incoming details object. */
export const cleanCertDetails = (body: Partial<CertDetails> | null | undefined): CertDetails => ({
  firstName: clean(body?.firstName, 60),
  lastName: clean(body?.lastName, 60),
  company: clean(body?.company, 100),
  vat: clean(body?.vat, 40),
  address1: clean(body?.address1, 120),
  address2: clean(body?.address2, 120),
  city: clean(body?.city, 60),
  region: clean(body?.region, 60),
  postcode: clean(body?.postcode, 20),
  country: clean(body?.country, 60),
  project: clean(body?.project, 100),
});

const hasAny = (d: CertDetails): boolean => Object.values(d).some((v) => v && v.trim());

export const ensureLicenseCertTable = async (db: D1Database): Promise<void> => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS license_cert_details (
         license_id TEXT PRIMARY KEY,
         user_id    TEXT NOT NULL,
         data       TEXT NOT NULL,
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
};

/** The details saved on one licence, or null when it has none of its own. */
export const getLicenseCertDetails = async (
  db: D1Database,
  licenseId: string,
): Promise<CertDetails | null> => {
  try {
    await ensureLicenseCertTable(db);
    const row = await db
      .prepare(`SELECT data FROM license_cert_details WHERE license_id = ?1`)
      .bind(licenseId)
      .first<{ data: string }>();
    if (!row) return null;
    return { ...EMPTY, ...(JSON.parse(row.data) as Partial<CertDetails>) };
  } catch {
    return null;
  }
};

const saveLicenseCertDetails = async (
  db: D1Database,
  licenseId: string,
  userId: string,
  details: CertDetails,
): Promise<void> => {
  await ensureLicenseCertTable(db);
  await db
    .prepare(
      `INSERT INTO license_cert_details (license_id, user_id, data, updated_at)
       VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(license_id) DO UPDATE SET data = ?3, updated_at = datetime('now')`,
    )
    .bind(licenseId, userId, JSON.stringify(details))
    .run();
};

/**
 * What a licence PDF prints: the licence's own details, else the owner's
 * defaults. With snapshot=true the defaults are copied onto the licence the
 * first time, so later default changes leave this certificate alone. Never
 * throws: falls back to blanks.
 */
export const resolveCertDetails = async (
  db: D1Database,
  ownerId: string,
  licenseId: string | null,
  snapshot: boolean,
): Promise<CertDetails> => {
  try {
    if (licenseId) {
      const own = await getLicenseCertDetails(db, licenseId);
      if (own) return own;
    }
    const defaults = await getCertDetails(db, ownerId);
    if (licenseId && snapshot && hasAny(defaults)) {
      await saveLicenseCertDetails(db, licenseId, ownerId, defaults).catch(() => undefined);
    }
    return defaults;
  } catch {
    return EMPTY;
  }
};

/** True when this licence code (sync order or plan licence) belongs to the user. */
const ownsLicense = async (db: D1Database, userId: string, licenseId: string): Promise<boolean> => {
  const order = await db
    .prepare(`SELECT 1 AS ok FROM sync_orders WHERE id = ?1 AND user_id = ?2`)
    .bind(licenseId, userId)
    .first<{ ok: number }>()
    .catch(() => null);
  if (order) return true;
  const plan = await db
    .prepare(`SELECT 1 AS ok FROM plan_licenses WHERE id = ?1 AND user_id = ?2`)
    .bind(licenseId, userId)
    .first<{ ok: number }>()
    .catch(() => null);
  return !!plan;
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const licenseId = new URL(ctx.request.url).searchParams.get("license");
  if (licenseId) {
    if (!(await ownsLicense(ctx.env.DB, user.id, licenseId))) {
      return json({ error: "License not found" }, 404);
    }
    const own = await getLicenseCertDetails(ctx.env.DB, licenseId);
    return json({
      details: own ?? (await getCertDetails(ctx.env.DB, user.id)),
      custom: !!own,
      email: user.email,
    });
  }
  return json({ details: await getCertDetails(ctx.env.DB, user.id), email: user.email });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const body = await readJson<Partial<CertDetails> & { license?: unknown; setDefault?: unknown }>(
    ctx.request,
  );
  const details = cleanCertDetails(body);
  const licenseId = typeof body?.license === "string" ? body.license.trim() : "";
  const setDefault = body?.setDefault === true;

  if (licenseId) {
    if (!(await ownsLicense(ctx.env.DB, user.id, licenseId))) {
      return json({ error: "License not found" }, 404);
    }
    await saveLicenseCertDetails(ctx.env.DB, licenseId, user.id, details);
  }

  if (!licenseId || setDefault) {
    await ensureCertDetailsTable(ctx.env.DB);
    await ctx.env.DB.prepare(
      `INSERT INTO cert_details (user_id, data, updated_at)
       VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = datetime('now')`,
    )
      .bind(user.id, JSON.stringify(details))
      .run();
  }

  return json({ ok: true, details });
};
