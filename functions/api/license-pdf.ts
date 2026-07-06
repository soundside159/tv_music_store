import { getSessionUser, json, type Ctx } from "./_utils";
import { buildPdf, textWidth, type PdfOp, type Rgb } from "./_pdf";
import { LOGO_ALPHA_B64, LOGO_HEIGHT, LOGO_RGB_B64, LOGO_WIDTH } from "./_logo";

// GET /api/license-pdf?order=<sync_order_id>  -> certificate for a purchased
//     one-time license (Account -> Licenses "License PDF").
// GET /api/license-pdf?slug=<track_slug>      -> certificate for the signed-in
//     user's current subscription plan (download modal "Include PDF License").
// Generated on the fly (no storage); the session cookie proves ownership.
// TODO(next task): persistent license codes for plan certificates —
// see docs/TODO_PLAN_LICENSE_CODES.md

const TIER_INFO: Record<string, { name: string; terms: string[] }> = {
  personal: {
    name: "Personal License",
    terms: ["Personal, non-commercial use", "All social platforms", "Podcasts & streaming", "Monetization allowed", "Non-profit projects"],
  },
  commercial: {
    name: "Commercial License",
    terms: ["Commercial usage", "All social platforms", "Podcasts & streaming", "Client work", "Paid advertising"],
  },
  professional: {
    name: "Professional License",
    terms: ["Commercial usage", "TV / Radio broadcast", "Games & software", "Client work", "Paid advertising"],
  },
};

const PLAN_INFO: Record<string, { name: string; terms: string[] }> = {
  free: {
    name: "Free Plan License",
    terms: ["Personal & non-commercial use", "YouTube & social platforms", "No resale or redistribution of the audio"],
  },
  pro: {
    name: "Pro Plan License",
    terms: ["Monetized content on all platforms", "YouTube, podcasts & streaming", "One channel / brand", "No resale or redistribution of the audio"],
  },
  max: {
    name: "Max Plan License",
    terms: ["Commercial & client work", "Paid ads & broadcast", "Multiple channels / brands", "No resale or redistribution of the audio"],
  },
};

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
const HEADER_BG: Rgb = [0.071, 0.075, 0.09]; // #12131700 dark graphite
const PANEL_BG: Rgb = [0.968, 0.962, 0.945]; // warm light panel
const RULE: Rgb = [0.88, 0.87, 0.85];
const WHITE: Rgb = [1, 1, 1];

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 60;

const spaced = (s: string) => s.split("").join(" "); // letterspaced caps

/** Shrinks a font size until the text fits the given width. */
const fitSize = (text: string, size: number, maxW: number, font: "helv" | "helvB"): number => {
  let s = size;
  while (s > 8 && textWidth(text, s, font) > maxW) s -= 0.5;
  return s;
};

export const buildCertificate = (fields: {
  licenseName: string;
  licenseeName: string;
  licenseeEmail: string;
  trackTitle: string;
  terms: string[];
  code: string;
  codeLabel: string; // "LICENSE CODE" for one-time, "PLAN" for subscriptions
  codeNote: string;
  issued: string;
  meta: Array<[string, string]>; // up to 3 [label, value] pairs in the code panel
}): Uint8Array => {
  const ops: PdfOp[] = [];
  const right = PAGE_W - MARGIN;

  // --- header band ---------------------------------------------------------
  ops.push({ op: "rect", x: 0, y: 722, w: PAGE_W, h: PAGE_H - 722, color: HEADER_BG });
  ops.push({ op: "rect", x: 0, y: 718, w: PAGE_W, h: 4, color: GOLD });

  const logoH = 46;
  const logoW = (logoH * LOGO_WIDTH) / LOGO_HEIGHT;
  ops.push({ op: "image", x: MARGIN, y: 759, w: logoW, h: logoH });

  ops.push({ op: "text", text: "TV MUSIC STORE", x: MARGIN + logoW + 16, y: 786, size: 21, font: "helvB", color: WHITE });
  ops.push({ op: "text", text: spaced("LICENSE CERTIFICATE"), x: MARGIN + logoW + 17, y: 768, size: 9, color: GOLD });

  const issuedLabel = "ISSUED";
  ops.push({ op: "text", text: issuedLabel, x: right - textWidth(issuedLabel, 7.5, "helvB"), y: 793, size: 7.5, font: "helvB", color: GRAY_LIGHT });
  ops.push({ op: "text", text: fields.issued, x: right - textWidth(fields.issued, 10), y: 779, size: 10, color: WHITE });

  // --- license title -------------------------------------------------------
  const titleSize = fitSize(fields.licenseName, 24, right - MARGIN, "helvB");
  ops.push({ op: "text", text: fields.licenseName, x: MARGIN, y: 655, size: titleSize, font: "helvB", color: INK });
  ops.push({ op: "rect", x: MARGIN, y: 641, w: 70, h: 3, color: GOLD });

  // --- licensee ------------------------------------------------------------
  ops.push({ op: "text", text: "This certificate confirms that", x: MARGIN, y: 602, size: 10.5, color: GRAY });
  const nameSize = fitSize(fields.licenseeName, 15, right - MARGIN, "helvB");
  ops.push({ op: "text", text: fields.licenseeName, x: MARGIN, y: 580, size: nameSize, font: "helvB", color: INK });
  if (fields.licenseeEmail) {
    ops.push({ op: "text", text: fields.licenseeEmail, x: MARGIN, y: 565, size: 9.5, color: GRAY_LIGHT });
  }

  ops.push({ op: "text", text: "is granted the license below for the track", x: MARGIN, y: 533, size: 10.5, color: GRAY });
  const trackSize = fitSize(fields.trackTitle, 15, right - MARGIN, "helvB");
  ops.push({ op: "text", text: fields.trackTitle, x: MARGIN, y: 511, size: trackSize, font: "helvB", color: INK });

  // --- usage rights ---------------------------------------------------------
  ops.push({ op: "text", text: spaced("USAGE RIGHTS"), x: MARGIN, y: 472, size: 9, font: "helvB", color: GOLD_DARK });
  let y = 448;
  for (const t of fields.terms) {
    ops.push({ op: "rect", x: MARGIN, y: y + 2.2, w: 4, h: 4, color: GOLD });
    ops.push({ op: "text", text: t, x: MARGIN + 13, y, size: 10.5, color: INK });
    y -= 19;
  }

  // --- license code panel ---------------------------------------------------
  const panelTop = 330;
  const panelH = 104;
  const panelY = panelTop - panelH;
  ops.push({ op: "rect", x: MARGIN, y: panelY, w: right - MARGIN, h: panelH, color: PANEL_BG });
  ops.push({ op: "rect", x: MARGIN, y: panelY, w: 3.5, h: panelH, color: GOLD });

  const padX = MARGIN + 22;
  ops.push({ op: "text", text: spaced(fields.codeLabel), x: padX, y: panelTop - 26, size: 8, font: "helvB", color: GOLD_DARK });
  ops.push({ op: "text", text: fields.code, x: padX, y: panelTop - 52, size: 15, font: "courB", color: INK });
  ops.push({ op: "text", text: fields.codeNote, x: padX, y: panelTop - 82, size: 8, color: GRAY_LIGHT });

  const metaX = 340;
  const metaValX = 415;
  let metaY = panelTop - 26;
  for (const [label, value] of fields.meta.slice(0, 3)) {
    ops.push({ op: "text", text: label.toUpperCase(), x: metaX, y: metaY, size: 7.5, font: "helvB", color: GRAY });
    const vSize = fitSize(value, 10, right - 18 - metaValX, "helv");
    ops.push({ op: "text", text: value, x: metaValX, y: metaY - 1, size: vSize, color: INK });
    metaY -= 26;
  }

  // --- footer ---------------------------------------------------------------
  ops.push({ op: "line", x1: MARGIN, y1: 110, x2: right, y2: 110, width: 0.7, color: RULE });
  ops.push({ op: "rect", x: MARGIN, y: 108.6, w: 26, h: 2, color: GOLD });
  ops.push({
    op: "text",
    text: "This certificate confirms a license granted through TV Music Store.",
    x: MARGIN, y: 92, size: 8.5, color: GRAY,
  });
  ops.push({ op: "text", text: "tvmusicstore.com  -  contact@tvmusicstore.com", x: MARGIN, y: 79, size: 8.5, color: GRAY_LIGHT });

  return buildPdf(ops, {
    image: { width: LOGO_WIDTH, height: LOGO_HEIGHT, rgbB64: LOGO_RGB_B64, alphaB64: LOGO_ALPHA_B64 },
  });
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

export const onRequestGet = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);

  const db = ctx.env.DB;
  const url = new URL(ctx.request.url);
  const orderId = url.searchParams.get("order");
  const slug = url.searchParams.get("slug");
  const trackId = url.searchParams.get("track");
  const licenseeName = user.name?.trim() || user.email;

  if (orderId) {
    const row = await db
      .prepare(
        `SELECT o.id, o.track_id, o.tier, o.price, o.stripe_session_id, o.created_at, t.title AS track_title
           FROM sync_orders o
           LEFT JOIN tracks t ON t.id = o.track_id
          WHERE o.id = ?1 AND o.user_id = ?2`,
      )
      .bind(orderId, user.id)
      .first<{
        id: string;
        track_id: string;
        tier: string;
        price: number;
        stripe_session_id: string | null;
        created_at: string;
        track_title: string | null;
      }>();
    if (!row) return json({ error: "License not found" }, 404);

    const info = TIER_INFO[row.tier] ?? { name: `${row.tier} License`, terms: [] };
    const bytes = buildCertificate({
      licenseName: info.name,
      licenseeName,
      licenseeEmail: user.email,
      trackTitle: row.track_title ?? prettify(row.track_id),
      terms: info.terms,
      code: row.id,
      codeLabel: "LICENSE CODE",
      codeNote: "Keep this code for support and verification.",
      issued: fmtDate(row.created_at),
      meta: [
        ["Type", "One-time"],
        ["Price", `$${row.price}`],
        ["Reference", (row.stripe_session_id ?? row.id).slice(0, 17)],
      ],
    });
    return pdfResponse(bytes, `license-${row.id}.pdf`);
  }

  const trackRef = slug ?? trackId;
  if (trackRef) {
    const track = slug
      ? await db
          .prepare(`SELECT id, title, slug FROM tracks WHERE slug = ?1`)
          .bind(slug)
          .first<{ id: string; title: string; slug: string }>()
      : await db
          .prepare(`SELECT id, title, slug FROM tracks WHERE id = ?1`)
          .bind(trackId)
          .first<{ id: string; title: string; slug: string }>();
    const sub = await db
      .prepare(`SELECT plan FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`)
      .bind(user.id)
      .first<{ plan: string }>();
    const plan = sub?.plan ?? "free";
    const info = PLAN_INFO[plan] ?? PLAN_INFO.free;
    const fileRef = track?.slug ?? trackRef;

    const bytes = buildCertificate({
      licenseName: info.name,
      licenseeName,
      licenseeEmail: user.email,
      trackTitle: track?.title ?? prettify(trackRef),
      terms: info.terms,
      code: `${plan.toUpperCase()} PLAN`,
      codeLabel: "PLAN",
      codeNote: "Issued under the licensee's active subscription plan.",
      issued: fmtDate(),
      meta: [
        ["Type", "Subscription"],
        ["Track", fileRef.slice(0, 24)],
        ["Status", "Active"],
      ],
    });
    return pdfResponse(bytes, `license-${fileRef}.pdf`);
  }

  return json({ error: "order, slug or track required" }, 400);
};
