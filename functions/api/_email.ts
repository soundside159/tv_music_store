import { sendEmail, type Env } from "./_utils";

// Shared transactional email templates. Files starting with "_" are not routed.

const shell = (inner: string) => `
<div style="margin:0 auto;max-width:480px;font-family:Arial,Helvetica,sans-serif">
  <div style="background:#111;padding:28px 20px 24px;text-align:center;border-radius:12px 12px 0 0">
    <img src="https://tvmusicstore.com/images/icons/web-app-manifest-192x192.png" width="80" height="80" alt="TV Music Store"
      style="display:block;margin:0 auto 14px;border-radius:18px"/>
    <span style="color:#F4C430;font-size:17px;font-weight:bold;letter-spacing:4px">TV MUSIC STORE</span>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:0;padding:32px 26px;color:#222">
    ${inner}
  </div>
  <div style="background:#111;padding:18px 24px;text-align:center;border-radius:0 0 12px 12px">
    <p style="margin:0;color:#aaa;font-size:12px;line-height:1.7">
      Need help? Contact us at
      <a href="mailto:contact@tvmusicstore.com" style="color:#F4C430;text-decoration:none">contact@tvmusicstore.com</a>
      <br/>
      <span style="color:#666">&copy; ${new Date().getFullYear()} TV Music Store &middot; tvmusicstore.com</span>
    </p>
  </div>
</div>`;

const firstName = (name?: string | null) => {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || "there";
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Marketing campaign email — admin-authored body + a required unsubscribe link. */
export const sendCampaignEmail = async (
  env: Env,
  to: string,
  subject: string,
  bodyText: string,
  unsubscribeUrl: string,
): Promise<boolean> => {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;color:#333;font-size:14px;line-height:1.7">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
  const inner = `
    ${paragraphs}
    <p style="margin:26px 0 0;text-align:center">
      <a href="https://tvmusicstore.com/catalog"
        style="display:inline-block;background:#F4C430;color:#111;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:8px">
        Listen now
      </a>
    </p>
    <p style="margin:22px 0 0;color:#999;font-size:11px;line-height:1.6;text-align:center">
      You're receiving this because you subscribed to TV Music Store updates.
      <a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline">Unsubscribe</a>.
    </p>`;
  try {
    return await sendEmail(env, to, subject, shell(inner));
  } catch {
    return false;
  }
};

export interface ReceiptEmail {
  subject: string;
  name?: string | null;
  heading: string; // e.g. "Payment received"
  intro: string; // one-line lead
  /** Product rows: description → price. */
  lineItems: { label: string; value: string }[];
  vatText?: string | null; // formatted VAT, or null to hide the row
  totalText: string; // formatted grand total
  /** Small meta rows under the total (Date, Invoice #, Payment method…). */
  metaRows: { label: string; value: string }[];
  /** Stripe hosted RECEIPT (says "Paid") — the main button when present. */
  receiptUrl?: string | null;
  /** Stripe hosted invoice (a bill-style document: "amount due" + Pay online).
   *  Button fallback when there is no receipt; otherwise a small text link. */
  invoiceUrl?: string | null;
  secondary?: { label: string; url: string } | null; // "View your licenses" etc.
}

/**
 * Branded purchase receipt — sent after a successful charge (subscription renewal
 * or a one-time licence cart). Carries the amounts and a button to the real
 * Stripe invoice/receipt PDF the customer can hand to their accountant. Never
 * throws: a receipt email must not fail the webhook that books the money.
 */
export const sendReceiptEmail = async (env: Env, to: string, r: ReceiptEmail): Promise<void> => {
  const itemRows = r.lineItems
    .map(
      (li) => `
      <tr>
        <td style="padding:9px 0;color:#444;font-size:14px;border-bottom:1px solid #f1f1f1">${escapeHtml(li.label)}</td>
        <td style="padding:9px 0;color:#222;font-size:14px;text-align:right;white-space:nowrap;border-bottom:1px solid #f1f1f1">${escapeHtml(li.value)}</td>
      </tr>`,
    )
    .join("");
  const vatRow = r.vatText
    ? `<tr><td style="padding:9px 0;color:#666;font-size:13px">VAT</td><td style="padding:9px 0;color:#666;font-size:13px;text-align:right">${escapeHtml(r.vatText)}</td></tr>`
    : "";
  const metaRows = r.metaRows
    .map(
      (m) => `
      <tr>
        <td style="padding:2px 0;color:#999;font-size:12px">${escapeHtml(m.label)}</td>
        <td style="padding:2px 0;color:#777;font-size:12px;text-align:right">${escapeHtml(m.value)}</td>
      </tr>`,
    )
    .join("");
  // The button opens the PAID document (Stripe receipt). The invoice is a
  // bill-style PDF ("amount due" + Pay online) — offered as a small link for
  // customers whose accountant wants it; button fallback when no receipt.
  const buttonUrl = r.receiptUrl ?? r.invoiceUrl ?? null;
  const buttonLabel = r.receiptUrl ? "Download receipt / invoice (PDF)" : "Download invoice (PDF)";
  const invoiceButton = buttonUrl
    ? `<p style="margin:0 0 14px;text-align:center">
        <a href="${buttonUrl}"
          style="display:inline-block;background:#F4C430;color:#111;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:8px">
          ${buttonLabel}
        </a>
      </p>`
    : "";
  const invoiceLink =
    r.receiptUrl && r.invoiceUrl
      ? `<p style="margin:0 0 12px;text-align:center">
          <a href="${r.invoiceUrl}" style="color:#999;font-size:12px;text-decoration:underline">Need an invoice for your records? Open it here</a>
        </p>`
      : "";
  const secondary = r.secondary
    ? `<p style="margin:0;text-align:center">
        <a href="${r.secondary.url}" style="color:#b8860b;font-size:13px;text-decoration:none">${escapeHtml(r.secondary.label)}</a>
      </p>`
    : "";

  const inner = `
    <h1 style="margin:0 0 8px;color:#111;font-size:21px">${escapeHtml(r.heading)}</h1>
    <p style="margin:0 0 18px;color:#444;font-size:14px;line-height:1.7">${escapeHtml(r.intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px">
      ${itemRows}
      ${vatRow}
      <tr>
        <td style="padding:12px 0 0;color:#111;font-size:15px;font-weight:bold">Total</td>
        <td style="padding:12px 0 0;color:#111;font-size:15px;font-weight:bold;text-align:right">${escapeHtml(r.totalText)}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;border-top:1px solid #eee;padding-top:8px">
      ${metaRows}
    </table>
    ${invoiceButton}
    ${invoiceLink}
    ${secondary}`;
  try {
    await sendEmail(env, to, r.subject, shell(inner));
  } catch {
    // never block the webhook on an email failure
  }
};

/** Welcome email sent once when a new account is created. Never throws. */
export const sendWelcomeEmail = async (env: Env, to: string, name?: string | null): Promise<void> => {
  const inner = `
    <h1 style="margin:0 0 12px;color:#111;font-size:22px">Welcome to TV Music Store, ${firstName(name)} 👋</h1>
    <p style="margin:0 0 16px;color:#444;font-size:14px;line-height:1.7">
      Your account is ready. You now have access to our library of cinematic and production music —
      here's how it works:
    </p>
    <ol style="margin:0 0 18px;padding-left:18px;color:#444;font-size:14px;line-height:1.8">
      <li><b>Find a track</b> in the music library and preview it.</li>
      <li><b>Download it</b> — every download comes with a License Certificate (PDF) as your proof of use.</li>
      <li><b>Use it</b> within your plan: on the free plan, add a credit to TV Music Store in your description.</li>
    </ol>
    <p style="margin:0 0 20px;color:#444;font-size:14px;line-height:1.7">
      Upgrading unlocks unlimited downloads, WAV + stems and no attribution. And if a YouTube
      Content&nbsp;ID claim ever appears on your video, send us the link from your account —
      we submit it for release within one business day, on any plan.
    </p>
    <p style="margin:0 0 26px;text-align:center">
      <a href="https://tvmusicstore.com/catalog"
        style="display:inline-block;background:#F4C430;color:#111;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:8px">
        Browse the music library
      </a>
    </p>
    <p style="margin:0;color:#888;font-size:12px;line-height:1.6">
      Questions about licensing? See <a href="https://tvmusicstore.com/licensing" style="color:#b8860b;text-decoration:none">how licensing works</a>
      or just reply to this email.
    </p>`;
  try {
    await sendEmail(env, to, "Welcome to TV Music Store", shell(inner));
  } catch {
    // never block signup on an email failure
  }
};
