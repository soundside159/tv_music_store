import { getSessionUser, json, readJson, type Ctx, type D1Database } from "./_utils";

// The name / company / VAT / address / project the customer wants PRINTED on his
// licence certificates ("Edit PDF certificate").
//
// GET  -> his saved details
// POST -> saves them; the next PDF he downloads carries them immediately, so a
//         freelancer can re-issue a certificate in his client's company name
//         without asking anyone.

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

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  return json({ details: await getCertDetails(ctx.env.DB, user.id), email: user.email });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const body = await readJson<Partial<CertDetails>>(ctx.request);
  const details: CertDetails = {
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
  };

  await ensureCertDetailsTable(ctx.env.DB);
  await ctx.env.DB.prepare(
    `INSERT INTO cert_details (user_id, data, updated_at)
     VALUES (?1, ?2, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = datetime('now')`,
  )
    .bind(user.id, JSON.stringify(details))
    .run();

  return json({ ok: true, details });
};
