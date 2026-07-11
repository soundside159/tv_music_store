import { Link, useParams } from "react-router-dom";
import { ArrowRight, Home } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList } from "@/components/TrackRowPlayer";
import { useTracks } from "@/hooks/useTracks";
import { useVocabularies } from "@/hooks/useContent";
import { useSeo } from "@/hooks/useSeo";
import {
  DISCOVER_GROUPS,
  discoverPath,
  facetValuesInCatalog,
  isDiscoverGroup,
  relatedTracks,
  tagSlug,
  tracksWithTag,
  type DiscoverGroup,
  type TagFacet,
} from "@/lib/discovery";

// SEO landing pages for the tag system (tunetank-style):
//   /discover/moods/happy · /discover/genres/action · /discover/themes/advertising
// Each one is a real, indexable URL with its own <title>, description, H1 and
// internal links — unlike /catalog?mood=Happy, which search engines largely
// ignore. Every tag pill under a track points here; the catalog query params
// keep working for the in-app filter sidebar.

const GROUP_LABEL: Record<DiscoverGroup, string> = {
  moods: "Mood",
  genres: "Genre",
  themes: "Use case",
};

const GROUP_BLURB: Record<DiscoverGroup, string> = {
  moods: "Browse the catalogue by the feeling a track leaves behind.",
  genres: "Browse the catalogue by musical style.",
  themes: "Browse the catalogue by what the music is made for.",
};

const RELATED_LIMIT = 24;

/** /discover — the hub: every mood, genre and use case, all crawlable links. */
const DiscoverIndex = () => {
  const { tracks } = useTracks();
  const vocab = useVocabularies();

  useSeo({
    title: "Discover Royalty-Free Music by Mood, Genre & Use Case | TV Music Store",
    description:
      "Browse the TV Music Store catalogue by mood, genre and use case — cinematic, trailer, corporate, documentary and game music, licensed for YouTube, ads, film and social.",
    path: "/discover",
  });

  const groups = (Object.keys(DISCOVER_GROUPS) as DiscoverGroup[]).map((group) => {
    const facet = DISCOVER_GROUPS[group] as TagFacet;
    // Admin vocabulary first, plus anything already on a track.
    const fromVocab = vocab[facet] ?? [];
    const fromTracks = facetValuesInCatalog(tracks, facet);
    const seen = new Set<string>();
    const values = [...fromVocab, ...fromTracks].filter((value) => {
      const key = tagSlug(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { group, facet, values };
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-24 sm:px-6 md:pt-28">
        <p className="font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#F4C430]/90">
          Discover
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Browse by mood, genre and use case
        </h1>
        <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-white/55">
          Every tag in the library, one click away. Pick the feeling, the style or the job the
          music has to do.
        </p>

        {groups.map(({ group, values }) => (
          <section key={group} className="mt-12">
            <h2 className="font-display text-2xl font-semibold text-white">
              {GROUP_LABEL[group]}
            </h2>
            <p className="mt-1 font-body text-sm text-white/50">{GROUP_BLURB[group]}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {values.map((value) => (
                <Link
                  key={value}
                  to={`/discover/${group}/${tagSlug(value)}`}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-body text-sm text-muted-foreground transition-colors hover:border-[#F4C430]/60 hover:text-[#F4C430]"
                >
                  {value}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
};

/** /discover/<group>/<tag> — one indexable page per tag. */
const DiscoverTag = ({ group, slug }: { group: DiscoverGroup; slug: string }) => {
  const facet = DISCOVER_GROUPS[group] as TagFacet;
  const { tracks, isLoading } = useTracks();
  const vocab = useVocabularies();

  // The pretty label: prefer the admin vocabulary spelling, fall back to the
  // spelling used on the tracks, finally to the slug itself.
  const label =
    (vocab[facet] ?? []).find((value) => tagSlug(value) === slug) ??
    facetValuesInCatalog(tracks, facet).find((value) => tagSlug(value) === slug) ??
    slug.replace(/-/g, " ");

  const exact = tracksWithTag(tracks, facet, slug);
  const related = relatedTracks(exact, tracks, RELATED_LIMIT);

  const title = `${label} Music — Royalty-Free ${label} Tracks | TV Music Store`;
  const description = `Download royalty-free ${label.toLowerCase()} music for video, ads, film, games and social. ${
    exact.length > 0 ? `${exact.length} ${label.toLowerCase()} track${exact.length === 1 ? "" : "s"} — ` : ""
  }MP3, WAV and stems, cleared for YouTube and commercial use.`;

  useSeo({
    title,
    description,
    path: `/discover/${group}/${slug}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${label} Music`,
      description,
      url: `https://tvmusicstore.com/discover/${group}/${slug}`,
    },
  });

  // Sibling tags of the same family — internal links Google follows.
  const siblings = [
    ...(vocab[facet] ?? []),
    ...facetValuesInCatalog(tracks, facet),
  ].filter((value, i, all) => tagSlug(value) !== slug && all.findIndex((v) => tagSlug(v) === tagSlug(value)) === i);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-24 sm:px-6 md:pt-28">
        <nav className="flex items-center gap-2 font-body text-xs text-muted-foreground">
          <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-[#F4C430]">
            <Home className="h-3.5 w-3.5" /> Home
          </Link>
          <span>/</span>
          <Link to="/discover" className="transition-colors hover:text-[#F4C430]">
            Discover
          </Link>
          <span>/</span>
          <span className="text-foreground">{label}</span>
        </nav>

        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {label} <span className="text-[#F4C430]">Music</span>
        </h1>
        <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-white/55">
          Royalty-free {label.toLowerCase()} tracks for video, advertising, film, games and social
          media — cleared for YouTube and commercial use, in MP3, WAV and stems.
        </p>

        <div className="mt-8">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
              ))}
            </div>
          ) : exact.length > 0 ? (
            <TrackRowList tracks={exact} />
          ) : (
            <p className="rounded-lg border border-border/40 bg-card/25 p-8 text-center font-body text-sm text-muted-foreground">
              No {label.toLowerCase()} tracks yet — browse the{" "}
              <Link to="/catalog" className="text-[#F4C430] hover:underline">
                full catalogue
              </Link>
              .
            </p>
          )}
        </div>

        {/* The funnel: tracks that share what the exact matches have in common. */}
        {!isLoading && related.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-center gap-3">
              <span className="font-body text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                Related
              </span>
              <span className="h-px flex-1 bg-border/40" />
            </div>
            <TrackRowList tracks={related} />
          </section>
        )}

        {siblings.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold text-white">
              More {GROUP_LABEL[group].toLowerCase()}s
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {siblings.map((value) => (
                <Link
                  key={value}
                  to={discoverPath(facet, value)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-body text-sm text-muted-foreground transition-colors hover:border-[#F4C430]/60 hover:text-[#F4C430]"
                >
                  {value}
                </Link>
              ))}
            </div>
            <Link
              to="/catalog"
              className="mt-6 inline-flex items-center gap-1 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
            >
              Open the full catalogue <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

const Discover = () => {
  const { group, tag } = useParams();
  if (!group || !tag) return <DiscoverIndex />;
  if (!isDiscoverGroup(group)) return <DiscoverIndex />;
  return <DiscoverTag group={group} slug={tag.toLowerCase()} />;
};

export default Discover;
