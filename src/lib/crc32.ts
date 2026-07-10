// CRC32 for upload manifests: the browser computes each master file's checksum
// once during Bulk Upload, so the server can later stream a valid zip without
// ever reading the files itself (see functions/api/_zipStream.ts).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export const crc32Bytes = (data: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** CRC32 of a File/Blob, read in chunks so big WAVs don't spike memory. */
export const crc32File = async (file: Blob): Promise<number> => {
  const CHUNK = 8 * 1024 * 1024;
  let c = 0xffffffff;
  for (let pos = 0; pos < file.size; pos += CHUNK) {
    const bytes = new Uint8Array(await file.slice(pos, pos + CHUNK).arrayBuffer());
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};
