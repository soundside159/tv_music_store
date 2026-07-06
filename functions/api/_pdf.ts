// Zero-dependency single-page PDF generator for the license certificate.
// Supports the built-in Type1 fonts (Helvetica / Helvetica-Bold / Courier /
// Courier-Bold), RGB fill/stroke colors, rectangles, rounded rectangles,
// polygons, lines, and MANY embedded RGBA images (FlateDecode XObject +
// grayscale SMask each). Pure latin1 strings (1 char = 1 byte) so it runs in
// the Cloudflare Workers runtime. Files starting with "_" are not routed.

export type PdfFont = "helv" | "helvB" | "cour" | "courB";
export type Rgb = [number, number, number]; // 0..1
export type Align = "left" | "center" | "right";

export type PdfOp =
  | { op: "text"; text: string; x: number; y: number; size: number; font?: PdfFont; color?: Rgb; align?: Align }
  | { op: "rect"; x: number; y: number; w: number; h: number; color: Rgb }
  | { op: "rrect"; x: number; y: number; w: number; h: number; r: number; color: Rgb; stroke?: boolean; lineWidth?: number }
  | { op: "poly"; pts: Array<[number, number]>; color: Rgb }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; width: number; color: Rgb }
  | { op: "image"; x: number; y: number; w: number; h: number; key: string };

export interface PdfImage {
  width: number; // pixel dimensions
  height: number;
  rgbB64: string; // zlib-compressed raw RGB, base64
  alphaB64: string; // zlib-compressed raw 8-bit alpha, base64
}

const FONT_RES: Record<PdfFont, string> = { helv: "F1", helvB: "F2", cour: "F3", courB: "F4" };

// Keep to printable ASCII so 1 char === 1 byte (we emit Latin1) and every glyph
// exists in the standard font encoding.
// Map common Unicode punctuation to ASCII so it renders in the standard fonts;
// anything else outside printable ASCII becomes "?".
const UNI: Record<string, string> = {
  "–": "-", "—": "-", "‒": "-", "―": "-",
  "‘": "'", "’": "'", "‚": "'",
  "“": '"', "”": '"', "„": '"',
  "…": "...", "·": "-", "•": "-", " ": " ",
  "×": "x", "→": "->", "≤": "<=", "≥": ">=",
};
const sanitize = (s: string) =>
  Array.from(s)
    .map((c) => {
      if (UNI[c]) return UNI[c];
      const code = c.charCodeAt(0);
      return code >= 32 && code <= 126 ? c : "?";
    })
    .join("");

const escapePdf = (s: string) =>
  sanitize(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const rgb = (c: Rgb) => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;

// Approximate string width in points for the built-in fonts.
export const textWidth = (text: string, size: number, font: PdfFont = "helv"): number => {
  if (font === "cour" || font === "courB") return text.length * size * 0.6;
  const bold = font === "helvB";
  let w = 0;
  for (const ch of sanitize(text)) {
    if ("iljI.,:;'|!()[] ".includes(ch)) w += 0.31;
    else if ("mwMW@".includes(ch)) w += bold ? 0.94 : 0.89;
    else if (ch === ch.toUpperCase() && /[A-Z0-9]/.test(ch)) w += bold ? 0.72 : 0.68;
    else w += bold ? 0.58 : 0.53;
  }
  return w * size;
};

const KAPPA = 0.5523;

const rrectPath = (x: number, y: number, w: number, h: number, r0: number): string => {
  const r = Math.min(r0, w / 2, h / 2);
  const k = KAPPA * r;
  return (
    `${num(x + r)} ${num(y)} m ` +
    `${num(x + w - r)} ${num(y)} l ` +
    `${num(x + w - r + k)} ${num(y)} ${num(x + w)} ${num(y + r - k)} ${num(x + w)} ${num(y + r)} c ` +
    `${num(x + w)} ${num(y + h - r)} l ` +
    `${num(x + w)} ${num(y + h - r + k)} ${num(x + w - r + k)} ${num(y + h)} ${num(x + w - r)} ${num(y + h)} c ` +
    `${num(x + r)} ${num(y + h)} l ` +
    `${num(x + r - k)} ${num(y + h)} ${num(x)} ${num(y + h - r + k)} ${num(x)} ${num(y + h - r)} c ` +
    `${num(x)} ${num(y + r)} l ` +
    `${num(x)} ${num(y + r - k)} ${num(x + r - k)} ${num(y)} ${num(x + r)} ${num(y)} c`
  );
};

export const buildPdf = (
  ops: PdfOp[],
  opts: { width?: number; height?: number; images?: Record<string, PdfImage> } = {},
): Uint8Array => {
  const width = opts.width ?? 595; // A4 portrait, points
  const height = opts.height ?? 842;
  const images = opts.images ?? {};
  const imgKeys = Object.keys(images);
  const imgIndex: Record<string, number> = {};
  imgKeys.forEach((k, i) => (imgIndex[k] = i));

  let content = "";
  for (const o of ops) {
    if (o.op === "text") {
      const font = o.font ?? "helv";
      const color = o.color ?? ([0, 0, 0] as Rgb);
      let x = o.x;
      if (o.align === "center") x = o.x - textWidth(o.text, o.size, font) / 2;
      else if (o.align === "right") x = o.x - textWidth(o.text, o.size, font);
      content +=
        `${rgb(color)} rg BT /${FONT_RES[font]} ${num(o.size)} Tf 1 0 0 1 ${num(x)} ${num(o.y)} Tm ` +
        `(${escapePdf(o.text)}) Tj ET\n`;
    } else if (o.op === "rect") {
      content += `${rgb(o.color)} rg ${num(o.x)} ${num(o.y)} ${num(o.w)} ${num(o.h)} re f\n`;
    } else if (o.op === "rrect") {
      const path = rrectPath(o.x, o.y, o.w, o.h, o.r);
      if (o.stroke) {
        content += `${rgb(o.color)} RG ${num(o.lineWidth ?? 1)} w ${path} s\n`;
      } else {
        content += `${rgb(o.color)} rg ${path} f\n`;
      }
    } else if (o.op === "poly") {
      const [first, ...rest] = o.pts;
      content +=
        `${rgb(o.color)} rg ${num(first[0])} ${num(first[1])} m ` +
        rest.map((p) => `${num(p[0])} ${num(p[1])} l`).join(" ") +
        ` f\n`;
    } else if (o.op === "line") {
      content +=
        `${rgb(o.color)} RG ${num(o.width)} w ` +
        `${num(o.x1)} ${num(o.y1)} m ${num(o.x2)} ${num(o.y2)} l S\n`;
    } else if (o.op === "image" && imgIndex[o.key] !== undefined) {
      const i = imgIndex[o.key];
      content += `q ${num(o.w)} 0 0 ${num(o.h)} ${num(o.x)} ${num(o.y)} cm /Im${i} Do Q\n`;
    }
  }

  // --- object table (dynamic numbering) ------------------------------------
  // 1 Catalog, 2 Pages, 3 Page, 4 Contents, 5-8 Fonts, then 2 objects/image.
  const IMG_BASE = 9;
  const imgResEntries = imgKeys
    .map((k, i) => `/Im${i} ${IMG_BASE + i * 2} 0 R`)
    .join(" ");
  const xobjRes = imgKeys.length ? ` /XObject << ${imgResEntries} >>` : "";

  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R >>${xobjRes} >> ` +
      `/Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>`,
  ];

  for (const k of imgKeys) {
    const img = images[k];
    const i = imgIndex[k];
    const smaskNum = IMG_BASE + i * 2 + 1;
    // atob yields a latin1 string (1 char = 1 byte) — safe to splice as binary.
    const imgRgb = atob(img.rgbB64);
    const imgAlpha = atob(img.alphaB64);
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/SMask ${smaskNum} 0 R /Length ${imgRgb.length} >>\nstream\n${imgRgb}\nendstream`,
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/Length ${imgAlpha.length} >>\nstream\n${imgAlpha}\nendstream`,
    );
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
};
