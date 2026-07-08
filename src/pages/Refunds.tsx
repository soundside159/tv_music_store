import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

// Public Refund Policy page (required for Paddle verification). Consistent with
// the refund wording in the License Terms.
const EFFECTIVE = "8 July 2026";

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

const Refunds = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
      <header>
        <p className="font-body text-xs uppercase tracking-widest text-[#F4C430]">Legal</p>
        <h1 className="mt-2 text-3xl text-foreground md:text-4xl">Refund Policy</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">Version 1.0 · Effective {EFFECTIVE}</p>
      </header>

      <H2>Digital products</H2>
      <P>
        TV Music Store sells digital products — music downloads, one-time track licenses and
        subscriptions. Because our products are delivered digitally and can be used immediately, some
        of the terms below reflect the nature of digital goods. TV Music Store is a trading name of a
        UK general partnership; contact: contact@tvmusicstore.com.
      </P>

      <H2>Right to cancel digital downloads</H2>
      <P>
        Under the UK Consumer Contracts Regulations you normally have 14 days to cancel an online
        purchase. For downloadable digital content, that right ends once the download begins. By
        starting a download you expressly consent to immediate delivery and acknowledge that you lose
        the 14-day right to cancel for that item. As a result, completed downloads and one-time track
        licenses are generally non-refundable once the file has been downloaded.
      </P>

      <H2>When we do give a refund</H2>
      <UL
        items={[
          "Faulty or corrupt files — if a download is broken, will not play, or is materially not as described, contact us within 14 days and we will re-supply the file or issue a refund.",
          "Duplicate or accidental purchase — if you were charged twice, or bought the wrong item and have not downloaded it, contact us within 14 days and we will refund it.",
          "Failed delivery — if a payment was taken but you never received access to what you paid for, we will fix it or refund you.",
        ]}
      />

      <H2>Subscriptions</H2>
      <P>
        You can cancel a subscription at any time from your account. Cancellation stops future renewals;
        your plan stays active until the end of the current paid period, and we do not charge again
        after that. We do not provide partial refunds for the unused part of a billing period unless the
        law requires it. Tracks you downloaded and used in projects during an active subscription remain
        licensed for those projects under the License Terms, even after you cancel.
      </P>

      <H2>How to request a refund</H2>
      <P>
        Email contact@tvmusicstore.com from the address on your account, with your order or license
        number and a short description of the issue. We aim to respond within a few business days.
        Approved refunds are returned to your original payment method via our payment provider.
      </P>

      <H2>Chargebacks</H2>
      <P>
        If something is wrong with an order, please contact us first — we can almost always resolve it
        faster than a chargeback. Opening a chargeback without contacting us may lead to your account
        being suspended while the dispute is reviewed.
      </P>

      <H2>Changes</H2>
      <P>
        We may update this policy; the version and date above change when we do. This policy does not
        affect your statutory rights.
      </P>

      <H2>Contact</H2>
      <P>TV Music Store — contact@tvmusicstore.com.</P>

      <p className="mt-10 border-t border-border/50 pt-6 font-body text-xs text-muted-foreground">
        © {new Date().getFullYear()} TV Music Store. All rights reserved.
      </p>
    </main>
    <Footer />
  </div>
);

export default Refunds;
