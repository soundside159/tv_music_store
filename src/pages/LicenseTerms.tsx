import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

// Public License Terms page. Content mirrors docs/LICENSE_TERMS_DRAFT.md.
// Owner: update EFFECTIVE + ADDRESS once finalised; keep this in sync with the
// draft and the certificate wording.
const EFFECTIVE = "8 July 2026";
const ADDRESS =
  "Correspondence address: TV Music Store, 5 Brayford Square, London, E1 0SG, United Kingdom";

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

const LicenseTerms = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
      <header>
        <p className="font-body text-xs uppercase tracking-widest text-[#F4C430]">Legal</p>
        <h1 className="mt-2 text-3xl text-foreground md:text-4xl">Music License Terms</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Version 1.0 · Effective {EFFECTIVE}
        </p>
      </header>

      <P>
        These Music License Terms ("Terms") govern every license granted through
        tvmusicstore.com. By purchasing, downloading, or using any track, or by keeping an active
        subscription, you agree to these Terms. Each license is also recorded on a License
        Certificate (PDF) that carries a unique License Number — together they are your proof of
        license.
      </P>

      <H2>1. What you are getting</H2>
      <P>
        All music on TV Music Store is the property of TV Music Store and its composers. When you
        obtain a license you are not buying the music or any copyright in it. You receive a limited,
        worldwide, non-exclusive, non-transferable, non-sublicensable license to use the track
        within the scope of the license type you obtained. Because it is non-exclusive, the same
        track may be licensed to others; because it is non-transferable, you may not sell, assign, or
        give your license to anyone else.
      </P>

      <H2>2. License types</H2>
      <P>
        <span className="text-foreground">One-time single-track licenses</span> are bought per track,
        for one project, and are perpetual for that project (see §4). Tiers: Personal (personal,
        non-commercial use), Commercial (client &amp; commercial use in one online project), and
        Professional (adds TV/radio/film broadcast and games/software).
      </P>
      <P>
        <span className="text-foreground">Subscription licenses</span> let you license and download
        tracks while your plan is active. Free covers personal, non-commercial use with an
        attribution credit; Pro covers monetized online content for one channel/brand; Max covers
        commercial &amp; client work, paid ads, broadcast, and multiple brands. Licenses obtained
        during an active subscription stay valid for those projects even after you cancel (see §4).
      </P>

      <H2>3. Permitted and not permitted</H2>
      <P>Permitted, within your tier or plan scope:</P>
      <UL
        items={[
          "Synchronizing the track with your video, film, podcast, game, or audio project.",
          "Monetized content on the platforms your license allows (YouTube, Vimeo, social, streaming).",
          "Editing, trimming, looping, and mixing the track to fit your project.",
        ]}
      />
      <P>Not permitted on any tier:</P>
      <UL
        items={[
          "Reselling, redistributing, sharing, or offering the track as a standalone audio file, sample, or in a music library.",
          "Registering the track (or your video's audio) in any Content ID or rights system as your content.",
          "Claiming authorship or ownership of the music.",
          "Using the track in a defamatory, hateful, pornographic, or illegal context.",
          "Any use beyond your specific tier or plan — each project needs its own license.",
        ]}
      />

      <H2>4. Perpetuity &amp; cancellation</H2>
      <P>
        One-time licenses are perpetual for the single project they were bought for — they never
        expire. For subscriptions, any track you licensed or downloaded while active stays licensed
        forever for the projects you used it in; cancelling only stops you from licensing new tracks.
        Your existing projects never become infringing because you cancelled. If a payment is
        reversed or charged back, the affected license is suspended until resolved. Certificates show
        no expiry date, because licenses do not expire.
      </P>

      <H2>5. Attribution</H2>
      <P>
        On the Free plan you must credit TV Music Store — for example a line in your video
        description with the track name and a link to its page. On all paid tiers and plans, credit
        is appreciated but not required.
      </P>

      <H2>6. YouTube Content ID</H2>
      <P>
        Every track is registered in Content ID by its composer — that is what stops other people
        using it without paying, and it means a claim can still appear on your video even though you
        are licensed. A claim is a notice, not a copyright strike: it does not harm your channel. We
        get it released for licensed uses.
      </P>
      <UL
        items={[
          "Monitored channels: add your YouTube channel(s) in your account, up to your plan's limit. While your subscription is active we watch those channels for new uploads and send them for claim release proactively — usually the claim is cleared before you notice it. Anything you publish while active stays cleared; videos published after your subscription ends are not covered.",
          "Any single claim: paste the video link in your account (Content ID claims), or send it with your License Number to contact@tvmusicstore.com. The claim is released within one business day.",
          "The video must be Public or Unlisted. A private video is invisible to YouTube's API, so a claim on it cannot be found or released by anyone — publish it first, then send us the link.",
        ]}
      />
      <P>
        <strong>If a claim is not resolved.</strong> Claims are released through the copyright system
        at the composer's request — with your channel whitelisted this happens automatically, and you
        normally never see it. Things can still go wrong: a composer can fall ill or become
        unreachable. So if a claim on a video covered by a valid license is still open{" "}
        <strong>14 days</strong> after you reported it to us (through your account or by email), you
        may ask for a refund — the one-time license for that track, or the subscription payment for
        the period concerned. We would rather return your money than leave you stuck with a claim on
        music you paid for.
      </P>
      <P>
        Releasing a claim transfers no ownership; the music remains the property of TV Music Store
        and its composers.
      </P>

      <H2>7. Payment, chargebacks &amp; refunds</H2>
      <P>
        Payments are processed by Stripe (subscriptions/cards) and PayPal (one-time) under their own
        terms. If a payment fails, is reversed, or is charged back, the related license is suspended
        until settled. All sales are final (digital goods delivered immediately), except: if you
        report a technical problem with a download within 48 hours and we cannot fix it within 5
        business days, we refund that purchase in full. Because downloads are supplied immediately,
        at checkout you agree that supply begins right away and you waive the 14-day cancellation
        right under the UK Consumer Contracts Regulations for that download.
      </P>

      <H2>8. Ownership &amp; intellectual property</H2>
      <P>
        All music, recordings, compositions, stems, artwork, the TV Music Store name, logo, and site
        content remain the property of TV Music Store and/or the relevant composer. These Terms grant
        a limited license only and transfer no ownership, copyright, or moral rights. Every composer
        in the catalogue has authorised TV Music Store, in writing, to license their music to
        customers; on that basis TV Music Store grants every customer license directly, as the
        authorised licensor — you deal with us, not with a third party. That authorisation is
        non-exclusive: a composer may also license the same work elsewhere, which does not affect the
        license you obtain here. Your license remains valid for the uses it covers regardless.
      </P>

      <H2>9. Warranties &amp; disclaimer</H2>
      <P>
        The service and music are provided "as is" and "as available". To the maximum extent
        permitted by law, TV Music Store disclaims all implied warranties, including merchantability
        and fitness for a particular purpose. You are responsible for ensuring your particular use
        complies with the platforms and laws that apply to you. This does not affect your mandatory
        statutory consumer rights.
      </P>

      <H2>10. Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, TV Music Store's total liability for any claim
        relating to a license or track is limited to the amount you paid for that license (or, for
        subscription tracks, the subscription fee for the then-current period). We are not liable for
        indirect, incidental, or consequential damages.
      </P>

      <H2>11. Indemnification</H2>
      <P>
        You agree to indemnify TV Music Store against claims arising from your use of a track outside
        the scope of your license, or from the content you combine the track with.
      </P>

      <H2>12. Termination</H2>
      <P>
        We may suspend or terminate a license if you materially breach these Terms (for example
        resale, out-of-scope use, or non-payment). Licenses validly granted and used in good faith
        before any termination for reasons other than breach remain valid for their existing
        projects.
      </P>

      <H2>13. Governing law</H2>
      <P>
        These Terms are governed by the laws of England &amp; Wales, and any dispute is subject to
        the exclusive jurisdiction of its courts. This does not remove any mandatory
        consumer-protection rights you have where you live.
      </P>

      <H2>14. Changes</H2>
      <P>
        We may update these Terms; the version and effective date above change when we do. Licenses
        already granted keep the scope described in the version in effect when they were issued.
      </P>

      <H2>15. Contact</H2>
      <P>
        TV Music Store is a trading name of a UK general partnership of Stanislav Barantsov and
        Maryna Huz. {ADDRESS}. Contact: contact@tvmusicstore.com.
      </P>

      <p className="mt-10 border-t border-border/50 pt-6 font-body text-xs text-muted-foreground">
        © {new Date().getFullYear()} TV Music Store. All rights to the music remain the property of
        TV Music Store and its composers; a license grants a limited, non-exclusive right of use as
        described above.
      </p>
    </main>
    <Footer />
  </div>
);

export default LicenseTerms;
