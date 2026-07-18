// Guides — the answer library (/guides).
//
// WHY THIS FILE EXISTS: AI answer engines (ChatGPT, Perplexity, Gemini, Google's
// AI Overviews) quote pages that answer a concrete question in a form that is
// easy to lift: the answer FIRST, then the detail, then an explicit Q&A block.
// Classic SEO wants the same thing. Every guide below is built that way —
// `tldr` is the extractable answer, `sections` the substance, `faq` the block we
// also emit as FAQPage schema.
//
// PURE DATA ONLY — no React, no "@/" aliases: this module is imported both by
// the app (src/pages/Guides.tsx) and by the Cloudflare edge prerender
// (functions/_middleware.ts) and the sitemap function.
//
// PRICES ARE DELIBERATELY NOT HARD-CODED in the prose (the owner edits them in
// the admin); guides talk about plan NAMES and what they include, and link to
// /pricing for the live numbers.

import { guidesRound2 } from "./guidesRound2";

export interface GuideSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
}

export interface GuideFaq {
  q: string;
  a: string;
}

export interface Guide {
  slug: string;
  /** <title> / card title. */
  title: string;
  /** The H1 — phrased as the question people actually ask. */
  h1: string;
  /** Meta description. */
  description: string;
  /** The front-loaded answer. This is the paragraph an AI is most likely to quote. */
  tldr: string;
  /** ISO date — freshness is a ranking/citation signal, keep it honest. */
  updated: string;
  readMinutes: number;
  sections: GuideSection[];
  faq: GuideFaq[];
  /** Slugs of related guides. */
  related?: string[];
}

export const guides: Guide[] = [
  {
    slug: "royalty-free-music-for-youtube",
    title: "Royalty-Free Music for YouTube: Rules, Claims and Monetization",
    h1: "Can I use royalty-free music on YouTube and still monetize?",
    description:
      "Yes — if the music is properly licensed. How royalty-free music works on YouTube, why Content ID claims still happen, and how to keep your video monetized.",
    tldr:
      "Yes. Once you hold a valid license for a royalty-free track, you can publish it on YouTube and keep monetization. The one thing that trips people up is Content ID: the track is registered with YouTube's fingerprinting system to stop other people from stealing it, so a claim can still appear on your video. A claim is not a copyright strike — the library that licensed you sends it for release, and registering your channel with them keeps it from repeating.",
    updated: "2026-07-11",
    readMinutes: 5,
    sections: [
      {
        heading: "What \"royalty-free\" actually means",
        paragraphs: [
          "Royalty-free does not mean free of charge and it does not mean free of copyright. It means that after you pay once — a subscription or a one-time license — you do not owe a further per-play or per-view royalty for the uses your license covers.",
          "The composer still owns the music. You are buying permission to use it, and that permission has limits: which projects, which platforms, and whether client work and paid ads are included.",
        ],
      },
      {
        heading: "Why you can still get a Content ID claim",
        paragraphs: [
          "Content ID is YouTube's fingerprinting system. Music libraries register their catalogue in it so that someone who did not pay cannot simply upload the track. The system cannot tell a paying customer from a thief on its own — it matches audio, not receipts.",
          "So a claim on licensed music is normal and it is not a copyright strike. A strike is a legal takedown and it damages your channel. A claim is an automated notice: it may temporarily divert monetization, and it disappears once the library confirms you are a licensee.",
        ],
      },
      {
        heading: "How to prevent claims before they happen",
        bullets: [
          "Some libraries offer channel whitelisting — you give them your channel URL and they stop matching your uploads. If yours does, register every channel you publish on before you publish; if not, claims are released per video on request.",
          "Keep the license PDF / receipt. If a claim appears anyway, it is the fastest way to clear it.",
          "Do not re-upload the raw music file as a standalone \"track\" video — that will be claimed, correctly.",
        ],
      },
      {
        heading: "What happens on TV Music Store",
        paragraphs: [
          "Every plan lets you publish on YouTube. If a claim appears, paste the video link in your account (Copyright Claims) and name the track — we send the claim for release within one business day, on every plan including Free. Paid plans add unlimited downloads; Max adds WAV + stems and the commercial license needed for ads and client work.",
          "See the current plan limits and prices on the pricing page.",
        ],
      },
    ],
    faq: [
      {
        q: "Is royalty-free music safe for monetized YouTube videos?",
        a: "Yes, provided you hold a license that covers YouTube. Monetization stays with you — if a Content ID claim appears, the library confirms your license and has it released.",
      },
      {
        q: "Does a Content ID claim hurt my channel?",
        a: "No. A claim is not a copyright strike. It does not affect standing; it can affect the revenue of that one video until it is released, which is why it is worth reporting it straight away.",
      },
      {
        q: "Do I need a new license for every video?",
        a: "No. A subscription covers the videos you make while it is active, and downloaded tracks stay licensed for those projects. A one-time track license covers that track for the uses listed in its tier.",
      },
      {
        q: "Can I use the music on a client's YouTube channel?",
        a: "Only with a license that covers client work — on TV Music Store that is the Max plan or the Commercial single-track license. A personal-tier license does not cover work you are paid to produce for someone else.",
      },
    ],
    related: ["content-id-claims-explained", "music-license-for-client-work", "royalty-free-vs-copyright-free"],
  },
  {
    slug: "content-id-claims-explained",
    title: "Content ID Claims on Licensed Music: Why They Happen and How to Clear Them",
    h1: "Why did licensed music get a Content ID claim, and how do I remove it?",
    description:
      "A Content ID claim on music you paid for is normal, not a strike. Here is what the system actually does, how claims get released, and what to do if one appears.",
    tldr:
      "A Content ID claim on licensed music happens because the library registered the track in YouTube's fingerprint database to stop unlicensed use — the system matches audio, it cannot see your receipt. It is not a copyright strike and it does not endanger your channel. If a claim appears, send the library your video URL and licence and it is released, usually within a few working days.",
    updated: "2026-07-11",
    readMinutes: 4,
    sections: [
      {
        heading: "Claim vs strike — they are not the same thing",
        table: {
          headers: ["", "Content ID claim", "Copyright strike"],
          rows: [
            ["What it is", "Automated audio match", "Legal takedown request"],
            ["Effect on the channel", "None", "Serious — 3 strikes closes the channel"],
            ["Effect on the video", "Monetization may be redirected until released", "Video removed"],
            ["How it is resolved", "Library confirms your license and releases the claim", "Retraction or counter-notification"],
          ],
        },
      },
      {
        heading: "Whitelisting: prevention some libraries offer",
        paragraphs: [
          "Whitelisting means the library tells YouTube: this channel is licensed, stop matching it. Once a channel is on that list, uploads using the catalogue pass through without claims. Not every library offers it — it depends on their Content ID setup.",
          "Where whitelisting is not offered, claims are released individually: report each claimed video and it clears. Either way an entry is not retroactive — videos already claimed are released one by one.",
        ],
      },
      {
        heading: "If a claim already appeared",
        bullets: [
          "Do not dispute it blindly in YouTube Studio — go to the library first; it is faster.",
          "Send: the video URL, the track name, and your account or license reference.",
          "If the library offers channel whitelisting, ask for it in the same message so it does not repeat.",
          "Keep publishing — the claim does not stop the video from being live.",
        ],
      },
    ],
    faq: [
      {
        q: "Why does licensed music get claimed at all?",
        a: "Because the track is registered in Content ID to stop unlicensed uploads. The system matches the audio fingerprint and cannot know that you hold a license.",
      },
      {
        q: "How long does it take to clear a claim?",
        a: "It depends on the library. TV Music Store submits the release within one business day of your request; the release itself then runs through YouTube's Content ID system, usually within a day.",
      },
      {
        q: "Will the claim take my ad revenue?",
        a: "Revenue for the affected video can be held or redirected while the claim is open, which is why it is worth reporting the claim as soon as it appears.",
      },
    ],
    related: ["royalty-free-music-for-youtube", "music-license-for-client-work"],
  },
  {
    slug: "royalty-free-vs-copyright-free",
    title: "Royalty-Free vs Copyright-Free vs Public Domain: The Difference That Matters",
    h1: "What is the difference between royalty-free, copyright-free and public domain music?",
    description:
      "Royalty-free music is still copyrighted — you buy a license, not the song. Copyright-free and public domain mean something entirely different. Here is the practical difference.",
    tldr:
      "Royalty-free means you pay once and owe no further per-use royalties, but the composer still owns the copyright and your use is bound by the license. Copyright-free is a marketing term with no legal meaning — most \"copyright-free\" music is in fact royalty-free or Creative Commons with conditions. Public domain means the copyright has genuinely expired and anyone may use the work, which for music is rare and usually applies to the composition, not to a modern recording of it.",
    updated: "2026-07-11",
    readMinutes: 4,
    sections: [
      {
        heading: "The three terms side by side",
        table: {
          headers: ["Term", "Who owns it", "What you must do", "Typical risk"],
          rows: [
            ["Royalty-free", "The composer / library", "Buy a license; stay inside its terms", "Low — if the license covers your use"],
            ["Creative Commons", "The composer", "Follow the specific CC terms (often attribution, often non-commercial)", "Medium — CC-BY-NC forbids commercial use, and most video work is commercial"],
            ["\"Copyright-free\"", "Usually still the composer", "Read what is actually offered — the term means nothing legally", "High — the phrase is often used loosely by resellers"],
            ["Public domain", "Nobody", "Nothing for the composition", "The RECORDING is usually still copyrighted, even when the composition is not"],
          ],
        },
      },
      {
        heading: "The public-domain trap",
        paragraphs: [
          "Beethoven's Fifth is in the public domain. The 2019 orchestral recording of it is not — the performance and the master are protected. Using a modern recording of a public-domain piece without permission is still infringement.",
          "This catches a lot of documentary and education projects. If you need classical material, license a recording, or license a neo-classical track written for exactly this purpose.",
        ],
      },
      {
        heading: "Why the attribution question is not cosmetic",
        paragraphs: [
          "Creative Commons tracks frequently require attribution in the description, and CC licences with the NC (non-commercial) clause exclude anything you monetize — including a YouTube channel with ads. A commercial royalty-free license removes that ambiguity, which is what most creators are actually paying for.",
        ],
      },
    ],
    faq: [
      {
        q: "Is royalty-free music copyright-free?",
        a: "No. Royalty-free music is copyrighted. You license the right to use it; the composer keeps ownership.",
      },
      {
        q: "Do I have to credit royalty-free music?",
        a: "Usually not, but it depends on the library and the plan. Free tiers often require attribution; paid licenses generally do not.",
      },
      {
        q: "Can I use public domain music in a monetized video?",
        a: "You can use the composition, but you still need rights to whatever recording you use — and most recordings are protected.",
      },
    ],
    related: ["royalty-free-music-for-youtube", "how-much-does-royalty-free-music-cost"],
  },
  {
    slug: "music-license-for-client-work",
    title: "Music Licensing for Freelancers and Agencies: Client Work Explained",
    h1: "Which music license do I need for client work?",
    description:
      "If you are paid to make the video, you need a license that covers commercial and client use. Personal tiers do not. How to license music for freelance and agency projects.",
    tldr:
      "If someone pays you to produce the video, the use is commercial and a personal-tier license does not cover it — you need a commercial license. Buy it in your own name and cover the client's project with it, or buy on the client's behalf and hand the license over with the deliverables. On TV Music Store that means the Max plan (subscription) or the Commercial single-track license (one-off).",
    updated: "2026-07-11",
    readMinutes: 5,
    sections: [
      {
        heading: "The line that decides everything",
        paragraphs: [
          "Ask one question: is money changing hands for the production? If yes, it is client work, no matter how small the project or how personal the client's channel looks.",
          "Personal / hobby tiers exist for your own content. The moment you invoice someone for the edit, you are producing commercially and the license must say so.",
        ],
      },
      {
        heading: "Two clean ways to handle it",
        bullets: [
          "Agency model — you hold a commercial subscription and use it across the projects you produce. Simple, predictable, and you keep the account.",
          "Per-project model — you buy a one-time Commercial (or Professional, for broadcast) license per track and pass it on with the delivery. The client ends up holding a license in their own name, which large clients often demand.",
        ],
      },
      {
        heading: "What to hand over at delivery",
        bullets: [
          "The license document / receipt for each track used.",
          "Track title, composer and the license tier.",
          "For broadcast or festival delivery: a cue sheet (see the sync licensing guide).",
          "A note on Content ID: if a claim appears on the client's upload, report the video link to the library for release.",
        ],
      },
      {
        heading: "Paid ads are a separate question",
        paragraphs: [
          "Running the video as a paid advertisement — YouTube pre-roll, Meta, TikTok ads — is a commercial use in its own right, even for your own brand. Confirm that the tier covers advertising before you put budget behind it.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I use my personal subscription for a paying client?",
        a: "No. Client work is commercial use and needs a commercial license — on TV Music Store the Max plan or a Commercial single-track license.",
      },
      {
        q: "Who should own the license, me or the client?",
        a: "Either works. Hold it yourself if you produce for many clients; buy in the client's name if they require the license in their own paperwork, which is common for larger brands.",
      },
      {
        q: "Does the license end when my subscription does?",
        a: "The projects you published while it was active stay licensed. You just cannot start new projects with new downloads once it lapses. Check the license terms page for the exact wording.",
      },
    ],
    related: ["music-for-ads-and-commercials", "royalty-free-music-for-youtube", "sync-licensing-and-cue-sheets"],
  },
  {
    slug: "music-for-ads-and-commercials",
    title: "Music for Ads and Commercials: What Your License Must Cover",
    h1: "What license do I need to use music in an advertisement?",
    description:
      "Paid advertising is a distinct commercial use. What an ad license must include, how ad spend and broadcast change the tier you need, and what to check before launch.",
    tldr:
      "Advertising is a commercial use even when the ad is for your own business, so you need a license that explicitly covers paid ads and sponsored content. For online ads — YouTube pre-roll, Meta, TikTok, programmatic — a commercial tier is enough. For TV or radio broadcast, you need the broadcast tier, and the production will usually also require a cue sheet.",
    updated: "2026-07-11",
    readMinutes: 4,
    sections: [
      {
        heading: "Where the tiers break",
        table: {
          headers: ["Use", "Tier you need"],
          rows: [
            ["Organic post on your own channel", "Personal"],
            ["Sponsored content, brand deal", "Commercial"],
            ["Paid social / YouTube ads", "Commercial"],
            ["National TV or radio spot", "Professional / broadcast"],
            ["In-app, in-game or installation audio", "Professional"],
          ],
        },
      },
      {
        heading: "Questions to answer before launch",
        bullets: [
          "Is the ad running with money behind it? Then it is advertising, not organic content.",
          "Which territories and how long? Most royalty-free licenses are worldwide and perpetual — confirm it, because production-music deals often are not.",
          "Is it going to broadcast, cinema or an out-of-home screen? Those usually need the highest tier and a cue sheet.",
          "Do you need stems? Ads are re-cut constantly; stems let the editor re-time the music without a re-license.",
        ],
      },
      {
        heading: "A practical tip about exclusivity",
        paragraphs: [
          "Royalty-free music is non-exclusive: another brand can license the same track. For most performance advertising that is fine. If the track is going to become the sound of the brand, commission a custom piece instead — exclusivity is the thing you actually want to buy.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I use royalty-free music in a Facebook or YouTube ad?",
        a: "Yes, with a commercial license that covers paid advertising. A personal tier does not cover it.",
      },
      {
        q: "Do I need a different license for TV?",
        a: "Yes. Broadcast is normally the top tier, and the broadcaster will ask for a cue sheet listing the music used.",
      },
      {
        q: "Is the track exclusive to my campaign?",
        a: "No — royalty-free means non-exclusive. If you need the music to be yours alone, commission custom music.",
      },
    ],
    related: ["music-license-for-client-work", "sync-licensing-and-cue-sheets", "how-much-does-royalty-free-music-cost"],
  },
  {
    slug: "music-for-documentary-films",
    title: "Music for Documentaries: Licensing for Festivals, TV and Streaming",
    h1: "How do I license music for a documentary?",
    description:
      "Documentaries travel — festivals, broadcasters, Netflix and friends. What that means for the music license you need, cue sheets, and why the cheapest option can be the expensive one.",
    tldr:
      "A documentary needs a license that survives its whole life: festival screenings, broadcast, and streaming platforms. In practice that means the broadcast-capable tier (worldwide, perpetual, all media), plus a cue sheet listing every piece of music with its composer, publisher and duration — every broadcaster and most streamers will demand one before delivery.",
    updated: "2026-07-11",
    readMinutes: 5,
    sections: [
      {
        heading: "License for the film's future, not its first screening",
        paragraphs: [
          "The mistake that costs money is licensing for the festival cut and then discovering that the acquisition contract requires worldwide, all-media, perpetual rights. Re-clearing music after a sale is slow and gives the library leverage.",
          "Pick a license that is already worldwide and perpetual and covers broadcast — then a sale changes nothing about your music.",
        ],
      },
      {
        heading: "The cue sheet is not optional",
        paragraphs: [
          "A cue sheet is the delivery document that lists every music cue in the film: title, composer, publisher, their PRO and IPI numbers, the duration used and how it is used (background, featured, theme).",
          "Broadcasters use it to pay performance royalties to the composers. No cue sheet, no delivery — it is a hard requirement, not paperwork theatre.",
        ],
      },
      {
        heading: "What to collect for every track you use",
        bullets: [
          "Track title and version (the exact cut you used).",
          "Composer's legal name, PRO (BMI, ASCAP, PRS…) and IPI/CAE number.",
          "Publisher, publisher PRO and publisher IPI, if there is one.",
          "Duration used in the film and its usage type.",
          "Your license document.",
        ],
      },
      {
        heading: "Streaming platforms",
        paragraphs: [
          "Netflix, Prime and the rest do not license your music for you — they require you to warrant that everything is cleared and to deliver the cue sheet with the film. A commercial royalty-free license with broadcast rights normally satisfies this; a personal-tier license never does.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I use royalty-free music in a documentary on Netflix?",
        a: "Yes, if the license covers broadcast/streaming worldwide and perpetually, and you deliver a cue sheet. Personal-tier licenses do not qualify.",
      },
      {
        q: "What is a cue sheet and who writes it?",
        a: "It is the list of every music cue in the film with composer, publisher, PRO/IPI numbers and durations. The production writes it; the library gives you the data for its tracks.",
      },
      {
        q: "Do I pay again if the film gets picked up?",
        a: "Not with a worldwide, perpetual, all-media license — that is the whole point of buying the right tier at the start.",
      },
    ],
    related: ["sync-licensing-and-cue-sheets", "music-license-for-client-work"],
  },
  {
    slug: "sync-licensing-and-cue-sheets",
    title: "Sync Licensing and Cue Sheets: A Plain-English Guide",
    h1: "What is sync licensing, and what is a cue sheet?",
    description:
      "Sync licensing is permission to marry music to picture. A cue sheet is the document that tells broadcasters who to pay. What both mean in practice for film, TV and advertising.",
    tldr:
      "A sync (synchronisation) license is permission to synchronise a piece of music with moving images. A cue sheet is the delivery document that lists every cue in the finished production — title, composer, publisher, their PRO and IPI numbers, duration and usage — so that broadcasters can pay performance royalties to the right people. Sync gives you the right to use the music; the cue sheet is how the composer gets paid afterwards.",
    updated: "2026-07-11",
    readMinutes: 5,
    sections: [
      {
        heading: "The two halves of music money",
        paragraphs: [
          "The sync fee is what you pay the library or publisher for the right to use the music in your production. That is the part you buy.",
          "Performance royalties are paid separately, by the broadcaster, to the composer's performing-rights organisation (BMI, ASCAP, PRS, GEMA…). They cost you nothing — but they only reach the composer if the cue sheet is filed. That is why broadcasters insist on it.",
        ],
      },
      {
        heading: "What goes in a cue sheet",
        table: {
          headers: ["Field", "Example", "Why"],
          rows: [
            ["Cue title", "The Whispering Shadow", "Identifies the work"],
            ["Composer + PRO + IPI", "Jane Doe, BMI, 00123456789", "Who gets paid"],
            ["Publisher + PRO + IPI", "TV Music Store Publishing, BMI, 00987654321", "The publisher's share"],
            ["Duration used", "1:24", "Royalties are pro-rata"],
            ["Usage", "Background instrumental", "Different rates for theme / featured / background"],
          ],
        },
      },
      {
        heading: "When you need one",
        bullets: [
          "Any TV broadcast, anywhere.",
          "Most streaming-platform deliveries.",
          "Film festivals and theatrical release, in most territories.",
          "Not needed for a plain YouTube upload or a client's website video.",
        ],
      },
      {
        heading: "Getting the data from us",
        paragraphs: [
          "Every composer on TV Music Store has cue-sheet information on file — legal name, PRO and IPI, and the publisher details where one exists. It is printed on the license document for the tracks you buy, so you can fill a cue sheet without chasing anybody.",
        ],
      },
    ],
    faq: [
      {
        q: "Does a cue sheet cost me anything?",
        a: "No. It is paperwork, not a fee. The performance royalties it triggers are paid by the broadcaster, not by the production.",
      },
      {
        q: "Do I need a cue sheet for YouTube?",
        a: "No. Cue sheets are for broadcast, streaming-platform delivery and theatrical release.",
      },
      {
        q: "Is a sync license the same as a royalty-free license?",
        a: "A royalty-free license is one commercial way to sell sync rights: you pay once, you get the sync right, and no further per-use royalty is owed to the library.",
      },
    ],
    related: ["music-for-documentary-films", "music-for-ads-and-commercials"],
  },
  {
    slug: "how-much-does-royalty-free-music-cost",
    title: "How Much Does Royalty-Free Music Cost? Subscription vs Single Track",
    h1: "How much does royalty-free music cost, and which model is cheaper?",
    description:
      "Subscriptions vs one-time track licenses: what each model really costs, when a single license is the better buy, and the hidden costs to watch for.",
    tldr:
      "There are two models. A subscription costs a monthly or annual fee and lets you download and use as much music as you need while it is active — it is the cheaper option from roughly the third track onwards, and it is the right model for anyone publishing regularly. A one-time track license is a single payment for one track, forever, and it wins when you need one piece for one project, or when a client insists on holding the license in their own name.",
    updated: "2026-07-11",
    readMinutes: 4,
    sections: [
      {
        heading: "Which model fits you",
        table: {
          headers: ["You are…", "Better model", "Why"],
          rows: [
            ["A YouTuber publishing weekly", "Subscription", "Cost per track collapses as you publish"],
            ["An agency running several client projects", "Subscription (commercial tier)", "One account covers the work you produce"],
            ["A filmmaker with one film to finish", "One-time license", "You need a few tracks, forever, with no ongoing fee"],
            ["A brand whose legal team wants the license in the brand's name", "One-time license", "The paperwork sits with the buyer"],
          ],
        },
      },
      {
        heading: "The costs people forget to count",
        bullets: [
          "Tier upgrades: a cheap plan that excludes client work is not cheap if your work is client work.",
          "Formats: WAV and stems are often on the higher tier only — and an editor without stems will ask you for them by day two.",
          "Whitelisting: if the library charges per channel, a multi-channel operation gets expensive.",
          "Re-licensing: a license that is not worldwide-and-perpetual can come back for a second payment when the project is sold.",
        ],
      },
      {
        heading: "What we charge",
        paragraphs: [
          "TV Music Store has a free tier with a small monthly download allowance, two subscription tiers (Pro for creators, Max for commercial and client work with WAV and stems), and three one-time track licenses — Personal, Commercial and Professional. Current prices are on the pricing page; they are worldwide and perpetual for the uses each tier lists.",
        ],
      },
    ],
    faq: [
      {
        q: "Is a royalty-free subscription cheaper than buying tracks?",
        a: "From about the third track onward, yes. Below that, a single-track license is usually the cheaper buy.",
      },
      {
        q: "What happens to my videos if I cancel the subscription?",
        a: "Projects you published while the subscription was active stay licensed. You simply cannot license new downloads after it lapses.",
      },
      {
        q: "Are there hidden per-view royalties?",
        a: "No. That is what royalty-free means: you pay for the license, not per play.",
      },
    ],
    related: ["royalty-free-vs-copyright-free", "music-license-for-client-work"],
  },
  {
    slug: "trailer-music-guide",
    title: "Trailer Music: How to Choose It and What It Needs to Do",
    h1: "How do I choose music for a trailer?",
    description:
      "Trailer music has a job: structure. How trailer cues are built, what to look for when licensing one, and why stems decide whether your edit works.",
    tldr:
      "Trailer music is built as a structure, not a song: a quiet hook, a rising middle with rhythmic pulses, a hard hit, then a final act that either explodes or drops to a single haunting element. Choose a cue whose build lands where your reveal lands, and license the version with stems — trailers are re-cut constantly, and stems let you re-time the music without paying twice.",
    updated: "2026-07-11",
    readMinutes: 4,
    sections: [
      {
        heading: "The anatomy of a trailer cue",
        bullets: [
          "Act 1 — atmosphere: sparse, one idea, room for dialogue.",
          "Act 2 — build: pulses, risers, tempo doubling, the audience starts leaning forward.",
          "The hit: the drop your title card lands on.",
          "Act 3 — payoff: full ensemble, or a sudden silence that hits harder than the orchestra.",
        ],
      },
      {
        heading: "What to check before you license",
        bullets: [
          "Does the build land where your reveal lands? A cue that peaks four seconds late will fight you for the rest of the edit.",
          "Are there alternate versions (short cut, no-drums, underscore)? They save the edit.",
          "Are stems included? For trailers this is the difference between a two-hour job and a two-day one.",
          "Does the license cover the way the trailer will run — cinema, TV, paid social?",
        ],
      },
      {
        heading: "The mistake that kills trailers",
        paragraphs: [
          "Editors pick the cue for its most exciting ten seconds and then discover the other ninety fight the picture. Audition the whole cue against your rough cut before you commit — and if only ten seconds work, buy the stems and rebuild the rest around them.",
        ],
      },
    ],
    faq: [
      {
        q: "Do I need stems for a trailer?",
        a: "For anything beyond the simplest cut, yes. Trailers are re-timed constantly and stems let you move the hit without re-licensing.",
      },
      {
        q: "Can I use trailer music in a cinema screening?",
        a: "Only with a license that covers theatrical use — that is the broadcast/professional tier, not a personal one.",
      },
    ],
    related: ["music-for-ads-and-commercials", "how-much-does-royalty-free-music-cost"],
  },
  {
    slug: "music-for-podcasts",
    title: "Music for Podcasts: Intros, Beds and What the License Must Cover",
    h1: "What music license do I need for a podcast?",
    description:
      "Podcasts are distributed everywhere and monetized in ways that surprise people. What a podcast music license must cover — including sponsorships and video versions.",
    tldr:
      "A podcast needs a license that covers distribution on all podcast platforms and, in practice, monetization: the moment you read a sponsor's ad, the show is commercial. If you also publish the video version on YouTube, whitelist that channel too. A personal-tier license covers a hobby show; a sponsored show needs the commercial tier.",
    updated: "2026-07-11",
    readMinutes: 3,
    sections: [
      {
        heading: "Where podcasts trip over the license",
        bullets: [
          "Sponsor reads and ad inserts make the show commercial — even a small show.",
          "The YouTube video version is a separate surface: if Content ID claims it, report the video for release.",
          "Dynamic ad insertion means your episode is monetized after publication — the license must already cover it.",
          "Network deals often require the network, not you, to hold the license. Check before you sign.",
        ],
      },
      {
        heading: "What actually works musically",
        bullets: [
          "Intro: 15–30 seconds with a clean ending you can duck under a voice.",
          "Beds: long, low-movement loops. Anything with a melody will fight the speech.",
          "Stings: 2–4 seconds for section changes — the fastest way to sound produced.",
          "Keep the same theme across episodes. Recognition beats novelty.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I use royalty-free music in a monetized podcast?",
        a: "Yes, with a license that covers commercial use. Sponsor reads and ad inserts make the podcast commercial.",
      },
      {
        q: "Do I need a separate license for the YouTube version?",
        a: "Not a separate license, but if Content ID claims the YouTube version, report it to the library — a licensed episode is released quickly.",
      },
    ],
    related: ["royalty-free-music-for-youtube", "music-license-for-client-work"],
  },
];

// Owner-requested round 2 (claim-removal speed, AI vs human, choosing music)
// lives in its own file so this one stays readable — the rest of the app only
// ever imports `guides`.
guides.push(...guidesRound2);

// ---------------------------------------------------------------------------
// PUBLICATION SCHEDULE — real, not cosmetic.
//
// The owner wanted the guides to look like they appeared over a month rather
// than in one day. Back-dating them would be date manipulation (Google
// penalises it, and a date that contradicts the crawl history destroys trust),
// so instead they are RELEASED over that month for real: a guide listed below
// with a future date is not on the site — not in /guides, not on its own URL,
// not in the sitemap, not in the prerender — until that day arrives. Then it
// appears by itself, with a truthful date. No deploy needed.
//
// The date here is also the guide's shown/structured "updated" date.
// ---------------------------------------------------------------------------
const SCHEDULE: Record<string, string> = {
  // Live from day one — the commercially important answers.
  "royalty-free-music-for-youtube": "2026-07-11",
  "content-id-claims-explained": "2026-07-11",
  "how-to-remove-a-content-id-claim": "2026-07-11",
  "music-license-for-client-work": "2026-07-11",
  "royalty-free-vs-copyright-free": "2026-07-11",
  "how-much-does-royalty-free-music-cost": "2026-07-11",
  // Released over the following weeks.
  "music-for-ads-and-commercials": "2026-07-15",
  "how-to-choose-music-for-your-project": "2026-07-18",
  "ai-music-vs-human-composed": "2026-07-22",
  "sync-licensing-and-cue-sheets": "2026-07-25",
  "music-for-documentary-films": "2026-07-29",
  "trailer-music-guide": "2026-08-01",
  "music-for-podcasts": "2026-08-05",
};

for (const guide of guides) {
  const date = SCHEDULE[guide.slug];
  if (date) guide.updated = date;
}

/**
 * Overrides the built-in schedule with the dates the owner set in
 * Admin -> Articles (site_config `guide_schedule`, delivered by /api/content and
 * read straight from D1 by the edge prerender). Moving an article earlier or
 * later therefore needs no deploy.
 */
export const applyGuideSchedule = (dates: Record<string, string> | undefined): void => {
  if (!dates) return;
  for (const guide of guides) {
    const date = dates[guide.slug];
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) guide.updated = date;
  }
};

/** True once the guide's publication date has arrived (UTC). */
export const isPublished = (guide: Guide, now: Date = new Date()): boolean =>
  new Date(`${guide.updated}T00:00:00Z`).getTime() <= now.getTime();

/** The guides that are actually live right now — use this everywhere. */
export const publishedGuides = (now?: Date): Guide[] =>
  guides.filter((guide) => isPublished(guide, now));

/** A guide by slug — undefined while it is still scheduled for a later date. */
export const guideBySlug = (slug: string, now?: Date): Guide | undefined => {
  const guide = guides.find((item) => item.slug === slug);
  return guide && isPublished(guide, now) ? guide : undefined;
};
