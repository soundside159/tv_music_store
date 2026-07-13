// Streaming ZIP writer for downloads (WAV bundles / stems / license PDF).
// Files are stored INDIVIDUALLY in R2 (each under Cloudflare's ~95 MB upload
// cap) with their CRC32 computed at upload time; at download time we lay them
// into a STORE-method zip on the fly — headers + piped bodies + central
// directory. No compression work, no buffering: memory and CPU stay tiny no
// matter how big the bundle is, and the customer still gets one normal .zip.
//
// TWO RULES, both learned the hard way (truncated archives, "Unexpected end of
// archive" in WinRAR):
//
//  1. NEVER copy the file bodies through JS. A `reader.read()` loop pulls every
//     byte of a 55 MB master into the isolate and writes it back out — that is
//     real CPU time, and a Worker that runs out of CPU is killed MID-RESPONSE:
//     the customer keeps the half-written zip. Bodies are `pipeTo()`-ed into the
//     output stream instead, so the runtime moves the bytes and the isolate only
//     ever touches the ~100-byte headers.
//
//  2. Bodies are opened LAZILY, one at a time. Opening every R2 object up front
//     leaves the later streams idle for minutes while the first file trickles
//     down the customer's line — idle streams get closed under us, and the zip
//     ends early.

/** What a lazy opener hands back: the bytes plus the size R2 really has. */
export interface ZipSource {
  body: ReadableStream<Uint8Array>;
  /** Actual object size — must match the size declared in the entry. */
  size?: number;
}

export interface ZipEntrySpec {
  /** Filename inside the zip. */
  name: string;
  /** Exact byte size (R2 object size / the byte array's length). */
  size: number;
  /** CRC32 of the content (unsigned, from the upload manifest). */
  crc: number;
  /** Raw bytes (license PDF), or a LAZY opener for storage objects. */
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

const LOCAL_HEADER = 30;
const CENTRAL_RECORD = 46;
const EOCD = 22;

/**
 * Exact byte length of the zip these entries produce (STORE method, no extras).
 * Lets the response carry a real Content-Length: the browser can show progress,
 * and a truncated transfer becomes a FAILED download instead of a corrupt file
 * the customer only discovers when the unzipper chokes on it.
 */
export const zipSize = (entries: ZipEntrySpec[]): number => {
  const enc = new TextEncoder();
  let total = EOCD;
  for (const e of entries) {
    const nameLen = enc.encode(e.name).length;
    total += LOCAL_HEADER + nameLen + e.size + CENTRAL_RECORD + nameLen;
  }
  return total;
};

/** Cloudflare's FixedLengthStream — lets the response declare Content-Length. */
const makeTransform = (total?: number): TransformStream<Uint8Array, Uint8Array> => {
  const Fixed = (globalThis as unknown as {
    FixedLengthStream?: new (len: number) => TransformStream<Uint8Array, Uint8Array>;
  }).FixedLengthStream;
  if (total !== undefined && typeof Fixed === "function") return new Fixed(total);
  return new TransformStream<Uint8Array, Uint8Array>();
};

/**
 * @param total  Pass `zipSize(entries)` to get a fixed-length (Content-Length)
 *               response; omit for a chunked one.
 */
export const streamZip = (entries: ZipEntrySpec[], total?: number): ReadableStream<Uint8Array> => {
  const { readable, writable } = makeTransform(total);
  void (async () => {
    const enc = new TextEncoder();
    let writer = writable.getWriter();
    let offset = 0;
    const central: Uint8Array[] = [];
    const write = async (b: Uint8Array) => {
      await writer.write(b);
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
        const h = new DataView(new ArrayBuffer(LOCAL_HEADER));
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

        if (raw) {
          await write(raw);
        } else {
          // The runtime moves these bytes, not the isolate (see rule 1 above).
          // pipeTo needs the writable unlocked, so the writer steps aside.
          writer.releaseLock();
          await (src as ZipSource).body.pipeTo(writable, { preventClose: true });
          writer = writable.getWriter();
          offset += size;
        }

        const c = new DataView(new ArrayBuffer(CENTRAL_RECORD));
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
        const rec = new Uint8Array(CENTRAL_RECORD + nameB.length);
        rec.set(new Uint8Array(c.buffer), 0);
        rec.set(nameB, CENTRAL_RECORD);
        central.push(rec);
      }
      const cdStart = offset;
      for (const rec of central) await write(rec);
      const cdSize = offset - cdStart;
      const eocd = new DataView(new ArrayBuffer(EOCD));
      eocd.setUint32(0, 0x06054b50, true); // end of central directory
      eocd.setUint16(8, entries.length, true);
      eocd.setUint16(10, entries.length, true);
      eocd.setUint32(12, cdSize >>> 0, true);
      eocd.setUint32(16, cdStart >>> 0, true);
      await writer.write(new Uint8Array(eocd.buffer));
      await writer.close();
    } catch (err) {
      try {
        await writer.abort(err);
      } catch {
        // the writer was already released/errored — nothing left to abort
      }
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
