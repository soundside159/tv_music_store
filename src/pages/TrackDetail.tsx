import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Pause, Play, Plus, Sparkles } from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import { Button } from "@/components/ui/button";
import { catalogTracks, categoryLabels } from "@/data/catalogTracks";
import type { TrackAudioVersion } from "@/data/catalogTracks";

const licenseTiers = [
  {
    name: "Online",
    price: 39,
    summary: "YouTube, social, podcasts, and one online project.",
    features: ["MP3 preview now", "WAV delivery later", "License PDF later"],
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
  const [selectedVersion, setSelectedVersion] = useState<TrackAudioVersion | null>(track?.audioVersions[0] ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlayRef = useRef(false);

  const similarTracks = useMemo(() => {
    if (!track) return [];

    return catalogTracks.filter((item) => item.id !== track.id).slice(0, 3);
  }, [track]);

  useEffect(() => {
    if (!track) return;
    setSelectedVersion(track.audioVersions[0]);
    setProgress(0);
    setIsPlaying(false);
  }, [track]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !selectedVersion?.src) return;

    audio.load();

    if (!pendingPlayRef.current) return;
    pendingPlayRef.current = false;

    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [selectedVersion?.src]);

  if (!track) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
          <Sparkles className="mb-4 h-8 w-8 text-primary" />
          <h1 className="font-body text-3xl font-semibold text-foreground">Track not found</h1>
          <p className="mt-3 font-body text-sm text-muted-foreground">This track is not in the current catalog.</p>
          <Link
            to="/catalog"
            className="mt-6 rounded-full bg-foreground px-6 py-3 font-body text-sm text-background transition-colors hover:bg-primary"
          >
            Back to catalog
          </Link>
        </main>
      </div>
    );
  }

  const playVersion = (version: TrackAudioVersion) => {
    const audio = audioRef.current;
    const sameVersion = selectedVersion?.id === version.id;

    if (sameVersion && audio) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        return;
      }

      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      return;
    }

    setProgress(0);
    setSelectedVersion(version);

    if (!audio) {
      pendingPlayRef.current = true;
      return;
    }

    pendingPlayRef.current = false;
    audio.src = version.src;
    audio.load();
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  };

  const currentVersion = selectedVersion ?? track.audioVersions[0];

  return (
    <div className="min-h-screen bg-background pb-16">
      <Navigation />
      <audio
        ref={audioRef}
        src={currentVersion?.src}
        preload="metadata"
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
        }}
      />

      <main className="pt-20 md:pt-24">
        <section className="border-b border-border/40">
          <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to library
            </Link>

            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
              <div>
                <p className="mb-3 font-body text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {categoryLabels[track.category]} / {track.artist}
                </p>
                <h1 className="max-w-4xl font-body text-4xl font-semibold tracking-normal text-foreground md:text-6xl">
                  {track.title}
                </h1>
                <p className="mt-4 max-w-2xl font-body text-sm leading-6 text-muted-foreground">
                  {track.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {track.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border/60 px-3 py-1.5 font-body text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-border/40 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground">License from</div>
                <div className="mt-2 font-body text-4xl font-semibold text-foreground">${track.priceFrom}</div>
                <Button className="mt-4 h-11 w-full rounded-full">
                  <Plus className="h-4 w-4" />
                  License track
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid gap-4 border-y border-border/40 py-5 md:grid-cols-[2.75rem_minmax(0,1fr)_auto] md:items-center">
            <button
              type="button"
              onClick={() => playVersion(currentVersion)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-foreground"
              aria-label={isPlaying ? "Pause preview" : "Play preview"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>

            <WaveformPreview active={isPlaying} progress={progress} seed={track.bpm} bars={132} className="h-16" />

            <div className="font-body text-sm text-muted-foreground md:text-right">
              <div>{currentVersion.label}</div>
              <div>
                {track.duration} / {track.bpm} BPM
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="space-y-8">
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-body text-lg font-semibold text-foreground">Versions</h2>
                  <span className="font-body text-sm text-muted-foreground">{track.audioVersions.length} files</span>
                </div>

                <div className="border-y border-border/40">
                  {track.audioVersions.map((version, index) => {
                    const active = currentVersion.id === version.id;

                    return (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => playVersion(version)}
                        className="grid w-full gap-3 border-b border-border/40 py-3 text-left last:border-b-0 md:grid-cols-[1.5rem_minmax(10rem,15rem)_minmax(12rem,1fr)_4rem] md:items-center"
                      >
                        <span className="text-muted-foreground">
                          {active && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </span>
                        <span className={`font-body text-sm ${active ? "text-foreground" : "text-muted-foreground"}`}>
                          {version.label}
                        </span>
                        <WaveformPreview
                          active={active && isPlaying}
                          bars={96}
                          progress={active ? progress : 0}
                          seed={track.bpm + index}
                          className="h-9"
                        />
                        <span className="font-body text-xs text-muted-foreground">{version.duration}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h2 className="font-body text-lg font-semibold text-foreground">Similar tracks</h2>
                <div className="mt-3 border-y border-border/40">
                  {similarTracks.map((item) => (
                    <Link
                      key={item.id}
                      to={`/track/${item.slug}`}
                      className="grid gap-2 border-b border-border/40 py-4 transition-colors last:border-b-0 hover:text-primary md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    >
                      <div>
                        <div className="font-body text-sm font-medium text-foreground">{item.title}</div>
                        <div className="mt-1 font-body text-xs text-muted-foreground">
                          {item.genre} / {item.duration} / {item.bpm} BPM
                        </div>
                      </div>
                      <div className="font-body text-sm text-muted-foreground">from ${item.priceFrom}</div>
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            <aside>
              <h2 className="font-body text-lg font-semibold text-foreground">License options</h2>
              <div className="mt-3 border-y border-border/40">
                {licenseTiers.map((tier) => (
                  <article key={tier.name} className="border-b border-border/40 py-4 last:border-b-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-body text-sm font-medium text-foreground">{tier.name}</h3>
                        <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">{tier.summary}</p>
                      </div>
                      <span className="font-body text-sm text-foreground">${tier.price}</span>
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
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
};

export default TrackDetail;
