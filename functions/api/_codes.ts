// Per-track public codes. Each track gets a RANDOM unique number 1000-9999,
// used in its URL (/track/<code>-<title>) and its download filenames
// (tvmusicstore.com_<code>_<Title>.mp3 / .zip). Random (not sequential) so the
// catalog size can't be read off the numbers.

/** A free random code in 1000-9999, or null if every code is taken. */
export const generateTrackCode = async (db: D1Database): Promise<number | null> => {
  for (let i = 0; i < 80; i++) {
    const code = 1000 + Math.floor(Math.random() * 9000); // 1000..9999
    const clash = await db.prepare(`SELECT id FROM tracks WHERE code = ?1`).bind(code).first();
    if (!clash) return code;
  }
  // Nearly full: scan for the first free code (rare — only near 9000 tracks).
  for (let code = 1000; code <= 9999; code++) {
    const clash = await db.prepare(`SELECT id FROM tracks WHERE code = ?1`).bind(code).first();
    if (!clash) return code;
  }
  return null;
};

/** Adds tracks.code and backfills any track missing one (prefixing its slug). */
export const ensureTrackCodes = async (db: D1Database): Promise<void> => {
  try {
    await db.prepare(`ALTER TABLE tracks ADD COLUMN code INTEGER`).run();
  } catch {
    // column already exists — fine
  }
  const missing = await db
    .prepare(`SELECT id, slug FROM tracks WHERE code IS NULL`)
    .all<{ id: string; slug: string }>();
  for (const row of missing.results) {
    const code = await generateTrackCode(db);
    if (code === null) break; // all codes taken
    const newSlug = `${code}-${row.slug}`;
    await db.prepare(`UPDATE tracks SET code = ?2, slug = ?3 WHERE id = ?1`).bind(row.id, code, newSlug).run();
  }
};
