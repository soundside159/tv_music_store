import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, FileText, Pause, Play, Plus, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { catalogTracks, categoryLabels } from "@/data/catalogTracks";
import type { TrackVersion } from "@/data/catalogTracks";

const versionLabels: Record<TrackVersion, string> = {
  full: "Full Track",
  "60s": "60 sec",
  "30s": "30 sec",
  "15s": "15 sec",
  loop: "Loop",
  stems: "Stems",
};

const licenseTiers = [
  {
    name: "Online",
    price: 39,
    summary: "Web, social, YouTube, podcasts, and one online project.",
    features: ["WAV + MP3", "All available edits", "1 project", "License PDF"],
  },
  {
    name: "Commercial",
    price: 99,
    summary: "Client work, corporate videos, paid digital ads, and brand content.",
    features: ["Everything in Online", "Client projects", "Digital ads", "Priority claim help"],
  },
  {
    name: "Broadcast",
    price: 299,
    summary: "TV, film, streaming, trailers, games, and broadcast campaigns.",
    features: ["Everything in Commercial", "Broadcast usage", "Stems included when available", "Premium support"],
  },
];

const TrackDetail = () => {
  const { slug } = useParams();
  const track = catalogTracks.find((item) => item.slug === slug);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<TrackVersion>(track?.versions[0] ?? "full");

  const similarTracks = useMemo(() => {
    if (!track) return [];

    return catalogTracks
      .filter((item) => item.id !== track.id && (item.category === track.category || item.mood === track.mood))
      .slice(0, 3);
  }, [track]);

  if (!track) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
          <Sparkles className="mb-4 h-8 w-8 text-primary" />
          <h1 className="font-display text-3xl text-foreground">Track not found</h1>
          <p className="mt-3 font-body text-sm text-muted-foreground">
            This catalog page is still backed by mock data. The live D1 catalog will handle unpublished and missing
            tracks later.
          </p>
          <Link
            to="/catalog"
            className="mt-6 border border-primary/60 px-6 py-3 font-body text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Back to catalog
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navigation />

      <main className="pt-24 md:pt-28">
        <section className="border-b border-border/50 bg-card/25">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to catalog
            </Link>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <div>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Tag>{categoryLabels[track.category]}</Tag>
                  <Tag>{track.mood}</Tag>
                  {track.hasStems && <Tag>Stems available</Tag>}
                  {track.isFree && <Tag>Free tier</Tag>}
                </div>

                <h1 className="font-display text-4xl tracking-wide text-foreground md:text-6xl">{track.title}</h1>
                <p className="mt-4 max-w-3xl font-body text-base leading-7 text-muted-foreground">
                  {track.description}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  <Fact label="Use case" value={track.useCase} />
                  <Fact label="Genre" value={track.genre} />
                  <Fact label="Tempo" value={`${track.bpm} BPM`} />
                  <Fact label="Length" value={track.duration} />
                </div>
              </div>

              <div className="border border-border/50 bg-card/70 p-5">
                <p className="font-body text-xs uppercase tracking-[0.24em] text-primary">License from</p>
                <div className="mt-2 font-display text-5xl text-foreground">${track.priceFrom}</div>
                <p className="mt-3 font-body text-sm leading-6 text-muted-foreground">
                  Guest checkout, license PDF, and private downloads will be connected through Stripe, D1, R2, and
                  Resend in the backend phase.
                </p>
                <Button className="mt-5 h-11 w-full rounded-none gap-2">
                  <Plus className="h-4 w-4" />
                  Add license
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
          <div className="space-y-6">
            <section className="border border-border/50 bg-card/60 p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-foreground">Preview versions</h2>
                  <p className="mt-1 font-body text-sm text-muted-foreground">Switch edit lengths before licensing.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPlaying((current) => !current)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  aria-label={isPlaying ? "Pause preview" : "Play preview"}
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                </button>
              </div>

              <div className="mb-5 flex h-20 items-end gap-1 overflow-hidden border border-border/40 bg-background/50 p-3">
                {Array.from({ length: 90 }).map((_, index) => (
                  <span
                    key={index}
                    className={`w-full min-w-1 bg-primary/55 ${isPlaying ? "opacity-100" : "opacity-40"}`}
                    style={{ height: `${20 + ((index * 19 + track.bpm) % 68)}%` }}
                  />
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {track.versions.map((version) => (
                  <button
                    key={version}
                    type="button"
                    onClick={() => setSelectedVersion(version)}
                    className={`h-10 border px-4 font-body text-sm transition-colors ${
                      selectedVersion === version
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-background/50 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                    }`}
                  >
                    {versionLabels[version]}
                  </button>
                ))}
              </div>
            </section>

            <section className="border border-border/50 bg-card/60 p-5">
              <h2 className="font-display text-2xl text-foreground">Scene fit</h2>
              <p className="mt-3 font-body text-sm leading-6 text-muted-foreground">
                Built for {track.useCase.toLowerCase()} work with a {track.mood.toLowerCase()} emotional profile and a{" "}
                {track.styleOf.toLowerCase()} reference direction. Detailed SEO copy, MusicRecording schema, and
                similar-track logic will move to D1-backed content later.
              </p>
            </section>

            <section className="border border-border/50 bg-card/60 p-5">
              <h2 className="font-display text-2xl text-foreground">License options</h2>
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {licenseTiers.map((tier) => (
                  <article key={tier.name} className="border border-border/50 bg-background/45 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-lg text-foreground">{tier.name}</h3>
                      <span className="font-body text-sm text-primary">${tier.price}</span>
                    </div>
                    <p className="mt-2 min-h-16 font-body text-xs leading-5 text-muted-foreground">{tier.summary}</p>
                    <ul className="mt-4 space-y-2">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex gap-2 font-body text-xs text-muted-foreground">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="border border-border/50 bg-card/60 p-5">
              <h2 className="font-display text-xl text-foreground">Trust flow</h2>
              <div className="mt-4 space-y-4">
                <TrustItem icon={ShieldCheck} title="Content ID support" text="Claim removal queue comes in /admin." />
                <TrustItem icon={Clock} title="24h SLA" text="Customer sends video URL after purchase." />
                <TrustItem icon={FileText} title="License PDF" text="Generated after Stripe webhook confirmation." />
              </div>
            </section>

            <section className="border border-border/50 bg-card/60 p-5">
              <h2 className="font-display text-xl text-foreground">Similar tracks</h2>
              <div className="mt-4 space-y-3">
                {similarTracks.map((item) => (
                  <Link
                    key={item.id}
                    to={`/track/${item.slug}`}
                    className="block border border-border/50 bg-background/45 p-3 transition-colors hover:border-primary/60"
                  >
                    <div className="font-body text-sm text-foreground">{item.title}</div>
                    <div className="mt-1 font-body text-xs text-muted-foreground">
                      {item.mood} / {item.duration} / from ${item.priceFrom}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
};

const Tag = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-7 items-center border border-primary/40 bg-primary/10 px-2.5 font-body text-[0.68rem] uppercase tracking-widest text-primary">
    <Star className="mr-1 h-3 w-3" />
    {children}
  </span>
);

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="border border-border/50 bg-background/45 p-4">
    <div className="font-body text-[0.65rem] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="mt-2 font-body text-sm text-foreground">{value}</div>
  </div>
);

const TrustItem = ({
  icon: Icon,
  title,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) => (
  <div className="flex gap-3">
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
    <div>
      <div className="font-body text-sm text-foreground">{title}</div>
      <div className="mt-1 font-body text-xs leading-5 text-muted-foreground">{text}</div>
    </div>
  </div>
);

export default TrackDetail;
