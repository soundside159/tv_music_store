// Minimal, zero-dependency single-page PDF generator (Helvetica / Helvetica-
// Bold, the built-in Type1 fonts — no embedding). Enough for a text license
// certificate. Works in the Cloudflare Workers runtime (pure string + Uint8Array).
// Files starting with "_" are not routed.

export interface PdfLine {
  text: string;
  x: number;
  y: number; // PDF origin is bottom-left
  size: number;
  bold?: boolean;
}

// Keep to printable ASCII so 1 char === 1 byte (we emit Latin1) and every glyph
// exists in the standard Helvetica encoding.
const sanitize = (s: string) =>
  Array.from(s)
    .map((c) => {
      const code = c.charCodeAt(0);
      return code >= 32 && code <= 126 ? c : "?";
    })
    .join("");

const escapePdf = (s: string) =>
  sanitize(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export const buildPdf = (
  lines: PdfLine[],
  opts: { width?: number; height?: number } = {},
): Uint8Array => {
  const width = opts.width ?? 595; // A4 portrait, points
  const height = opts.height ?? 842;

  let content = "";
  for (const l of lines) {
    const font = l.bold ? "F2" : "F1";
    content += `BT /${font} ${l.size} Tf 1 0 0 1 ${l.x} ${l.y} Tm (${escapePdf(l.text)}) Tj ET\n`;
  }

  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
  ];

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
