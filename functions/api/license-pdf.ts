import { getSessionUser, json, OWNER_EMAIL, type Ctx } from "./_utils";
import { buildPdf, textWidth, type PdfOp, type PdfImage, type Rgb } from "./_pdf";
import { LOGO_ALPHA_B64, LOGO_HEIGHT, LOGO_RGB_B64, LOGO_WIDTH } from "./_logo";
import { ASSETS } from "./_assets";
import { getOrCreatePlanLicense } from "./_licenses";

// GET /api/license-pdf?order=<sync_order_id>  -> certificate for a purchased
//     one-time license (Account -> Licenses "License PDF").
// GET /api/license-pdf?slug=<track_slug>      -> certificate for the signed-in
//     user's current subscription plan (download modal "Include PDF License").
// Generated on the fly; the session cookie proves ownership.
// Subscription certificates carry a persistent, signed license code minted by
// ./_licenses (getOrCreatePlanLicense) and looked up in /admin -> Licenses.

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

/** Detail-panel rows for a subscription (plan) certificate. */
const planRows = (a: {
  plan: string;
  trackTitle: string;
  periodEnd: string | null;
  code: string;
}): CertRow[] => {
  const rows: CertRow[] = [
    { label: "Plan", value: `${a.plan.toUpperCase()} PLAN` },
    { label: "Type", value: "Subscription" },
    { label: "Track", value: a.trackTitle },
  ];
  if (a.periodEnd) rows.push({ label: "Valid until", value: fmtDate(a.periodEnd) });
  rows.push({ label: "License Code", value: a.code, kind: "code" });
  rows.push({ label: "Status", value: "", kind: "status" });
  return rows;
};

// --- brand palette ---------------------------------------------------------
const GOLD: Rgb = [0.957, 0.769, 0.188]; // #F4C430
const GOLD_DARK: Rgb = [0.62, 0.47, 0.08]; // readable gold on white
const INK: Rgb = [0.1, 0.1, 0.12];
const GRAY: Rgb = [0.44, 0.45, 0.48];
const GRAY_LIGHT: Rgb = [0.62, 0.63, 0.66];
const HEADER_BG: Rgb = [0.071, 0.075, 0.09]; // dark graphite
const PANEL_BG: Rgb = [0.957, 0.957, 0.961]; // light gray panel
const TILE_BG: Rgb = [0.985, 0.957, 0.86]; // pale gold icon tile
const RULE: Rgb = [0.86, 0.86, 0.87];
const RULE_SOFT: Rgb = [0.9, 0.9, 0.91];
const WHITE: Rgb = [1, 1, 1];

const PAGE_W = 595;
const PAGE_H = 842;
const L = 48;
const R = PAGE_W - L; // 547
const spaced = (s: string) => s.split("").join(" "); // letterspaced caps

/** Picks an icon asset key for a usage-right phrase (order matters). */
const iconForTerm = (t: string): string => {
  const s = t.toLowerCase();
  if (/(resale|redistribut)/.test(s)) return "icon_ban";
  if (/(broadcast|\btv\b|radio)/.test(s)) return "icon_broadcast";
  if (/(client|commercial)/.test(s)) return "icon_briefcase";
  if (/(advertis|paid ad|\bads?\b)/.test(s)) return "icon_megaphone";
  if (/(podcast|stream)/.test(s)) return "icon_mic";
  if (/(social|youtube|platform)/.test(s)) return "icon_globe";
  if (/(monetiz)/.test(s)) return "icon_dollar";
  if (/(channel|brand)/.test(s)) return "icon_layers";
  if (/(game|software)/.test(s)) return "icon_gamepad";
  if (/(non-profit|nonprofit)/.test(s)) return "icon_heart";
  if (/(personal|non-commercial)/.test(s)) return "icon_user";
  return "icon_check";
};

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

export interface CertRow {
  label: string;
  value: string;
  kind?: "code" | "status";
}

export const buildCertificate = (fields: {
  title: string; // e.g. "Max Plan License"
  licenseeName: string;
  licenseeEmail: string;
  terms: string[]; // usage-right phrases (icons auto-picked)
  rows: CertRow[]; // detail-panel rows (Plan / Type / Track / License Code / Status ...)
  issued: string;
  certificateId: string; // shown bottom-right
  statusText: string; // gold pill text (e.g. "PURCHASED")
}): Uint8Array => {
  const ops: PdfOp[] = [];

  // ===================== HEADER BAND ======================================
  const bandY = 746;
  ops.push({ op: "rect", x: 0, y: bandY, w: PAGE_W, h: PAGE_H - bandY, color: HEADER_BG });
  ops.push({ op: "image", key: "deco", x: PAGE_W - 150, y: bandY, w: 150, h: PAGE_H - bandY });

  const logoH = 42;
  const logoW = (logoH * LOGO_WIDTH) / LOGO_HEIGHT;
  const logoY = bandY + (PAGE_H - bandY - logoH) / 2;
  ops.push({ op: "image", key: "logo", x: L, y: logoY, w: logoW, h: logoH });

  const wordX = L + logoW + 14;
  ops.push({ op: "text", text: "TV MUSIC STORE", x: wordX, y: logoY + logoH - 15, size: 19, font: "helvB", color: WHITE });
  ops.push({ op: "text", text: spaced("LICENSE CERTIFICATE"), x: wordX + 1, y: logoY + 2, size: 8, color: GOLD });

  ops.push({ op: "text", text: "ISSUED", x: R, y: logoY + logoH - 8, size: 7.5, font: "helvB", color: GRAY_LIGHT, align: "right" });
  ops.push({ op: "text", text: fields.issued, x: R, y: logoY + 6, size: 10.5, font: "helvB", color: WHITE, align: "right" });
  ops.push({ op: "rect", x: R - textWidth(fields.issued, 10.5, "helvB"), y: logoY - 2, w: textWidth(fields.issued, 10.5, "helvB"), h: 1.5, color: GOLD });

  // gold divider + downward notch
  ops.push({ op: "rect", x: 0, y: bandY - 3, w: PAGE_W, h: 3, color: GOLD });
  ops.push({ op: "poly", pts: [[L + 8, bandY - 3], [L + 26, bandY - 3], [L + 17, bandY - 13]], color: GOLD });

  // ===================== TITLE ============================================
  const titleBase = 700;
  const rawTitle = fields.title.trim();
  const boldPart = /license$/i.test(rawTitle) ? rawTitle.replace(/license$/i, "").trim() : rawTitle;
  const boldUpper = boldPart.toUpperCase();
  const tSize = 29;
  ops.push({ op: "text", text: boldUpper, x: L, y: titleBase, size: tSize, font: "helvB", color: INK });
  const bw = textWidth(boldUpper, tSize, "helvB");
  ops.push({ op: "text", text: " LICENSE", x: L + bw, y: titleBase, size: tSize, font: "helv", color: [0.32, 0.33, 0.36] });
  ops.push({ op: "rect", x: L, y: titleBase - 14, w: 66, h: 3, color: GOLD });

  // ===================== LICENSEE (left) ==================================
  ops.push({ op: "text", text: "This certificate confirms that", x: L, y: 664, size: 10.5, color: GRAY });
  ops.push({ op: "text", text: fields.licenseeName, x: L, y: 645, size: 15, font: "helvB", color: INK });
  if (fields.licenseeEmail) {
    ops.push({ op: "text", text: fields.licenseeEmail, x: L, y: 630, size: 9.5, color: GRAY_LIGHT });
  }
  ops.push({ op: "text", text: "is granted the license below.", x: L, y: 606, size: 10.5, color: GRAY });

  // ===================== SEAL (right) =====================================
  const sealSz = 150;
  ops.push({ op: "image", key: "seal", x: R - sealSz, y: 566, w: sealSz, h: sealSz });

  // ===================== USAGE RIGHTS =====================================
  ops.push({ op: "text", text: spaced("USAGE RIGHTS"), x: L, y: 545, size: 9, font: "helvB", color: GOLD_DARK });
  ops.push({ op: "rect", x: L, y: 539, w: 40, h: 2.5, color: GOLD });

  const terms = fields.terms.slice(0, 5);
  const n = Math.max(terms.length, 1);
  const innerW = R - L;
  const colW = innerW / n;
  const gridTop = 520; // tile top edge
  const tileSz = 46;
  const tileY = gridTop - tileSz;
  terms.forEach((t, i) => {
    const cx = L + colW * (i + 0.5);
    // separator line before each column (except the first)
    if (i > 0) {
      ops.push({ op: "line", x1: L + colW * i, y1: tileY - 30, x2: L + colW * i, y2: gridTop, width: 0.7, color: RULE_SOFT });
    }
    ops.push({ op: "rrect", x: cx - tileSz / 2, y: tileY, w: tileSz, h: tileSz, r: 10, color: TILE_BG });
    ops.push({ op: "image", key: iconForTerm(t), x: cx - 13, y: tileY + 10, w: 26, h: 26 });
    const lines = wrapLines(t, colW - 12, 8.5, 3);
    lines.forEach((ln, li) => {
      ops.push({ op: "text", text: ln, x: cx, y: tileY - 15 - li * 11, size: 8.5, color: INK, align: "center" });
    });
  });

  // ===================== DETAILS PANEL ====================================
  const rows = fields.rows;
  const rowH = 34;
  const padTop = 16;
  const panelTop = 424;
  const panelH = padTop * 2 + rows.length * rowH;
  const panelBottom = panelTop - panelH;
  ops.push({ op: "rrect", x: L, y: panelBottom, w: innerW, h: panelH, r: 7, color: PANEL_BG });
  ops.push({ op: "rect", x: L + 1.5, y: panelBottom + 6, w: 3.5, h: panelH - 12, color: GOLD });

  const labelX = L + 30;
  const valueX = L + 150;
  rows.forEach((row, i) => {
    const rowTop = panelTop - padTop - i * rowH;
    const baseY = rowTop - rowH / 2 - 3.5;
    if (i > 0) {
      ops.push({ op: "line", x1: labelX, y1: rowTop, x2: R - 24, y2: rowTop, width: 0.6, color: RULE });
    }
    ops.push({ op: "text", text: row.label.toUpperCase(), x: labelX, y: baseY, size: 8.5, font: "helvB", color: GRAY });
    if (row.kind === "status") {
      const pillH = 21;
      const iconSz = 12;
      const txtW = textWidth(fields.statusText, 8.5, "helvB");
      const pillW = 18 + iconSz + 6 + txtW;
      const pillY = baseY - 6;
      ops.push({ op: "rrect", x: valueX, y: pillY, w: pillW, h: pillH, r: pillH / 2, color: GOLD });
      ops.push({ op: "image", key: "icon_cart_dark", x: valueX + 12, y: pillY + (pillH - iconSz) / 2, w: iconSz, h: iconSz });
      ops.push({ op: "text", text: fields.statusText, x: valueX + 12 + iconSz + 6, y: pillY + 6.5, size: 8.5, font: "helvB", color: INK });
    } else if (row.kind === "code") {
      ops.push({ op: "text", text: row.value, x: valueX, y: baseY, size: 12, font: "courB", color: INK });
    } else {
      ops.push({ op: "text", text: row.value, x: valueX, y: baseY, size: 10.5, color: INK });
    }
  });

  // ===================== FOOTER ===========================================
  ops.push({ op: "line", x1: L, y1: 150, x2: R, y2: 150, width: 0.7, color: RULE });
  ops.push({ op: "poly", pts: [[L + 8, 150], [L + 26, 150], [L + 17, 160]], color: GOLD });
  ops.push({ op: "text", text: "This certificate confirms a license granted through TV Music Store.", x: L, y: 132, size: 8.5, color: GRAY });

  // dark footer bar
  const footH = 60;
  ops.push({ op: "rect", x: 0, y: 0, w: PAGE_W, h: footH, color: HEADER_BG });
  const fMid = footH / 2;
  ops.push({ op: "image", key: "icon_globe", x: L, y: fMid - 6, w: 12, h: 12 });
  ops.push({ op: "text", text: "tvmusicstore.com", x: L + 18, y: fMid - 3, size: 9, color: WHITE });
  const midX = L + 18 + textWidth("tvmusicstore.com", 9) + 14;
  ops.push({ op: "text", text: "|", x: midX, y: fMid - 3.5, size: 11, color: [0.4, 0.4, 0.45] });
  ops.push({ op: "image", key: "icon_mail", x: midX + 12, y: fMid - 6, w: 12, h: 12 });
  ops.push({ op: "text", text: "contact@tvmusicstore.com", x: midX + 28, y: fMid - 3, size: 9, color: WHITE });

  ops.push({ op: "text", text: "CERTIFICATE ID", x: R, y: fMid + 3, size: 7, font: "helvB", color: GRAY_LIGHT, align: "right" });
  ops.push({ op: "text", text: fields.certificateId, x: R, y: fMid - 10, size: 10, font: "helvB", color: WHITE, align: "right" });

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

  // --- admin: open a customer's subscription certificate by its code -------
  if (codeParam) {
    if (!isAdmin) return json({ error: "Admin only" }, 403);
    const row = await db
      .prepare(
        `SELECT p.id, p.plan, p.plan_period_end, p.created_at, p.track_id,
                u.email AS user_email, u.name AS user_name, t.title AS track_title
           FROM plan_licenses p
           LEFT JOIN users u ON u.id = p.user_id
           LEFT JOIN tracks t ON t.id = p.track_id
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
      }>();
    if (!row) return json({ error: "License not found" }, 404);
    const info = PLAN_INFO[row.plan] ?? PLAN_INFO.free;
    const bytes = buildCertificate({
      title: info.name,
      licenseeName: row.user_name?.trim() || row.user_email || "—",
      licenseeEmail: row.user_email ?? "",
      terms: info.terms,
      rows: planRows({
        plan: row.plan,
        trackTitle: row.track_title ?? prettify(row.track_id),
        periodEnd: row.plan_period_end,
        code: row.id,
      }),
      issued: fmtDate(row.created_at),
      certificateId: row.id,
      statusText: "ACTIVE",
    });
    return pdfResponse(bytes, `license-${row.id}.pdf`);
  }

  if (orderId) {
    // Admins can open any buyer's certificate; customers only their own.
    const row = await db
      .prepare(
        `SELECT o.id, o.track_id, o.tier, o.price, o.stripe_session_id, o.created_at,
                t.title AS track_title, u.email AS user_email, u.name AS user_name
           FROM sync_orders o
           LEFT JOIN tracks t ON t.id = o.track_id
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
        track_title: string | null;
        user_email: string | null;
        user_name: string | null;
      }>();
    if (!row) return json({ error: "License not found" }, 404);

    const info = TIER_INFO[row.tier] ?? { name: `${row.tier} License`, terms: [] };
    const bytes = buildCertificate({
      title: info.name,
      licenseeName: isAdmin ? row.user_name?.trim() || row.user_email || licenseeName : licenseeName,
      licenseeEmail: isAdmin ? row.user_email ?? user.email : user.email,
      terms: info.terms,
      rows: [
        { label: "License", value: info.name },
        { label: "Type", value: "One-time purchase" },
        { label: "Track", value: row.track_title ?? prettify(row.track_id) },
        { label: "Price", value: `$${row.price}` },
        { label: "License Code", value: row.id, kind: "code" },
        { label: "Status", value: "", kind: "status" },
      ],
      issued: fmtDate(row.created_at),
      certificateId: row.id,
      statusText: "PURCHASED",
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
      .prepare(
        `SELECT plan, status, current_period_end
           FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`,
      )
      .bind(user.id)
      .first<{ plan: string; status: string | null; current_period_end: string | null }>();
    const plan = sub?.plan ?? "free";
    const info = PLAN_INFO[plan] ?? PLAN_INFO.free;
    const fileRef = track?.slug ?? trackRef;
    const licenseTrackId = track?.id ?? trackRef;

    // Mint (or reuse) a persistent, signed code for this plan certificate so it
    // can be verified in /admin -> Licenses. Falls back to a static label only
    // if the DB write path throws (never blocks the download).
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

    const bytes = buildCertificate({
      title: info.name,
      licenseeName,
      licenseeEmail: user.email,
      terms: info.terms,
      rows: planRows({
        plan,
        trackTitle: track?.title ?? prettify(trackRef),
        periodEnd,
        code,
      }),
      issued: issuedDate,
      certificateId: code,
      statusText: "ACTIVE",
    });
    return pdfResponse(bytes, `license-${fileRef}.pdf`);
  }

  return json({ error: "order, slug or track required" }, 400);
};
