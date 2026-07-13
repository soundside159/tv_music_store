import { unzipBlob } from "@/lib/audioEncoding";

// Minimal .xlsx reader (no new dependencies): an xlsx file is a zip of XML
// parts — we already ship fflate for the WAV bundles, so we unzip it and read
// the FIRST worksheet + sharedStrings with DOMParser. Good for normal tables
// (text/numbers); no formulas evaluation (cached values are read), no styles.

/**
 * Excel stores control characters as `_xHHHH_` escapes — a line break inside a
 * cell arrives as `_x000D_` (carriage return), which is what showed up verbatim
 * in imported descriptions. A cell that literally contains the text "_x000D_"
 * is stored double-escaped as "_x005F_x000D_", so that form is unescaped back
 * to plain text instead of being turned into a control character.
 * Line endings are then normalised to plain "\n".
 */
const decodeXlsxText = (s: string): string =>
  s
    .replace(/_x005F_x([0-9A-Fa-f]{4})_|_x([0-9A-Fa-f]{4})_/g, (_m, literal: string, code: string) =>
      literal ? `_x${literal}_` : String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/\r\n?/g, "\n");

const colIndex = (ref: string): number => {
  const letters = ref.replace(/\d+$/, "");
  let idx = 0;
  for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(1, idx) - 1;
};

export const parseXlsx = async (file: Blob): Promise<string[][]> => {
  const entries = await unzipBlob(file);
  const dec = new TextDecoder();
  const parser = new DOMParser();

  // Shared strings (most text cells reference this table).
  const shared: string[] = [];
  const sharedRaw = entries["xl/sharedStrings.xml"];
  if (sharedRaw) {
    const doc = parser.parseFromString(dec.decode(sharedRaw), "application/xml");
    const sis = doc.getElementsByTagName("si");
    for (let i = 0; i < sis.length; i++) {
      let s = "";
      const ts = sis[i].getElementsByTagName("t");
      for (let j = 0; j < ts.length; j++) s += ts[j].textContent ?? "";
      shared.push(decodeXlsxText(s));
    }
  }

  const sheetName = Object.keys(entries)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
  if (!sheetName) throw new Error("No worksheet found in the .xlsx file");

  const doc = parser.parseFromString(dec.decode(entries[sheetName]), "application/xml");
  const rows: string[][] = [];
  const rowEls = doc.getElementsByTagName("row");
  for (let r = 0; r < rowEls.length; r++) {
    const row: string[] = [];
    const cells = rowEls[r].getElementsByTagName("c");
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const idx = colIndex(cell.getAttribute("r") ?? "");
      const type = cell.getAttribute("t");
      let val = "";
      if (type === "inlineStr") {
        const ts = cell.getElementsByTagName("t");
        for (let j = 0; j < ts.length; j++) val += ts[j].textContent ?? "";
        val = decodeXlsxText(val);
      } else {
        const v = cell.getElementsByTagName("v")[0]?.textContent ?? "";
        val = type === "s" ? (shared[Number(v)] ?? "") : v;
      }
      while (row.length < idx) row.push("");
      row[idx] = val;
    }
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  return rows;
};
