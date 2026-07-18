import { sendEmail, type Env } from "./_utils";

// Shared transactional email templates. Files starting with "_" are not routed.

const shell = (inner: string) => `
<div style="margin:0 auto;max-width:480px;font-family:Arial,Helvetica,sans-serif">
  <div style="background:#111;padding:22px 20px;text-align:center;border-radius:12px 12px 0 0">
    <img src="https://tvmusicstore.com/images/icons/web-app-manifest-192x192.png" width="44" height="44" alt="TV Music Store"
      style="display:block;margin:0 auto 10px;border-radius:10px"/>
    <span style="color:#F4C430;font-size:16px;font-weight:bold;letter-spacing:3px">TV MUSIC STORE</span>
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
