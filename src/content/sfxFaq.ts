// Templated FAQ for each Sound-Effects CATEGORY page (/sound-effects/:category).
//
// Why this exists: it is a TuneTank-style SEO / AI-discovery block. The same
// four questions are rendered as visible <details> accordions AND mirrored into
// a schema.org FAQPage JSON-LD (see useSeo in SoundEffects.tsx), so Google can
// show rich results and answer engines (ChatGPT, Perplexity, Gemini) can quote
// clean Q&A about "<Category> sound effects".
//
// Copy rules (honesty — same spirit as AGENTS.md): sound effects ARE our own
// royalty-free content, so "royalty-free", "commercial use" and "no attribution"
// are true for this catalogue. We describe the REQUEST/plan, never promise how
// fast any platform acts. Keep it plan-accurate: on the SFX pages WAV downloads
// come with the Pro and Max plans; Free = preview/listen only. Commercial use
// travels with the Max plan (and one-time Professional licences later).

export interface FaqItem {
  q: string;
  a: string;
}

/** Title-case the category as it should read mid-sentence, e.g. "Human". */
const clean = (title: string) => title.trim().replace(/\s+/g, " ");

/**
 * Build the four Q&A items for a category. `title` is the category's display
 * name (e.g. "Human", "Funny", "Nature"); everything else is derived.
 */
export const buildSfxFaq = (title: string): FaqItem[] => {
  const Cat = clean(title); // "Human"
  const cat = Cat.toLowerCase(); // "human"

  return [
    {
      q: `Where can I download ${Cat} sound effects?`,
      a: `You can download ${Cat} sound effects on TV Music Store. Preview any ${cat} sound effect right on this page, then download the studio-quality WAV with a Pro or Max plan — every sound effect is royalty-free and cleared for commercial use.`,
    },
    {
      q: `Are ${Cat} sound effects royalty-free and safe for YouTube?`,
      a: `Yes. Every ${cat} sound effect here is royalty-free and safe to use on YouTube, TikTok, Twitch, Instagram and podcasts. They are our own cleared content, so they won't trigger a copyright claim on your video, and no attribution is required.`,
    },
    {
      q: `Can I use ${Cat} sound effects commercially?`,
      a: `Yes. A commercial licence for ${cat} sound effects — ads, client work, monetized videos, games and apps for a business of any size — is included with the Max plan. The Pro plan covers personal projects and small teams.`,
    },
    {
      q: `How do I download a ${Cat} sound effect?`,
      a: `Preview the ${cat} sound you want, then click download to get the studio-quality WAV. WAV downloads are included on the Pro and Max plans; on the Free plan you can listen to every ${cat} sound effect right here before you upgrade.`,
    },
  ];
};

/** The FAQPage schema.org object for a category's four Q&A (for JSON-LD). */
export const sfxFaqJsonLd = (title: string) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: buildSfxFaq(title).map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});
