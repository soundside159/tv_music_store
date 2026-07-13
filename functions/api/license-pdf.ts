import { getSessionUser, json, OWNER_EMAIL, type Ctx, type D1Database } from "./_utils";
import { buildPdf, textWidth, type PdfOp, type PdfImage, type Rgb } from "./_pdf";
import { LOGO_ALPHA_B64, LOGO_HEIGHT, LOGO_RGB_B64, LOGO_WIDTH } from "./_logo";
import { ASSETS } from "./_assets";
import { getOrCreatePlanLicense } from "./_licenses";
import { getCertDetails, type CertDetails } from "./cert-details";

// GET /api/license-pdf?order=<sync_order_id>  -> certificate for a purchased
//     one-time license (Account -> Licenses "License PDF").
// GET /api/license-pdf?slug=<track_slug>      -> certificate for the signed-in
//     user's current subscription plan (download modal "Include PDF License").
// Generated on the fly; the session cookie proves ownership.
// Subscription certificates carry a persistent, signed license code minted by
// ./_licenses (getOrCreatePlanLicense) and looked up in /admin -> Licenses.

interface LicenseInfo {
  name: string;
  scope: string; // one-line description of what the license grants
  permitted: string[];
  notPermitted: string[];
}

const TIER_INFO: Record<string, LicenseInfo> = {
  personal: {
    name: "Personal License",
    scope: "grants the right to use the track in personal, non-commercial projects.",
    permitted: [
      "Personal, non-commercial projects",
      "YouTube, Vimeo & social media",
      "Podcasts & online streaming",
      "Monetized personal content",
      "Websites & online courses",
    ],
    notPermitted: [
      "Commercial or client work",
      "Paid advertising campaigns",
      "Broadcast TV, radio, film or cinema",
      "Apps, video games or software",
      "Resale or redistribution of the track",
    ],
  },
  commercial: {
    name: "Commercial License",
    scope: "grants the right to synchronize and use the track in one (1) online project.",
    permitted: [
      "Client projects, brand & marketing videos",
      "Monetized YouTube, Vimeo & social media",
      "Websites, landing pages & online courses",
      "Paid social & web ads (one online project)",
      "Podcasts & online streaming content",
    ],
    notPermitted: [
      "Broadcast TV, radio, film or cinema",
      "Mobile apps, video games or software",
      "Distribution or resale of the track itself",
      "Multiple projects (one license per project)",
      "Media buyouts or exclusivity",
    ],
  },
  professional: {
    name: "Professional License",
    scope: "grants full commercial rights, including broadcast and interactive media, for one (1) project.",
    permitted: [
      "Everything in the Commercial license",
      "Broadcast TV, radio, film & cinema",
      "Video games & software products",
      "Paid advertising campaigns",
      "Client & commercial projects",
    ],
    notPermitted: [
      "Resale or redistribution of the track itself",
      "Reselling the track as stock music",
      "Registering the music as your own (Content ID)",
      "Exclusive ownership or buy-outs",
      "Use beyond the licensed project",
    ],
  },
};

const PLAN_INFO: Record<string, LicenseInfo> = {
  free: {
    name: "Free Plan License",
    scope: "grants personal, non-commercial use while an attribution credit to TV Music Store is shown.",
    permitted: [
      "Personal & non-commercial projects",
      "YouTube & social platforms",
      "Podcasts & online streaming",
      "Credit to TV Music Store (required)",
    ],
    notPermitted: [
      "Commercial or client work",
      "Paid advertising or broadcast",
      "Resale or redistribution of the track",
      "Use without crediting TV Music Store",
    ],
  },
  pro: {
    name: "Pro Plan License",
    scope: "grants monetized use across online platforms for one channel / brand.",
    permitted: [
      "Monetized content on all platforms",
      "YouTube, podcasts & streaming",
      "One channel / brand",
      "Online client content",
    ],
    notPermitted: [
      "Broadcast TV, radio or cinema",
      "Multiple brands or channels",
      "Resale or redistribution of the track",
      "Registering the music as your own (Content ID)",
    ],
  },
  max: {
    name: "Max Plan License",
    scope: "grants full commercial and broadcast rights across multiple brands and channels.",
    permitted: [
      "Commercial & client work",
      "Paid ads & broadcast",
      "Multiple channels / brands",
      "All online platforms",
    ],
    notPermitted: [
      "Resale or redistribution of the track",
      "Reselling the track as stock music",
      "Registering the music as your own (Content ID)",
      "Exclusive ownership or buy-outs",
    ],
  },
};

const TERMS_LINE = "Full license terms: tvmusicstore.com/license-terms";

const prettify = (idOrSlug: string) =>
  idOrSlug
    .replace(/^trk_/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

// --- brand palette ---------------------------------------------------------
const GOLD: Rgb = [0.957, 0.769, 0.188]; // #F4C430
const GOLD_DARK: Rgb = [0.62, 0.47, 0.08]; // readable gold on white
const INK: Rgb = [0.1, 0.1, 0.12];
const GRAY: Rgb = [0.44, 0.45, 0.48];
const GRAY_LIGHT: Rgb = [0.62, 0.63, 0.66];
const HEADER_BG: Rgb = [0.071, 0.075, 0.09]; // dark graphite
const PANEL_BG: Rgb = [0.957, 0.957, 0.961]; // light gray panel
const RULE: Rgb = [0.86, 0.86, 0.87];
const RULE_SOFT: Rgb = [0.9, 0.9, 0.91];
const WHITE: Rgb = [1, 1, 1];
const GREEN: Rgb = [0.16, 0.55, 0.24];
const RED: Rgb = [0.79, 0.22, 0.2];
const GOLD_SOFT: Rgb = [0.996, 0.965, 0.86]; // pale gold callout box
const LINK: Rgb = [0.16, 0.4, 0.75];

const PAGE_W = 595;
const PAGE_H = 842;
const L = 48;
const R = PAGE_W - L; // 547
const spaced = (s: string) => s.split("").join(" "); // letterspaced caps

/** Word-wraps a short phrase into up to `maxLines` lines that fit `maxW`. */
const wrapLines = (text: string, maxW: number, size: number, maxLines = 3): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, size) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}...`;
    return kept;
  }
  return lines;
};

export interface CertData {
  title: string; // license name, e.g. "Commercial License"
  scope: string; // one-line description of what the license grants
  permitted: string[];
  notPermitted: string[];
  licenseeName: string;
  licenseeEmail: string;
  /** Optional buyer details from "Edit PDF certificate" — printed when set. */
  company?: string;
  vat?: string;
  address?: string;
  project?: string;
  licenseNumber: string; // primary human-facing code (big box)
  paymentRef: string; // payment/transaction reference (second code)
  issued: string;
  orderNo: string;
  typeLabel: string; // "Commercial · Online" / "Subscription · Max Plan"
  trackTitle: string;
  composer: string;
  trackPage: string; // URL
  /** Sync / cue-sheet block (composer + publisher PRO data); null = omit. */
  cue?: {
    composerName: string;
    composerPro: string;
    composerIpi: string;
    publisherName: string;
    publisherPro: string;
    publisherIpi: string;
  } | null;
}

const INNER_W = R - L;

/** A label/value pair in the details grid. */
const kv = (ops: PdfOp[], x: number, y: number, label: string, value: string, opts: { value?: Rgb; bold?: boolean; vx?: number } = {}) => {
  ops.push({ op: "text", text: label.toUpperCase(), x, y, size: 8, font: "helvB", color: GRAY });
  ops.push({ op: "text", text: value, x: opts.vx ?? x + 82, y, size: 9.5, font: opts.bold ? "helvB" : "helv", color: opts.value ?? INK });
};

/** Green check (ok) or red cross (not) mark at a list row. */
const mark = (ops: PdfOp[], x: number, baseY: number, ok: boolean) => {
  const my = baseY + 2.5;
  if (ok) {
    ops.push({ op: "line", x1: x, y1: my, x2: x + 2.8, y2: my - 2.8, width: 1.5, color: GREEN });
    ops.push({ op: "line", x1: x + 2.8, y1: my - 2.8, x2: x + 7.4, y2: my + 3.8, width: 1.5, color: GREEN });
  } else {
    ops.push({ op: "line", x1: x, y1: my - 3, x2: x + 6.4, y2: my + 3.4, width: 1.4, color: RED });
    ops.push({ op: "line", x1: x, y1: my + 3.4, x2: x + 6.4, y2: my - 3, width: 1.4, color: RED });
  }
};

export const buildCertificate = (fields: CertData): Uint8Array => {
  const ops: PdfOp[] = [];

  // ===================== HEADER BAND ======================================
  const bandY = 752;
  ops.push({ op: "rect", x: 0, y: bandY, w: PAGE_W, h: PAGE_H - bandY, color: HEADER_BG });
  ops.push({ op: "image", key: "deco", x: PAGE_W - 150, y: bandY, w: 150, h: PAGE_H - bandY });

  const logoH = 40;
  const logoW = (logoH * LOGO_WIDTH) / LOGO_HEIGHT;
  ops.push({ op: "image", key: "logo", x: L, y: 784, w: logoW, h: logoH });

  const wordX = L + logoW + 16;
  ops.push({ op: "text", text: spaced("TV MUSIC STORE"), x: wordX + 1, y: 810, size: 7.5, color: GOLD });
  ops.push({ op: "text", text: "Music License Certificate", x: wordX, y: 788, size: 20, font: "helvB", color: WHITE });

  ops.push({ op: "text", text: "ISSUED", x: R, y: 810, size: 7.5, font: "helvB", color: GRAY_LIGHT, align: "right" });
  ops.push({ op: "text", text: fields.issued, x: R, y: 792, size: 10.5, font: "helvB", color: WHITE, align: "right" });

  ops.push({ op: "rect", x: 0, y: bandY - 3, w: PAGE_W, h: 3, color: GOLD });

  // ===================== SEAL (right) + LICENSE NUMBER (left) ==============
  const sealSz = 96;
  ops.push({ op: "image", key: "sign", x: R - sealSz, y: 648, w: sealSz, h: sealSz });

  const boxW = 388;
  ops.push({ op: "rrect", x: L, y: 698, w: boxW, h: 46, r: 6, color: PANEL_BG });
  ops.push({ op: "rect", x: L + 1.5, y: 702, w: 3.5, h: 38, color: GOLD });
  ops.push({ op: "text", text: spaced("LICENSE NUMBER"), x: L + 20, y: 730, size: 7.5, font: "helvB", color: GRAY });
  ops.push({ op: "text", text: fields.licenseNumber, x: L + 20, y: 709, size: 16, font: "helvB", color: INK });

  // ===================== DETAILS + LICENSED TO ============================
  const midX = 300;
  ops.push({ op: "text", text: spaced("LICENSE DETAILS"), x: L, y: 668, size: 8.5, font: "helvB", color: GOLD_DARK });
  ops.push({ op: "text", text: spaced("LICENSED TO"), x: midX, y: 668, size: 8.5, font: "helvB", color: GOLD_DARK });
  ops.push({ op: "line", x1: midX - 18, y1: 578, x2: midX - 18, y2: 660, width: 0.7, color: RULE_SOFT });

  kv(ops, L, 646, "Purchase Code", fields.paymentRef, { bold: true });
  kv(ops, L, 626, "Issued", fields.issued, { bold: true });
  kv(ops, L, 606, "Order", fields.orderNo, { bold: true });
  kv(ops, L, 586, "Type", fields.typeLabel, { bold: true });

  // LICENSED TO — the two fixed rows plus whatever optional buyer details the
  // customer filled in ("Edit PDF certificate"). The block must land ABOVE the
  // rule at y=570, so the row step tightens as rows are added and long values
  // are cut to the column width instead of running off the page.
  {
    const vx = midX + 66;
    const colW = R - vx;
    const fit = (value: string, size: number, font?: "helvB") => {
      if (textWidth(value, size, font) <= colW) return value;
      let out = value;
      while (out.length > 1 && textWidth(`${out}…`, size, font) > colW) out = out.slice(0, -1);
      return `${out.trimEnd()}…`;
    };

    const rows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Licensee", value: fields.licenseeName, bold: true },
      { label: "Email", value: fields.licenseeEmail },
    ];
    const optional: Array<[string, string | undefined]> = [
      ["Company", fields.company],
      ["VAT ID", fields.vat],
      ["Address", fields.address],
      ["Project", fields.project],
    ];
    for (const [label, value] of optional) if (value) rows.push({ label, value });

    // 646 down to 581 at the tightest — 11pt of air above the rule.
    const step = rows.length <= 4 ? 20 : rows.length === 5 ? 16 : 13;
    rows.forEach((r, i) => {
      kv(ops, midX, 646 - i * step, r.label, fit(r.value, 9.5, r.bold ? "helvB" : undefined), {
        bold: r.bold,
        vx,
      });
    });
  }

  ops.push({ op: "line", x1: L, y1: 570, x2: R, y2: 570, width: 0.7, color: RULE });

  // ===================== LICENSED TRACK ===================================
  ops.push({ op: "text", text: spaced("LICENSED TRACK"), x: L, y: 552, size: 8.5, font: "helvB", color: GOLD_DARK });
  kv(ops, L, 530, "Track", fields.trackTitle, { bold: true });
  kv(ops, L, 510, "Composer", fields.composer, { bold: true });
  ops.push({ op: "text", text: "TRACK PAGE", x: L, y: 490, size: 8, font: "helvB", color: GRAY });
  ops.push({ op: "text", text: fields.trackPage, x: L + 82, y: 490, size: 9, color: LINK });

  ops.push({ op: "line", x1: L, y1: 474, x2: R, y2: 474, width: 0.7, color: RULE });

  // ===================== SCOPE & GRANTS ===================================
  ops.push({ op: "text", text: spaced("LICENSE SCOPE & GRANTS"), x: L, y: 456, size: 8.5, font: "helvB", color: GOLD_DARK });

  const namePrefix = `${fields.title} — `;
  const pw = textWidth(namePrefix, 9.5, "helvB");
  ops.push({ op: "text", text: fields.title, x: L, y: 434, size: 9.5, font: "helvB", color: INK });
  ops.push({ op: "text", text: "— ", x: L + textWidth(fields.title + " ", 9.5, "helvB"), y: 434, size: 9.5, color: GRAY });
  // wrap the scope: first line starts after the bold name prefix, rest full width
  const scopeWords = fields.scope.split(/\s+/);
  let line = "";
  let firstDone = false;
  let sy = 434;
  const flush = (avail: number, atX: number) => {
    ops.push({ op: "text", text: line, x: atX, y: sy, size: 9.5, color: GRAY });
  };
  let curAvail = INNER_W - pw;
  let curX = L + pw;
  for (const w of scopeWords) {
    const next = line ? `${line} ${w}` : w;
    if (textWidth(next, 9.5) <= curAvail || !line) line = next;
    else {
      flush(curAvail, curX);
      line = w;
      sy -= 15;
      firstDone = true;
      curAvail = INNER_W;
      curX = L;
    }
  }
  if (line) flush(curAvail, curX);
  void firstDone;

  // Permitted / Not permitted columns
  const listTop = sy - 30;
  const colR = midX + 8;
  ops.push({ op: "text", text: spaced("PERMITTED USES"), x: L, y: listTop, size: 8.5, font: "helvB", color: GREEN });
  ops.push({ op: "text", text: spaced("NOT PERMITTED"), x: colR, y: listTop, size: 8.5, font: "helvB", color: RED });
  const drawList = (items: string[], x: number, ok: boolean) => {
    let y = listTop - 18;
    for (const it of items.slice(0, 5)) {
      mark(ops, x, y, ok);
      ops.push({ op: "text", text: it, x: x + 13, y, size: 8.8, color: INK });
      y -= 16.5;
    }
  };
  drawList(fields.permitted, L, true);
  drawList(fields.notPermitted, colR, false);

  // ===================== SYNC / CUE SHEET INFORMATION =====================
  // Composer + publisher PRO data for cue-sheet reporting and broadcast
  // registrations — printed only when the composer profile carries the info.
  if (fields.cue) {
    const c = fields.cue;
    const cueTop = 302;
    const cueH = 80;
    ops.push({ op: "rrect", x: L, y: cueTop - cueH, w: INNER_W, h: cueH, r: 6, color: PANEL_BG });
    ops.push({ op: "text", text: spaced("SYNC / CUE SHEET INFORMATION"), x: L + 16, y: cueTop - 18, size: 8, font: "helvB", color: GOLD_DARK });
    ops.push({
      op: "text",
      text: "For cue sheet reporting and broadcast registrations.",
      x: R - 16,
      y: cueTop - 18,
      size: 7.3,
      color: GRAY_LIGHT,
      align: "right",
    });
    const cueMid = midX + 8;
    ops.push({ op: "line", x1: cueMid - 14, y1: cueTop - cueH + 10, x2: cueMid - 14, y2: cueTop - 28, width: 0.7, color: RULE });
    ops.push({ op: "text", text: spaced("COMPOSER"), x: L + 16, y: cueTop - 34, size: 7, font: "helvB", color: GRAY });
    ops.push({ op: "text", text: spaced("PUBLISHER"), x: cueMid, y: cueTop - 34, size: 7, font: "helvB", color: GRAY });
    const cueKv = (x: number, y: number, label: string, value: string) => {
      ops.push({ op: "text", text: label, x, y, size: 7.5, font: "helvB", color: GRAY_LIGHT });
      ops.push({ op: "text", text: value || "—", x: x + 58, y, size: 8.3, font: "helvB", color: INK });
    };
    cueKv(L + 16, cueTop - 48, "NAME", c.composerName);
    cueKv(L + 16, cueTop - 60, "PRO", c.composerPro);
    cueKv(L + 16, cueTop - 72, "IPI / CAE", c.composerIpi);
    cueKv(cueMid, cueTop - 48, "NAME", c.publisherName);
    cueKv(cueMid, cueTop - 60, "PRO", c.publisherPro);
    cueKv(cueMid, cueTop - 72, "IPI / CAE", c.publisherIpi);
  }

  // ===================== YOUTUBE CONTENT ID CALLOUT =======================
  const boxTop = 214;
  const boxH = 66;
  ops.push({ op: "rrect", x: L, y: boxTop - boxH, w: INNER_W, h: boxH, r: 6, color: GOLD_SOFT });
  ops.push({ op: "rect", x: L + 1.5, y: boxTop - boxH + 5, w: 3.5, h: boxH - 10, color: GOLD });
  ops.push({ op: "text", text: "YouTube Content ID", x: L + 18, y: boxTop - 20, size: 9.5, font: "helvB", color: GOLD_DARK });
  const cidText =
    "This certificate can be used to resolve Content ID claims on YouTube for the licensed use described above. " +
    "Send your License Number to contact@tvmusicstore.com and we will release the claim per video. " +
    "All music remains the intellectual property of TV Music Store and its composers.";
  wrapLines(cidText, INNER_W - 34, 8.3, 3).forEach((ln, i) => {
    ops.push({ op: "text", text: ln, x: L + 18, y: boxTop - 34 - i * 11, size: 8.3, color: GRAY });
  });

  // ===================== FOOTER ===========================================
  ops.push({ op: "line", x1: L, y1: 120, x2: R, y2: 120, width: 0.7, color: RULE });
  ops.push({ op: "text", text: TERMS_LINE, x: L, y: 104, size: 8, font: "helvB", color: GRAY });
  ops.push({ op: "text", text: "Questions? contact@tvmusicstore.com · tvmusicstore.com", x: L, y: 90, size: 8, color: GRAY_LIGHT });
  ops.push({ op: "text", text: "The music remains the property of its rights holders (TV Music Store and/or its composers). This certificate grants a limited, non-exclusive license as described above.", x: L, y: 74, size: 7.3, color: GRAY_LIGHT });

  // ===================== IMAGES ===========================================
  const usedKeys = Array.from(new Set(ops.filter((o) => o.op === "image").map((o) => (o as { key: string }).key)));
  const images: Record<string, PdfImage> = {};
  for (const key of usedKeys) {
    if (key === "logo") {
      images.logo = { width: LOGO_WIDTH, height: LOGO_HEIGHT, rgbB64: LOGO_RGB_B64, alphaB64: LOGO_ALPHA_B64 };
    } else {
      const a = ASSETS[key];
      if (a) images[key] = { width: a.w, height: a.h, rgbB64: a.rgb, alphaB64: a.alpha };
    }
  }

  return buildPdf(ops, { images });
};

const pdfResponse = (bytes: Uint8Array, filename: string) =>
  new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const trackUrl = (slug?: string | null) => (slug ? `tvmusicstore.com/track/${slug}` : "tvmusicstore.com");

/** Sync / cue-sheet info of the track's composer profile (null = omit block). */
const fetchCue = async (db: D1Database, trackId: string | null | undefined): Promise<CertData["cue"]> => {
  if (!trackId) return null;
  try {
    const row = await db
      .prepare(
        `SELECT c.display_name, c.cue_name, c.pro, c.ipi, c.publisher_name, c.publisher_pro, c.publisher_ipi
           FROM tracks t JOIN composers c ON c.id = t.composer_id
          WHERE t.id = ?1`,
      )
      .bind(trackId)
      .first<{
        display_name: string | null;
        cue_name: string | null;
        pro: string | null;
        ipi: string | null;
        publisher_name: string | null;
        publisher_pro: string | null;
        publisher_ipi: string | null;
      }>();
    if (!row) return null;
    const filled = [row.cue_name, row.pro, row.ipi, row.publisher_name, row.publisher_pro, row.publisher_ipi]
      .some((v) => v && v.trim());
    if (!filled) return null;
    return {
      composerName: row.cue_name?.trim() || row.display_name || "",
      composerPro: row.pro?.trim() ?? "",
      composerIpi: row.ipi?.trim() ?? "",
      publisherName: row.publisher_name?.trim() ?? "",
      publisherPro: row.publisher_pro?.trim() ?? "",
      publisherIpi: row.publisher_ipi?.trim() ?? "",
    };
  } catch {
    // cue columns not created yet — just omit the block
    return null;
  }
};

// The buyer details from "Edit PDF certificate" (optional, all blank by default).
type BuyerDetails = CertDetails;

/** "Jane Doe" from the certificate details, or the account name as a fallback. */
const buyerName = (b: BuyerDetails | undefined, fallback: string): string => {
  const name = [b?.firstName, b?.lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
};

/** One-line address for the certificate; empty when nothing was filled in. */
const buyerAddress = (b: BuyerDetails | undefined): string | undefined => {
  const line = [b?.address1, b?.address2, b?.city, b?.region, b?.postcode, b?.country]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return line || undefined;
};

/** Build CertData for a subscription (plan) certificate. */
const planCert = (
  info: LicenseInfo,
  plan: string,
  a: {
    licenseeName: string;
    licenseeEmail: string;
    code: string;
    issued: string;
    periodEnd: string | null;
    trackTitle: string;
    trackSlug: string | null;
    composer: string | null;
    paymentRef?: string;
    cue?: CertData["cue"];
    buyer?: BuyerDetails;
  },
): CertData => ({
  title: info.name,
  scope: info.scope,
  permitted: info.permitted,
  notPermitted: info.notPermitted,
  licenseeName: buyerName(a.buyer, a.licenseeName),
  licenseeEmail: a.licenseeEmail,
  company: a.buyer?.company || undefined,
  vat: a.buyer?.vat || undefined,
  address: buyerAddress(a.buyer),
  project: a.buyer?.project || undefined,
  licenseNumber: a.code,
  paymentRef: a.paymentRef ?? "Subscription plan",
  issued: fmtDate(a.issued),
  orderNo: "—",
  typeLabel: `Subscription · ${cap(plan)} Plan`,
  trackTitle: a.trackTitle,
  composer: a.composer || "TV Music Store",
  trackPage: trackUrl(a.trackSlug),
  cue: a.cue ?? null,
});

/** Build CertData for a one-time (single-track) certificate. */
const orderCert = (
  info: LicenseInfo,
  tier: string,
  a: {
    licenseeName: string;
    licenseeEmail: string;
    code: string;
    paymentRef: string;
    orderNo: string;
    issued: string;
    trackTitle: string;
    trackSlug: string | null;
    composer: string | null;
    cue?: CertData["cue"];
  },
): CertData => ({
  title: info.name,
  scope: info.scope,
  permitted: info.permitted,
  notPermitted: info.notPermitted,
  licenseeName: a.licenseeName,
  licenseeEmail: a.licenseeEmail,
  licenseNumber: a.code,
  paymentRef: a.paymentRef || "—",
  issued: fmtDate(a.issued),
  orderNo: a.orderNo,
  typeLabel: `One-time · ${cap(tier)}`,
  trackTitle: a.trackTitle,
  composer: a.composer || "TV Music Store",
  trackPage: trackUrl(a.trackSlug),
  cue: a.cue ?? null,
});

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const db = ctx.env.DB;
  const url = new URL(ctx.request.url);
  const orderId = url.searchParams.get("order");
  const codeParam = url.searchParams.get("code");
  const slug = url.searchParams.get("slug");
  const trackId = url.searchParams.get("track");
  const licenseeName = user.name?.trim() || user.email;
  const isAdmin = user.role === "admin" || user.email === OWNER_EMAIL;
  // Whatever the customer typed into "Edit PDF certificate" — printed as-is.
  const buyer = await getCertDetails(db, user.id);

  // --- admin: open a customer's subscription certificate by its code -------
  if (codeParam) {
    if (!isAdmin) return json({ error: "Admin only" }, 403);
    const row = await db
      .prepare(
        `SELECT p.id, p.plan, p.plan_period_end, p.created_at, p.track_id,
                u.email AS user_email, u.name AS user_name,
                t.title AS track_title, t.slug AS track_slug, c.display_name AS composer
           FROM plan_licenses p
           LEFT JOIN users u ON u.id = p.user_id
           LEFT JOIN tracks t ON t.id = p.track_id
           LEFT JOIN composers c ON c.id = t.composer_id
          WHERE p.id = ?1`,
      )
      .bind(codeParam)
      .first<{
        id: string;
        plan: string;
        plan_period_end: string | null;
        created_at: string;
        track_id: string;
        user_email: string | null;
        user_name: string | null;
        track_title: string | null;
        track_slug: string | null;
        composer: string | null;
      }>();
    if (!row) return json({ error: "License not found" }, 404);
    const info = PLAN_INFO[row.plan] ?? PLAN_INFO.free;
    const bytes = buildCertificate(
      planCert(info, row.plan, {
        licenseeName: row.user_name?.trim() || row.user_email || "—",
        licenseeEmail: row.user_email ?? "",
        code: row.id,
        issued: row.created_at,
        periodEnd: row.plan_period_end,
        trackTitle: row.track_title ?? prettify(row.track_id),
        trackSlug: row.track_slug,
        composer: row.composer,
        cue: await fetchCue(db, row.track_id),
        buyer,
      }),
    );
    return pdfResponse(bytes, `license-${row.id}.pdf`);
  }

  if (orderId) {
    // Admins can open any buyer's certificate; customers only their own.
    const row = await db
      .prepare(
        `SELECT o.id, o.track_id, o.tier, o.price, o.stripe_session_id, o.created_at,
                COALESCE(o.status, 'active') AS status,
                t.title AS track_title, t.slug AS track_slug, c.display_name AS composer,
                u.email AS user_email, u.name AS user_name
           FROM sync_orders o
           LEFT JOIN tracks t ON t.id = o.track_id
           LEFT JOIN composers c ON c.id = t.composer_id
           LEFT JOIN users u ON u.id = o.user_id
          WHERE o.id = ?1${isAdmin ? "" : " AND o.user_id = ?2"}`,
      )
      .bind(...(isAdmin ? [orderId] : [orderId, user.id]))
      .first<{
        id: string;
        track_id: string;
        tier: string;
        price: number;
        stripe_session_id: string | null;
        created_at: string;
        status: string;
        track_title: string | null;
        track_slug: string | null;
        composer: string | null;
        user_email: string | null;
        user_name: string | null;
      }>();
    if (!row) return json({ error: "License not found" }, 404);
    // Refunded = void. The certificate must not print, and the code must not
    // validate — otherwise a refunded buyer keeps a document that says he may
    // use the music.
    if (row.status === "refunded") {
      return json({ error: "This license was refunded and is no longer valid", code: "refunded" }, 410);
    }

    const info = TIER_INFO[row.tier] ?? TIER_INFO.commercial;
    const bytes = buildCertificate(
      orderCert(info, row.tier, {
        licenseeName: isAdmin ? row.user_name?.trim() || row.user_email || licenseeName : licenseeName,
        licenseeEmail: isAdmin ? row.user_email ?? user.email : user.email,
        code: row.id,
        paymentRef: row.stripe_session_id ?? "—",
        orderNo: row.id.replace(/^so_/, "").slice(0, 10).toUpperCase(),
        issued: row.created_at,
        trackTitle: row.track_title ?? prettify(row.track_id),
        trackSlug: row.track_slug,
        composer: row.composer,
        cue: await fetchCue(db, row.track_id),
      }),
    );
    return pdfResponse(bytes, `license-${row.id}.pdf`);
  }

  const trackRef = slug ?? trackId;
  if (trackRef) {
    const trackSql = `SELECT t.id, t.title, t.slug, c.display_name AS composer
                        FROM tracks t LEFT JOIN composers c ON c.id = t.composer_id
                       WHERE t.%COL% = ?1`;
    const track = slug
      ? await db
          .prepare(trackSql.replace("%COL%", "slug"))
          .bind(slug)
          .first<{ id: string; title: string; slug: string; composer: string | null }>()
      : await db
          .prepare(trackSql.replace("%COL%", "id"))
          .bind(trackId)
          .first<{ id: string; title: string; slug: string; composer: string | null }>();
    const sub = await db
      .prepare(
        `SELECT plan, status, current_period_end
           FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
      )
      .bind(user.id)
      .first<{ plan: string; status: string | null; current_period_end: string | null }>();
    // Admins have Max-level access without a subscription (test downloads).
    const plan = isAdmin && (!sub || sub.plan === "free") ? "max" : (sub?.plan ?? "free");
    // Plan certificates are a Pro/Max perk (owner decision) — free accounts
    // don't get one. Purchased one-time licenses (?order=) are unaffected.
    if (plan === "free" && !isAdmin) {
      return json({ error: "License certificates come with the Pro and Max plans" }, 403);
    }
    const info = PLAN_INFO[plan] ?? PLAN_INFO.free;
    const fileRef = track?.slug ?? trackRef;
    const licenseTrackId = track?.id ?? trackRef;

    // Mint (or reuse) the persistent, signed code for THIS track on THIS plan —
    // the code the customer sees in his Licenses list and the admin looks up.
    let code = `${plan.toUpperCase()} PLAN`;
    let issuedDate = fmtDate();
    let periodEnd = sub?.current_period_end ?? null;
    try {
      const lic = await getOrCreatePlanLicense(ctx.env, user.id, licenseTrackId, plan, periodEnd);
      code = lic.code;
      issuedDate = fmtDate(lic.createdAt);
      periodEnd = lic.planPeriodEnd ?? periodEnd;
    } catch {
      // keep the fallback label; certificate still downloads
    }

    void periodEnd;
    const bytes = buildCertificate(
      planCert(info, plan, {
        licenseeName,
        licenseeEmail: user.email,
        code,
        issued: issuedDate,
        periodEnd,
        trackTitle: track?.title ?? prettify(trackRef),
        trackSlug: track?.slug ?? (slug ?? null),
        composer: track?.composer ?? null,
        cue: await fetchCue(db, track?.id),
        buyer,
      }),
    );
    return pdfResponse(bytes, `license-${fileRef}.pdf`);
  }

  return json({ error: "order, slug or track required" }, 400);
};
