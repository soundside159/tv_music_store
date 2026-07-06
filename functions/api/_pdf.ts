// Zero-dependency single-page PDF generator for the license certificate.
// Supports the built-in Type1 fonts (Helvetica / Helvetica-Bold / Courier /
// Courier-Bold), RGB fill colors, rectangles, lines and one embedded RGBA
// image (FlateDecode XObject + grayscale SMask for transparency).
// Works in the Cloudflare Workers runtime (pure latin1 strings — 1 char = 1 byte).
// Files starting with "_" are not routed.

export type PdfFont = "helv" | "helvB" | "cour" | "courB";
export type Rgb = [number, number, number]; // 0..1

export type PdfOp =
  | { op: "text"; text: string; x: number; y: number; size: number; font?: PdfFont; color?: Rgb }
  | { op: "rect"; x: number; y: number; w: number; h: number; color: Rgb }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; width: number; color: Rgb }
  | { op: "image"; x: number; y: number; w: number; h: number };

export interface PdfImage {
  width: number; // pixel dimensions
  height: number;
  rgbB64: string; // zlib-compressed raw RGB, base64
  alphaB64: string; // zlib-compressed raw 8-bit alpha, base64
}

const FONT_RES: Record<PdfFont, string> = { helv: "F1", helvB: "F2", cour: "F3", courB: "F4" };

// Keep to printable ASCII so 1 char === 1 byte (we emit Latin1) and every glyph
// exists in the standard font encoding.
const sanitize = (s: string) =>
  Array.from(s)
    .map((c) => {
      const code = c.charCodeAt(0);
      return code >= 32 && code <= 126 ? c : "?";
    })
    .join("");

const escapePdf = (s: string) =>
  sanitize(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const rgb = (c: Rgb) => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;

// Approximate string width in points for the built-in fonts (good enough for
// centering / right-aligning short lines).
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

export const buildPdf = (
  ops: PdfOp[],
  opts: { width?: number; height?: number; image?: PdfImage } = {},
): Uint8Array => {
  const width = opts.width ?? 595; // A4 portrait, points
  const height = opts.height ?? 842;

  let content = "";
  for (const o of ops) {
    if (o.op === "text") {
      const font = FONT_RES[o.font ?? "helv"];
      const color = o.color ?? ([0, 0, 0] as Rgb);
      content +=
        `${rgb(color)} rg BT /${font} ${num(o.size)} Tf 1 0 0 1 ${num(o.x)} ${num(o.y)} Tm ` +
        `(${escapePdf(o.text)}) Tj ET\n`;
    } else if (o.op === "rect") {
      content += `${rgb(o.color)} rg ${num(o.x)} ${num(o.y)} ${num(o.w)} ${num(o.h)} re f\n`;
    } else if (o.op === "line") {
      content +=
        `${rgb(o.color)} RG ${num(o.width)} w ` +
        `${num(o.x1)} ${num(o.y1)} m ${num(o.x2)} ${num(o.y2)} l S\n`;
    } else if (o.op === "image" && opts.image) {
      content += `q ${num(o.w)} 0 0 ${num(o.h)} ${num(o.x)} ${num(o.y)} cm /Img1 Do Q\n`;
    }
  }

  const img = opts.image;
  // atob yields a latin1 string where every char is one byte — safe to splice
  // into the string-assembled PDF as a binary stream.
  const imgRgb = img ? atob(img.rgbB64) : "";
  const imgAlpha = img ? atob(img.alphaB64) : "";

  const xobjRes = img ? " /XObject << /Img1 7 0 R >>" : "";
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 9 0 R /F4 10 0 R >>${xobjRes} >> ` +
      `/Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
  ];
  if (img) {
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/SMask 8 0 R /Length ${imgRgb.length} >>\nstream\n${imgRgb}\nendstream`,
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/Length ${imgAlpha.length} >>\nstream\n${imgAlpha}\nendstream`,
    );
  } else {
    // Keep object numbering stable (fonts F3/F4 live at 9/10).
    objects.push(`<< /Type /Catalog >>`, `<< /Type /Catalog >>`);
  }
  objects.push(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>`,
  );

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
