import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

// Public Privacy Policy page. Content mirrors docs/PRIVACY_POLICY_DRAFT.md.
const EFFECTIVE = "6 July 2026";
const ADDRESS = "United Kingdom"; // TODO(owner): replace with correspondence address

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-10 text-xl text-foreground">{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">{children}</p>
);
const UL = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="mt-3 space-y-1.5">
    {items.map((it, i) => (
      <li key={i} className="flex gap-2 font-body text-sm leading-relaxed text-muted-foreground">
        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#F4C430]" />
        <span>{it}</span>
      </li>
    ))}
  </ul>
);

const Privacy = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
      <header>
        <p className="font-body text-xs uppercase tracking-widest text-[#F4C430]">Legal</p>
        <h1 className="mt-2 text-3xl text-foreground md:text-4xl">Privacy Policy</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Version 1.0 · Effective {EFFECTIVE}
        </p>
      </header>

      <H2>Who we are</H2>
      <P>
        TV Music Store is a trading name of a UK general partnership of Stanislav Barantsov and Maryna
        Huz. We are the data controller for personal data processed through tvmusicstore.com. Contact:
        contact@tvmusicstore.com, {ADDRESS}.
      </P>

      <H2>What we collect and why</H2>
      <P>We keep data collection to the minimum needed to run the store:</P>
      <UL
        items={[
          "Email and name — to create your account, sign you in, and send login and license emails (performance of contract).",
          "Login codes and session — to authenticate you securely (contract).",
          "Purchases — order, plan, amount, track, license code, payment reference — to provide and prove your license, support you, and keep accounts (contract / legal obligation).",
          "Download history — to enforce plan limits and provide re-downloads and license history (contract).",
          "Technical logs — IP, timestamp, request, browser — to keep the site working and secure and to prevent abuse (legitimate interest).",
          "Essential cookies — to keep you signed in and remember your cart and preferences (strictly necessary).",
        ]}
      />
      <P>
        We do not sell your data and we do not use it for third-party advertising. We do not currently
        set analytics or advertising cookies; if we add any, we will ask for consent first.
      </P>

      <H2>Payments</H2>
      <P>
        Payments are handled by our processors — Stripe (subscriptions/cards) and PayPal (one-time).
        We do not see or store your full card details; the processor does, under its own privacy
        policy. We receive a transaction reference, amount, and status to record your license.
      </P>

      <H2>Who we share data with</H2>
      <P>
        We share the minimum necessary with service providers that process data on our behalf under
        contract, only to run the service:
      </P>
      <UL
        items={[
          "Cloudflare — hosting, database, storage, security.",
          "Google — “Sign in with Google”, if you choose it.",
          "Stripe and PayPal — payment processing.",
          "Resend — sending login and license emails.",
          "YouTube Content ID administrator — only the track/claim data needed to release claims on your licensed use, not your account data.",
        ]}
      />
      <P>We may also disclose data if required by law, or to protect our rights, users, or the service.</P>

      <H2>Where your data is stored</H2>
      <P>
        Our infrastructure and some processors are in the UK, EU, US, and other countries. Where data
        leaves the UK/EU, we rely on appropriate safeguards (such as the UK IDTA or EU Standard
        Contractual Clauses) offered by those providers.
      </P>

      <H2>How long we keep it</H2>
      <UL
        items={[
          "Account data — while your account is open, and for a reasonable period after.",
          "Purchase, license, and accounting records — as long as needed for support and to meet legal/tax obligations (typically up to 6 years).",
          "Technical logs — a short period for security and diagnostics.",
        ]}
      />

      <H2>Your rights (UK GDPR)</H2>
      <P>
        You have the right to access, correct, delete, restrict, object to, and port your personal
        data, and to withdraw consent where processing is based on consent. To exercise any of these,
        email contact@tvmusicstore.com. You can also complain to the UK Information Commissioner's
        Office (ICO) at ico.org.uk.
      </P>

      <H2>Cookies</H2>
      <P>
        We use essential cookies to keep you signed in and remember your cart and preferences. These
        are required for the site to work. We do not currently set analytics or advertising cookies;
        if we add any, we will show a consent banner first.
      </P>

      <H2>Children</H2>
      <P>
        The service is not directed at children under 16, and we do not knowingly collect their data.
        If you believe a child has given us personal data, contact us and we will delete it.
      </P>

      <H2>Changes</H2>
      <P>
        We may update this policy; the version and date above change when we do, and significant
        changes will be notified on the site or by email.
      </P>

      <H2>Contact</H2>
      <P>TV Music Store — contact@tvmusicstore.com, {ADDRESS}.</P>

      <p className="mt-10 border-t border-border/50 pt-6 font-body text-xs text-muted-foreground">
        © {new Date().getFullYear()} TV Music Store. All rights reserved.
      </p>
    </main>
    <Footer />
  </div>
);

export default Privacy;
