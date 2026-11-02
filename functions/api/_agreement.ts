import type { D1Database } from "./_utils";
import { AGREEMENT_VERSION } from "../../src/content/composerAgreement";

// Composer Agreement signatures (click-to-sign on the site).
// One row per signature; a composer re-signs when AGREEMENT_VERSION changes.

export const ensureAgreementTable = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS composer_agreements (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL,
         composer_id TEXT,
         version TEXT NOT NULL,
         legal_name TEXT NOT NULL,
         artist_name TEXT,
         address TEXT NOT NULL,
         country TEXT NOT NULL,
         email TEXT,
         categories TEXT,
         pro TEXT,
         ipi TEXT,
         publisher TEXT,
         payout TEXT NOT NULL,
         signed_at TEXT NOT NULL,
         user_agent TEXT
       )`,
    )
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_composer_agreements_user ON composer_agreements(user_id)`)
    .run();
};

export interface AgreementRow {
  id: string;
  user_id: string;
  composer_id: string | null;
  version: string;
  legal_name: string;
  artist_name: string | null;
  address: string;
  country: string;
  email: string | null;
  categories: string | null;
  pro: string | null;
  ipi: string | null;
  publisher: string | null;
  payout: string;
  signed_at: string;
}

/** Latest signature of this user (any version), or null. */
export const latestAgreement = async (db: D1Database, userId: string): Promise<AgreementRow | null> => {
  await ensureAgreementTable(db);
  return (
    (await db
      .prepare(`SELECT * FROM composer_agreements WHERE user_id = ?1 ORDER BY signed_at DESC LIMIT 1`)
      .bind(userId)
      .first<AgreementRow>()) ?? null
  );
};

/** True when the user has signed the CURRENT agreement version. */
export const hasSignedCurrent = async (db: D1Database, userId: string): Promise<boolean> => {
  const row = await latestAgreement(db, userId);
  return !!row && row.version === AGREEMENT_VERSION;
};

export const AGREEMENT_REQUIRED_MSG =
  "Please sign the Composer Agreement first (Account -> Composer -> Agreement), then upload.";

// ---- Optional AI Training Addendum: one row per user, flipped in place. ----
export const ensureAiOptinTable = async (db: D1Database) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS composer_ai_optin (
         user_id TEXT PRIMARY KEY,
         composer_id TEXT,
         version TEXT NOT NULL,
         opted_in INTEGER NOT NULL DEFAULT 0,
         signed_at TEXT,
         withdrawn_at TEXT,
         updated_at TEXT NOT NULL
       )`,
    )
    .run();
};

export interface AiOptinRow {
  user_id: string;
  composer_id: string | null;
  version: string;
  opted_in: number;
  signed_at: string | null;
  withdrawn_at: string | null;
  updated_at: string;
}
