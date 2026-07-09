import { unzipBlob, zipEntries } from "@/lib/audioEncoding";
import { cleanVersionLabel } from "@/lib/downloadTrack";

// Renaming a version must rename the matching WAV inside the private master
// bundle too — otherwise the MP3 previews carry the new name while customer
// WAV downloads still ship the old filename. Used by BOTH rename spots
// (track-page Versions block and the Tracks Edit expander).

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const uploadZip = async (blob: Blob, filename: string): Promise<string> => {
  const base = filename.replace(/\.[^.]+$/, "");
  const res = await fetch(
    `/api/admin/upload-audio?kind=wavzip&filename=${encodeURIComponent(base)}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/zip" },
      body: blob,
    },
  );
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; key?: string; error?: string };
  if (!res.ok || !d.ok || !d.key) throw new Error(d.error ?? "Upload failed");
  return d.key;
};

/**
 * Downloads the track's WAV bundle, renames the entry matching `oldLabel` to
 * "<Title> (<newLabel>).wav", re-zips and uploads. Returns the new R2 key to
 * pass into the rename_version action, or null when there is no bundle / no
 * matching file (the rename still proceeds — only the zip stays as it was).
 */
export const renameWavInBundle = async (
  trackId: string,
  trackTitle: string,
  oldLabel: string,
  newLabel: string,
): Promise<string | null> => {
  const r = await fetch(`/api/admin/master?track=${encodeURIComponent(trackId)}`, {
    credentials: "include",
  });
  if (!r.ok) return null;
  let entries: Record<string, Uint8Array>;
  try {
    entries = await unzipBlob(await r.blob());
  } catch {
    return null;
  }

  const target = norm(oldLabel);
  const match = Object.keys(entries).find((name) => {
    if (!/\.wav$/i.test(name)) return false;
    const base = name.replace(/\.wav$/i, "");
    const cleaned = cleanVersionLabel(base, trackTitle);
    // "Epic Battle (short).wav" → "short"; the Main file is often just
    // "Epic Battle.wav" (cleaned = "") — match it against the "Main" label.
    if (cleaned) return norm(cleaned) === target;
    return target === "main" || norm(base) === target;
  });
  if (!match) return null;

  let newName =
    newLabel.toLowerCase() === "main"
      ? `${trackTitle}.wav`
      : `${trackTitle} (${newLabel}).wav`;
  newName = newName.replace(/[^\w.\-() ]+/g, "_");
  if (Object.keys(entries).some((e) => e !== match && e.toLowerCase() === newName.toLowerCase())) {
    newName = newName.replace(/\.wav$/i, ` (2).wav`);
  }
  if (newName === match) return null;

  const bytes = entries[match];
  delete entries[match];
  entries[newName] = bytes;
  const blob = await zipEntries(entries);
  return uploadZip(blob, trackTitle);
};
