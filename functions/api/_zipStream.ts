// Streaming ZIP writer for downloads (WAV bundles / stems / license PDF).
// Files are stored INDIVIDUALLY in R2 (each under Cloudflare's ~95 MB upload
// cap) with their CRC32 computed at upload time; at download time we lay them
// into a STORE-method zip on the fly — headers + piped bodies + central
// directory. No compression work, no buffering: memory and CPU stay tiny no
// matter how big the bundle is, and the customer still gets one normal .zip.

/** What a lazy opener hands back: the bytes plus the size R2 really has. */
export interface ZipSource {
  body: ReadableStream<Uint8Array>;
  /** Actual object size — wins over the manifest size if they ever disagree. */
  size?: number;
}

export interface ZipEntrySpec {
  /** Filename inside the zip. */
  name: string;
  /** Exact byte size (from the upload manifest). */
  size: number;
  /** CRC32 of the content (unsigned, from the upload manifest). */
  crc: number;
  /**
   * Raw bytes (license PDF), or a LAZY opener for storage objects.
   *
   * Lazy matters: a zip is written entry by entry at the speed of the customer's
   * connection. If every R2 body is opened up front, the streams for the later
   * files sit idle for minutes while the first one trickles out — they can be
   * closed under us, and the customer gets a zip that ends early ("Unexpected
   * end of archive"). Opening each object at the moment it is written keeps
   * every stream short-lived.
   */
  body: Uint8Array | (() => Promise<ZipSource | null>);
}

/** Table-based CRC32 (for small server-side entries like the license PDF). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export const crc32 = (data: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// DOS time/date for zip headers (fixed, uncontroversial value).
const DOS_TIME = 0;
const DOS_DATE = (2026 - 1980) << 9 | (1 << 5) | 1;

export const streamZip = (entries: ZipEntrySpec[]): ReadableStream<Uint8Array> => {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  void (async () => {
    const w = writable.getWriter();
    const enc = new TextEncoder();
    let offset = 0;
    const central: Uint8Array[] = [];
    const write = async (b: Uint8Array) => {
      await w.write(b);
      offset += b.length;
    };
    try {
      for (const e of entries) {
        // Open the source FIRST — the header must declare the size the bytes
        // actually have, or every unzipper reads past the end of the file.
        const raw = e.body instanceof Uint8Array ? e.body : null;
        const src = raw ? null : await (e.body as () => Promise<ZipSource | null>)();
        if (!raw && !src) throw new Error(`Missing file in storage: ${e.name}`);
        const size = raw ? raw.length : (src?.size ?? e.size);

        const nameB = enc.encode(e.name);
        const localOffset = offset;
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); // local file header
        h.setUint16(4, 20, true); // version needed
        h.setUint16(6, 0x0800, true); // flags: UTF-8 filenames
        h.setUint16(8, 0, true); // method: store
        h.setUint16(10, DOS_TIME, true);
        h.setUint16(12, DOS_DATE, true);
        h.setUint32(14, e.crc >>> 0, true);
        h.setUint32(18, size >>> 0, true);
        h.setUint32(22, size >>> 0, true);
        h.setUint16(26, nameB.length, true);
        h.setUint16(28, 0, true); // extra length
        await write(new Uint8Array(h.buffer));
        await write(nameB);

        let written = 0;
        if (raw) {
          await write(raw);
          written = raw.length;
        } else {
          const reader = (src as ZipSource).body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            await write(value);
            written += value.length;
          }
        }
        // The stream ended early (storage hiccup): pad the entry so the zip
        // stays readable — the customer gets a CRC warning on THAT file instead
        // of a whole archive that won't open.
        if (written < size) {
          const pad = new Uint8Array(Math.min(size - written, 64 * 1024));
          while (written < size) {
            const chunk = size - written < pad.length ? pad.subarray(0, size - written) : pad;
            await write(chunk);
            written += chunk.length;
          }
        }

        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); // central directory record
        c.setUint16(4, 20, true); // made by
        c.setUint16(6, 20, true); // version needed
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, 0, true);
        c.setUint16(12, DOS_TIME, true);
        c.setUint16(14, DOS_DATE, true);
        c.setUint32(16, e.crc >>> 0, true);
        c.setUint32(20, size >>> 0, true);
        c.setUint32(24, size >>> 0, true);
        c.setUint16(28, nameB.length, true);
        c.setUint32(42, localOffset >>> 0, true);
        const rec = new Uint8Array(46 + nameB.length);
        rec.set(new Uint8Array(c.buffer), 0);
        rec.set(nameB, 46);
        central.push(rec);
      }
      const cdStart = offset;
      for (const rec of central) await write(rec);
      const cdSize = offset - cdStart;
      const eocd = new DataView(new ArrayBuffer(22));
      eocd.setUint32(0, 0x06054b50, true); // end of central directory
      eocd.setUint16(8, entries.length, true);
      eocd.setUint16(10, entries.length, true);
      eocd.setUint32(12, cdSize >>> 0, true);
      eocd.setUint32(16, cdStart >>> 0, true);
      await w.write(new Uint8Array(eocd.buffer));
      await w.close();
    } catch (err) {
      await w.abort(err);
    }
  })();
  return readable;
};

/** Manifest entry stored per track (wav_manifest / stems_manifest columns). */
export interface ManifestEntry {
  key: string;
  name: string;
  size: number;
  crc: number;
}

export const parseManifest = (raw: string | null | undefined): ManifestEntry[] | null => {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as ManifestEntry[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const ok = arr.every(
      (e) =>
        typeof e?.key === "string" &&
        /^masters\//.test(e.key) &&
        typeof e.name === "string" &&
        Number.isFinite(e.size) &&
        Number.isFinite(e.crc),
    );
    return ok ? arr : null;
  } catch {
    return null;
  }
};
