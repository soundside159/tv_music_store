import { Mp3Encoder } from "@breezystack/lamejs";
import { unzip, zip } from "fflate";

// Browser-side audio pipeline for the admin "Add Track" flow.
// The owner uploads WAV files; we do everything client-side (no server
// transcoding — Cloudflare Workers can't run ffmpeg):
//   - decode WAV via WebAudio
//   - encode MP3 320 (site preview + 320 download) and MP3 128 (128 download)
//     with lamejs (pure JS, no ffmpeg.wasm, no COOP/COEP headers needed)
//   - pack all WAVs into one .zip (fflate) for the WAV download
//   - make a small cover thumbnail via <canvas>

/** Decode any browser-supported audio file into raw PCM. */
export const decodeAudio = async (file: File | Blob): Promise<AudioBuffer> => {
  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const bytes = await file.arrayBuffer();
    return await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }
};

const floatToInt16 = (input: Float32Array): Int16Array => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

/** Encode a decoded AudioBuffer to an MP3 Blob at the given bitrate (kbps). */
export const encodeMp3 = (buffer: AudioBuffer, kbps: number): Blob => {
  const channels = Math.min(2, buffer.numberOfChannels) || 1;
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  const left = floatToInt16(buffer.getChannelData(0));
  const right = channels > 1 ? floatToInt16(buffer.getChannelData(1)) : left;

  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const buf =
      channels > 1 ? encoder.encodeBuffer(l, right.subarray(i, i + blockSize)) : encoder.encodeBuffer(l);
    if (buf.length > 0) chunks.push(new Uint8Array(buf));
  }
  const end = encoder.flush();
  if (end.length > 0) chunks.push(new Uint8Array(end));

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
};

/** WAV file -> MP3 Blob at 320 and 128 kbps, decoding only once. */
export const wavToMp3Pair = async (
  file: File,
): Promise<{ mp3_320: Blob; mp3_128: Blob; duration: number }> => {
  const buffer = await decodeAudio(file);
  const mp3_320 = encodeMp3(buffer, 320);
  const mp3_128 = encodeMp3(buffer, 128);
  return { mp3_320, mp3_128, duration: buffer.duration };
};

/** Pack the original WAV files (stored, uncompressed) into one .zip Blob. */
export const zipWavs = (files: { name: string; file: File }[]): Promise<Blob> =>
  new Promise((resolve, reject) => {
    (async () => {
      const entries: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (const { name, file } of files) {
        let safe = name.replace(/[^\w.\- ]+/g, "_");
        if (!/\.wav$/i.test(safe)) safe += ".wav";
        // Avoid duplicate names inside the archive.
        let unique = safe;
        let n = 2;
        while (used.has(unique.toLowerCase())) {
          unique = safe.replace(/\.wav$/i, ` (${n++}).wav`);
        }
        used.add(unique.toLowerCase());
        entries[unique] = new Uint8Array(await file.arrayBuffer());
      }
      // level 0 = store: WAV barely compresses and store is fast on big files.
      zip(entries, { level: 0 }, (err, data) => {
        if (err) reject(err);
        else resolve(new Blob([data as BlobPart], { type: "application/zip" }));
      });
    })().catch(reject);
  });

/** Unpack a zip Blob into { filename: bytes } (rebuilding the WAV bundle). */
export const unzipBlob = async (blob: Blob): Promise<Record<string, Uint8Array>> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    unzip(bytes, (err, data) => {
      if (err) reject(err);
      else resolve(data as Record<string, Uint8Array>);
    });
  });
};

/** Pack raw { filename: bytes } entries into a stored (level 0) zip Blob. */
export const zipEntries = (entries: Record<string, Uint8Array>): Promise<Blob> =>
  new Promise((resolve, reject) => {
    zip(entries, { level: 0 }, (err, data) => {
      if (err) reject(err);
      else resolve(new Blob([data as BlobPart], { type: "application/zip" }));
    });
  });

/** Format seconds as m:ss. */
export const formatDuration = (secs: number): string => {
  if (!Number.isFinite(secs) || secs <= 0) return "";
  let m = Math.floor(secs / 60);
  let s = Math.round(secs % 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Center-cropped square JPEG thumbnail of a cover image. */
export const makeThumbnail = (file: File, size = 200): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unsupported"));
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Thumbnail failed"))),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
