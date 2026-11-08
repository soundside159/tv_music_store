import { getSessionUser, json, readJson, type Ctx, type D1Database } from "./_utils";
import { cleanCertDetails, type CertDetails } from "./cert-details";

// Saved clients for "Edit certificate" (Account -> Licenses).
// A client is a snapshot of the certificate form (name, company, VAT, address).
// Clicking a client fills the form; the project name is never stored here,
// because one client has many different videos.
//
// GET              -> { clients: [{ id, details }] } for the signed-in user
// POST {details}   -> saves a client; same company name (case-insensitive)
//                     updates that client instead of adding a duplicate
// PATCH {id, name} -> renames a client (empty name = show the company/person)
// DELETE ?id=<id>  -> removes one of the user's clients
//
// Stored JSON = the certificate details plus an optional display "name".

const MAX_CLIENTS = 200;

const ensureTable = async (db: D1Database): Promise<void> => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS cert_clients (
         id         TEXT PRIMARY KEY,
         user_id    TEXT NOT NULL,
         data       TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_cert_clients_user ON cert_clients(user_id)`).run();
};

const newId = () => `cl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

interface Parsed {
  name: string;
  details: CertDetails;
}

const parse = (data: string): Parsed | null => {
  try {
    const obj = JSON.parse(data) as Partial<CertDetails> & { name?: unknown };
    const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 80) : "";
    return { name, details: cleanCertDetails(obj) };
  } catch {
    return null;
  }
};

const pack = (name: string, details: CertDetails) => JSON.stringify({ ...details, name });

const listClients = async (db: D1Database, userId: string) => {
  const rows = await db
    .prepare(`SELECT id, data FROM cert_clients WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2`)
    .bind(userId, MAX_CLIENTS)
    .all<{ id: string; data: string }>();
  return rows.results.flatMap((r) => {
    const p = parse(r.data);
    return p ? [{ id: r.id, name: p.name, details: p.details }] : [];
  });
};

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  await ensureTable(ctx.env.DB);
  return json({ clients: await listClients(ctx.env.DB, user.id) });
};

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const db = ctx.env.DB;

  const body = await readJson<{ details?: Partial<CertDetails> }>(ctx.request);
  const details = { ...cleanCertDetails(body?.details), project: "" };
  const hasName = details.company || details.firstName || details.lastName;
  if (!hasName) return json({ error: "Enter a company or a name first" }, 400);

  await ensureTable(db);
  const existing = await listClients(db, user.id);
  const same = details.company
    ? existing.find((c) => c.details.company.toLowerCase() === details.company.toLowerCase())
    : existing.find(
        (c) =>
          !c.details.company &&
          c.details.firstName.toLowerCase() === details.firstName.toLowerCase() &&
          c.details.lastName.toLowerCase() === details.lastName.toLowerCase(),
      );

  if (same) {
    await db
      .prepare(`UPDATE cert_clients SET data = ?3 WHERE id = ?1 AND user_id = ?2`)
      .bind(same.id, user.id, pack(same.name, details))
      .run();
  } else {
    if (existing.length >= MAX_CLIENTS) return json({ error: "Client list is full" }, 400);
    await db
      .prepare(`INSERT INTO cert_clients (id, user_id, data) VALUES (?1, ?2, ?3)`)
      .bind(newId(), user.id, pack("", details))
      .run();
  }
  return json({ ok: true, updated: !!same, clients: await listClients(db, user.id) });
};

export const onRequestPatch = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const db = ctx.env.DB;
  const body = await readJson<{ id?: unknown; name?: unknown }>(ctx.request);
  const id = typeof body?.id === "string" ? body.id : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!id) return json({ error: "id required" }, 400);
  await ensureTable(db);
  const row = await db
    .prepare(`SELECT data FROM cert_clients WHERE id = ?1 AND user_id = ?2`)
    .bind(id, user.id)
    .first<{ data: string }>();
  const p = row ? parse(row.data) : null;
  if (!p) return json({ error: "Client not found" }, 404);
  await db
    .prepare(`UPDATE cert_clients SET data = ?3 WHERE id = ?1 AND user_id = ?2`)
    .bind(id, user.id, pack(name, p.details))
    .run();
  return json({ ok: true, clients: await listClients(db, user.id) });
};

export const onRequestDelete = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  const id = new URL(ctx.request.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);
  await ensureTable(ctx.env.DB);
  await ctx.env.DB.prepare(`DELETE FROM cert_clients WHERE id = ?1 AND user_id = ?2`)
    .bind(id, user.id)
    .run();
  return json({ ok: true, clients: await listClients(ctx.env.DB, user.id) });
};
