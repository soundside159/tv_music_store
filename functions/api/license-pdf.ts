import { getSessionUser, json, type Ctx } from "./_utils";
import { buildPdf, type PdfLine } from "./_pdf";

// GET /api/license-pdf?order=<sync_order_id>  -> certificate for a purchased
//     one-time license (Account -> Licenses "License PDF").
// GET /api/license-pdf?slug=<track_slug>      -> certificate for the signed-in
//     user's current subscription plan (download modal "Include PDF License").
// Generated on the fly (no storage); the session cookie proves ownership.

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

const buildCertificate = (fields: {
  licenseName: string;
  licenseeName: string;
  licenseeEmail: string;
  trackTitle: string;
  terms: string[];
  meta: Array<[string, string]>;
}): Uint8Array => {
  const lines: PdfLine[] = [];
  lines.push({ text: "TV MUSIC STORE", x: 60, y: 780, size: 22, bold: true });
  lines.push({ text: "LICENSE CERTIFICATE", x: 60, y: 758, size: 11 });
  lines.push({ text: "____________________________________________________________", x: 60, y: 744, size: 11 });

  lines.push({ text: fields.licenseName, x: 60, y: 700, size: 18, bold: true });

  lines.push({ text: "This certifies that", x: 60, y: 665, size: 11 });
  lines.push({ text: fields.licenseeName, x: 60, y: 645, size: 14, bold: true });
  if (fields.licenseeEmail) lines.push({ text: fields.licenseeEmail, x: 60, y: 628, size: 10 });

  lines.push({ text: "is granted a license to use the track", x: 60, y: 596, size: 11 });
  lines.push({ text: fields.trackTitle, x: 60, y: 576, size: 14, bold: true });

  lines.push({ text: "Usage rights", x: 60, y: 538, size: 12, bold: true });
  let y = 516;
  for (const t of fields.terms) {
    lines.push({ text: `-  ${t}`, x: 66, y, size: 11 });
    y -= 20;
  }

  y -= 14;
  for (const [label, value] of fields.meta) {
    lines.push({ text: `${label}:`, x: 60, y, size: 11, bold: true });
    lines.push({ text: value, x: 180, y, size: 11 });
    y -= 18;
  }

  lines.push({ text: "____________________________________________________________", x: 60, y: 110, size: 11 });
  lines.push({ text: "This certificate confirms a license granted through TV Music Store.", x: 60, y: 90, size: 9 });
  lines.push({ text: "tvmusicstore.com  -  contact@tvmusicstore.com", x: 60, y: 76, size: 9 });
  return buildPdf(lines);
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
      meta: [
        ["License ID", row.id],
        ["Reference", row.stripe_session_id ?? row.id],
        ["Price", `$${row.price}`],
        ["Issued", fmtDate(row.created_at)],
      ],
    });
    return pdfResponse(bytes, `license-${row.id}.pdf`);
  }

  if (slug) {
    const track = await db
      .prepare(`SELECT id, title FROM tracks WHERE slug = ?1`)
      .bind(slug)
      .first<{ id: string; title: string }>();
    const sub = await db
      .prepare(`SELECT plan FROM subscriptions WHERE user_id = ?1 ORDER BY rowid DESC LIMIT 1`)
      .bind(user.id)
      .first<{ plan: string }>();
    const plan = sub?.plan ?? "free";
    const info = PLAN_INFO[plan] ?? PLAN_INFO.free;
    const bytes = buildCertificate({
      licenseName: info.name,
      licenseeName,
      licenseeEmail: user.email,
      trackTitle: track?.title ?? prettify(slug),
      terms: info.terms,
      meta: [
        ["Plan", plan.toUpperCase()],
        ["Track", slug],
        ["Issued", fmtDate()],
      ],
    });
    return pdfResponse(bytes, `license-${slug}.pdf`);
  }

  return json({ error: "order or slug required" }, 400);
};
