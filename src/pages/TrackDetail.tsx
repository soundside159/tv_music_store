import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, FileText, Pause, Play, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import { Button } from "@/components/ui/button";
import { catalogTracks, categoryLabels } from "@/data/catalogTracks";
import type { TrackVersion } from "@/data/catalogTracks";

const versionLabels: Record<TrackVersion, string> = {
  full: "Full track",
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
    summary: "YouTube, social, podcasts, and one online project.",
    features: ["WAV + MP3", "All edits", "License PDF"],
  },
  {
    name: "Commercial",
    price: 99,
    summary: "Client work, brand videos, and paid digital ads.",
    features: ["Client projects", "Digital ads", "Claim help"],
  },
  {
    name: "Broadcast",
    price: 299,
    summary: "TV, film, streaming, trailers, games, and campaigns.",
    features: ["Broadcast use", "Premium support", "Priority delivery"],
  },
];

const TrackDetail = () => {
  const { slug } = useParams();
  const track = catalogTracks.find((item) => item.slug === slug);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<TrackVersion>("full");

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
          <p className="mt-3 font-body text-sm text-muted-foreground">This track is not in the current catalog.</p>
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

  const previewVersions = track.versions.filter((version) => version !== "stems");
  const activeVersion = previewVersions.includes(selectedVersion) ? selectedVersion : previewVersions[0] ?? "full";

  return (
    <div className="min-h-screen bg-background pb-16">
      <Navigation />

      <main className="pt-24 md:pt-28">
        <section className="border-b border-border/45">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to catalog
            </Link>

            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
              <div>
                <p className="mb-2 font-body text-xs uppercase tracking-[0.28em] text-primary">
                  {categoryLabels[track.category]}
                </p>
                <h1 className="font-display text-4xl tracking-wide text-foreground md:text-6xl">{track.title}</h1>
                <p className="mt-4 max-w-3xl font-body text-sm leading-6 text-muted-foreground md:text-base">
                  {track.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-body text-sm text-muted-foreground">
                  <span>{track.genre}</span>
                  <span>/</span>
                  <span>{track.mood}</span>
                  <span>/</span>
                  <span>{track.useCase}</span>
                  <span>/</span>
                  <span>{track.duration}</span>
                  <span>/</span>
                  <span>{track.bpm} BPM</span>
                </div>
              </div>

              <div className="border-t border-border/45 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div className="font-body text-xs uppercase tracking-[0.24em] text-muted-foreground">License from</div>
                <div className="mt-2 font-display text-4xl text-foreground">${track.priceFrom}</div>
                <Button className="mt-4 h-11 w-full rounded-none gap-2">
                  <Plus className="h-4 w-4" />
                  License track
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="border-y border-border/45 py-5">
            <div className="grid gap-4 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:items-center">
              <button
                type="button"
                onClick={() => setIsPlaying((current) => !current)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-label={isPlaying ? "Pause preview" : "Play preview"}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>

              <WaveformPreview active={isPlaying} seed={track.bpm} bars={140} className="h-20" />

              <div className="font-body text-sm text-muted-foreground md:text-right">
                <div>{track.duration}</div>
                <div>{track.bpm} BPM</div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="space-y-8">
              <section>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-display text-2xl text-foreground">Versions</h2>
                  <span className="font-body text-sm text-muted-foreground">{versionLabels[activeVersion]}</span>
                </div>

                <div className="border-y border-border/45">
                  {previewVersions.map((version, index) => {
                    const active = activeVersion === version;

                    return (
                      <button
                        key={version}
                        type="button"
                        onClick={() => setSelectedVersion(version)}
                        className="grid w-full gap-3 border-b border-border/45 py-4 text-left last:border-b-0 md:grid-cols-[7rem_minmax(0,1fr)] md:items-center"
                      >
                        <span className={`font-body text-sm ${active ? "text-primary" : "text-foreground"}`}>
                          {versionLabels[version]}
                        </span>
                        <WaveformPreview active={active && isPlaying} seed={track.bpm + index} bars={90} className="h-9" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h2 className="font-display text-2xl text-foreground">Similar tracks</h2>
                <div className="mt-4 border-y border-border/45">
                  {similarTracks.map((item) => (
                    <Link
                      key={item.id}
                      to={`/track/${item.slug}`}
                      className="grid gap-2 border-b border-border/45 py-4 transition-colors last:border-b-0 hover:text-primary md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    >
                      <div>
                        <div className="font-body text-sm text-foreground">{item.title}</div>
                        <div className="mt-1 font-body text-xs text-muted-foreground">
                          {item.mood} / {item.duration} / {item.bpm} BPM
                        </div>
                      </div>
                      <div className="font-body text-sm text-muted-foreground">from ${item.priceFrom}</div>
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-8">
              <section>
                <h2 className="font-display text-2xl text-foreground">Licenses</h2>
                <div className="mt-4 border-y border-border/45">
                  {licenseTiers.map((tier) => (
                    <article key={tier.name} className="border-b border-border/45 py-4 last:border-b-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-body text-sm text-foreground">{tier.name}</h3>
                          <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">{tier.summary}</p>
                        </div>
                        <span className="font-body text-sm text-primary">${tier.price}</span>
                      </div>
                      <ul className="mt-3 space-y-1.5">
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

              <section>
                <h2 className="font-display text-2xl text-foreground">Delivery</h2>
                <div className="mt-4 space-y-4 border-y border-border/45 py-4">
                  <DeliveryItem icon={FileText} title="License PDF" text="Created after payment confirmation." />
                  <DeliveryItem icon={ShieldCheck} title="Claim help" text="Content ID support for paid licenses." />
                  <DeliveryItem icon={Clock} title="Fast support" text="Claim removal target: 24 hours." />
                </div>
              </section>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
};

const DeliveryItem = ({
  icon: Icon,
  text,
  title,
}: {
  icon: typeof FileText;
  text: string;
  title: string;
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
