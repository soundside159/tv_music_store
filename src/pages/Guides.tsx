import { Link, useParams } from "react-router-dom";
import { ArrowRight, Home } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useSeo } from "@/hooks/useSeo";
import { useContentReady } from "@/hooks/useContent";
import { guideBySlug, publishedGuides, type Guide } from "@/content/guides";

// /guides — the answer library. Structured for how AI answer engines (ChatGPT,
// Perplexity, Gemini, Google AI Overviews) actually quote a page: the answer
// FIRST (the TL;DR box), then the substance, then an explicit Q&A block that we
// also emit as FAQPage schema. Classic search rewards exactly the same shape.
// Content lives in src/content/guides.ts — pure data, also used by the edge
// prerender so JS-less crawlers get the full article.

const SITE = "https://tvmusicstore.com";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const GuidesIndex = () => {
  // Waiting for /api/content means the owner's own dates (Admin -> Articles)
  // are applied before we decide what is released — otherwise the page would
  // render the schedule baked into the bundle and then flicker.
  const ready = useContentReady();
  const guides = ready ? publishedGuides() : [];

  useSeo({
    title: "Music Licensing Guides — YouTube, Ads, Film & Sync | TV Music Store",
    description:
      "Straight answers about licensing music: YouTube and Content ID, client work, ads, documentaries, sync and cue sheets, and what royalty-free actually means.",
    path: "/guides",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Music licensing guides",
      itemListElement: guides.map((guide, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/guides/${guide.slug}`,
        name: guide.h1,
      })),
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-24 sm:px-6 md:pt-28">
        <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
          Guides
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Music licensing, answered
        </h1>
        <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-white/55">
          The questions creators, editors and producers actually ask — answered in plain language
          by the people who write and license the music.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Placeholder cards of the same size while the schedule loads — the
              page never grows or shrinks under the reader. */}
          {!ready &&
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[13.5rem] animate-pulse rounded-xl border border-border/40 bg-card/30"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              to={`/guides/${guide.slug}`}
              className="group flex flex-col rounded-xl border border-border/60 bg-card/40 p-6 transition-colors hover:border-[#F4C430]/60"
            >
              <h2 className="font-display text-lg font-semibold leading-snug text-white transition-colors group-hover:text-[#F4C430]">
                {guide.h1}
              </h2>
              <p className="mt-3 flex-1 font-body text-sm leading-6 text-muted-foreground">
                {guide.description}
              </p>
              <span className="mt-4 font-body text-xs text-muted-foreground/70">
                {guide.readMinutes} min read · Updated {formatDate(guide.updated)}
              </span>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

const GuideArticle = ({ guide }: { guide: Guide }) => {
  useSeo({
    title: `${guide.title} | TV Music Store`,
    description: guide.description,
    path: `/guides/${guide.slug}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          headline: guide.h1,
          description: guide.description,
          articleBody: guide.tldr,
          datePublished: guide.updated,
          dateModified: guide.updated,
          author: { "@type": "Organization", name: "TV Music Store" },
          publisher: { "@type": "Organization", name: "TV Music Store" },
          mainEntityOfPage: `${SITE}/guides/${guide.slug}`,
        },
        {
          "@type": "FAQPage",
          mainEntity: guide.faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        },
      ],
    },
  });

  // A related guide that has not been released yet is simply not linked.
  const related = (guide.related ?? [])
    .map((slug) => guideBySlug(slug))
    .filter((g): g is Guide => !!g);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-24 sm:px-6 md:pt-28">
        <nav className="flex items-center gap-2 font-body text-xs text-muted-foreground">
          <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-[#F4C430]">
            <Home className="h-3.5 w-3.5" /> Home
          </Link>
          <span>/</span>
          <Link to="/guides" className="transition-colors hover:text-[#F4C430]">
            Guides
          </Link>
        </nav>

        <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
          {guide.h1}
        </h1>
        <p className="mt-3 font-body text-xs text-muted-foreground">
          {guide.readMinutes} min read · Updated {formatDate(guide.updated)} · TV Music Store
        </p>

        {/* The front-loaded answer — the paragraph an AI engine lifts. */}
        <div className="mt-6 rounded-xl border border-[#F4C430]/30 bg-[#F4C430]/[0.06] p-5">
          <p className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-[#F4C430]">
            Short answer
          </p>
          <p className="mt-2 font-body text-sm leading-7 text-foreground">{guide.tldr}</p>
        </div>

        <article className="mt-10">
          {guide.sections.map((section) => (
            <section key={section.heading} className="mt-9 first:mt-0">
              <h2 className="font-display text-xl font-semibold text-white">{section.heading}</h2>
              {section.paragraphs?.map((text) => (
                <p key={text} className="mt-3 font-body text-sm leading-7 text-muted-foreground">
                  {text}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-3 space-y-2">
                  {section.bullets.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 font-body text-sm leading-7 text-muted-foreground"
                    >
                      <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-[#F4C430]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {section.table && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-border/60">
                  <table className="w-full border-collapse font-body text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-card/60">
                        {section.table.headers.map((header) => (
                          <th
                            key={header}
                            className="px-4 py-2.5 text-left font-semibold text-foreground"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row.join("|")} className="border-b border-border/40 last:border-b-0">
                          {row.map((cell, i) => (
                            <td
                              key={cell + i}
                              className={`px-4 py-2.5 align-top ${
                                i === 0 ? "font-medium text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </article>

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold text-white">Frequently asked</h2>
          <div className="mt-4 divide-y divide-border/40 rounded-xl border border-border/60">
            {guide.faq.map((item) => (
              <div key={item.q} className="p-5">
                <h3 className="font-body text-sm font-semibold text-foreground">{item.q}</h3>
                <p className="mt-2 font-body text-sm leading-7 text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-8 font-body text-xs leading-6 text-muted-foreground/70">
          This guide is general information about how music licensing works, not legal advice. The
          terms that apply to your purchase are the ones on our{" "}
          <Link to="/license-terms" className="text-[#F4C430] hover:underline">
            license terms
          </Link>{" "}
          page.
        </p>

        <div className="mt-10 rounded-xl border border-border bg-card p-6 md:flex md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Need the music itself?
            </h2>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Cinematic, trailer and production music — licensed for YouTube, ads, film and games.
            </p>
          </div>
          <div className="mt-4 flex shrink-0 gap-3 md:mt-0">
            <Link
              to="/catalog"
              className="rounded-lg bg-[#F4C430] px-5 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
            >
              Browse the library
            </Link>
            <Link
              to="/pricing"
              className="rounded-lg border border-[#F4C430]/70 px-5 py-2.5 font-body text-sm font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background"
            >
              See plans
            </Link>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold text-white">Related guides</h2>
            <ul className="mt-4 space-y-2">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    to={`/guides/${item.slug}`}
                    className="inline-flex items-center gap-1.5 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
                  >
                    {item.h1} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

/** Same skeleton shape as the article — no jump when the real one renders. */
const GuideSkeleton = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-24 sm:px-6 md:pt-28">
      <div className="h-3 w-40 animate-pulse rounded bg-white/[0.05]" />
      <div className="mt-5 h-9 w-3/4 animate-pulse rounded bg-white/[0.06]" />
      <div className="mt-3 h-3 w-56 animate-pulse rounded bg-white/[0.04]" />
      <div className="mt-6 h-28 animate-pulse rounded-xl border border-[#F4C430]/20 bg-[#F4C430]/[0.04]" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-white/[0.04]"
            style={{ animationDelay: `${i * 80}ms`, width: `${90 - (i % 3) * 12}%` }}
          />
        ))}
      </div>
    </main>
    <Footer />
  </div>
);

const NotFoundGuide = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
      <h1 className="text-2xl text-foreground">Guide not found</h1>
      <Link to="/guides" className="mt-4 font-body text-sm text-[#F4C430] hover:underline">
        All guides
      </Link>
    </main>
    <Footer />
  </div>
);

const Guides = () => {
  const { slug } = useParams();
  // The owner's dates arrive with /api/content; decide only once they are in,
  // otherwise a scheduled-then-moved article could flash "not found".
  const ready = useContentReady();
  if (!slug) return <GuidesIndex />;
  if (!ready) return <GuideSkeleton />;
  const guide = guideBySlug(slug);
  if (!guide) return <NotFoundGuide />;
  return <GuideArticle guide={guide} />;
};

export default Guides;
