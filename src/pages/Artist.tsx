import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Download, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrackRowList, TrackRowSkeletonList } from "@/components/TrackRowPlayer";
import WaveformPreview from "@/components/WaveformPreview";
import { usePlayer } from "@/components/playerContext";
import { useTracks } from "@/hooks/useTracks";
import { interleaveByComposerRecency } from "@/lib/catalogSort";
import { useComposers, useContentReady } from "@/hooks/useContent";
import type { CatalogTrack } from "@/data/catalogTracks";

/**
 * Public composer page: /artist/<slug>. The nick (composers.display_name) and
 * the "about" text (composers.bio) come from Admin -> Users; the track list is
 * every live catalog track whose artist is this composer — clicking "by <nick>"
 * under any track title lands here. SFX composers (e.g. GarnaVutka) get a
 * "Sound effects" list the same way: /api/sfx?artist=<slug>, paged.
 */

interface ArtistSound {
  id: string;
  name: string;
  duration: string;
  previewSrc: string;
  tags: string[];
  artist: string | null;
}

/** Same adapter the Sound Effects page uses: a sound rides the global player
 *  as an isSfx-tagged track (prefixed id, single "full" version). */
const sfxTrackId = (id: string) => `sfx:${id}`;
const soundToTrack = (s: ArtistSound): CatalogTrack => ({
  id: sfxTrackId(s.id),
  slug: s.id,
  title: s.name,
  artist: s.artist || "TV Music Store",
  category: "production",
  genre: "",
  mood: "",
  useCase: "",
  styleOf: "",
  bpm: 0,
  duration: s.duration || "",
  priceFrom: 0,
  description: "",
  tags: s.tags,
  collectionIds: [],
  audioVersions: [{ id: "full", label: "SFX", src: s.previewSrc, duration: s.duration || "" }],
  isSfx: true,
});

const Artist = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const composers = useComposers();
  const ready = useContentReady();
  const { tracks, isLoading } = useTracks();
  const player = usePlayer();

  // ---- the composer's sound effects (paged; hidden when there are none) ----
  const [sounds, setSounds] = useState<ArtistSound[]>([]);
  const [soundTotal, setSoundTotal] = useState(0);
  const [soundPage, setSoundPage] = useState(1);
  const [soundPages, setSoundPages] = useState(1);
  const [soundsBusy, setSoundsBusy] = useState(false);
  const [dlBusyId, setDlBusyId] = useState<string | null>(null);

  const loadSounds = useCallback(
    async (page: number, append: boolean) => {
      if (!slug) return;
      setSoundsBusy(true);
      try {
        const res = await fetch(`/api/sfx?artist=${encodeURIComponent(slug)}&page=${page}`);
        const d = (await res.json().catch(() => ({}))) as {
          sounds?: ArtistSound[];
          total?: number;
          pages?: number;
        };
        if (!res.ok) return;
        setSounds((prev) => (append ? [...prev, ...(d.sounds ?? [])] : (d.sounds ?? [])));
        setSoundTotal(d.total ?? 0);
        setSoundPages(d.pages ?? 1);
        setSoundPage(page);
      } catch {
        // network hiccup — the section just stays as it was
      } finally {
        setSoundsBusy(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    setSounds([]);
    setSoundTotal(0);
    setSoundPage(1);
    void loadSounds(1, false);
  }, [loadSounds]);

  const activeSfxId = player.activeTrack?.isSfx ? player.activeTrack.id : null;
  const isActiveSound = (s: ArtistSound) => activeSfxId === sfxTrackId(s.id);

  const playSound = (s: ArtistSound, seekTo?: number) => {
    if (!s.previewSrc) return;
    const track = soundToTrack(s);
    player.playVersion(track, track.audioVersions[0], seekTo ?? null, sounds.map(soundToTrack));
  };

  // Same download flow as the Sound Effects page: WAV via /api/sfx-download,
  // sign-in and plan gates surface as toasts.
  const downloadSound = async (s: ArtistSound) => {
    setDlBusyId(s.id);
    try {
      const res = await fetch("/api/sfx-download", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: s.id }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${s.name}.wav`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast.success("Download started", { description: s.name });
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.status === 401 || d.code === "auth") {
        window.dispatchEvent(new Event("tvms:open-auth"));
        toast("Sign in to download sound effects");
        return;
      }
      if (d.code === "plan") {
        toast.error("Sound effects come with Pro", {
          description: d.error,
          action: { label: "See plans", onClick: () => navigate("/pricing") },
        });
        return;
      }
      toast.error(d.error ?? "Download failed");
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setDlBusyId(null);
    }
  };

  const composer = composers.find((c) => c.slug === slug);
  // Newest → oldest by this composer's import_no (bigger = newer); tracks with no
  // index fall to the bottom by upload date. The list used to render in raw API
  // order, which looked random (e.g. #7 above #345). One composer here, so the
  // chess-board interleave collapses to a plain newest-first sort.
  const artistTracks = interleaveByComposerRecency(tracks.filter((t) => t.artistSlug === slug));

  if (!ready) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
          <div className="h-9 w-64 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded bg-white/[0.04]" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!composer) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
          <h1 className="text-2xl text-foreground">Artist not found</h1>
          <Link to="/" className="mt-4 font-body text-sm text-[#F4C430] hover:underline">
            Back to home
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  // An SFX-only composer shouldn't open with an empty "No published tracks yet."
  // box — the Tracks section hides when there are sounds but no tracks.
  const showTracksSection = artistTracks.length > 0 || isLoading || soundTotal === 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-24 sm:px-6 md:pt-28">
        {/* Nick + about text only — no avatar, no stats (owner request). */}
        <header className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {composer.displayName}
          </h1>
          {composer.bio && (
            <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
              {composer.bio}
            </p>
          )}
        </header>

        {showTracksSection && (
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-foreground md:text-2xl">Tracks</h2>
            <Link
              to="/catalog"
              className="inline-flex items-center gap-1 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
            >
              Open full catalog <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <TrackRowSkeletonList count={6} />
            ) : artistTracks.length > 0 ? (
              <TrackRowList tracks={artistTracks} />
            ) : (
              <p className="rounded-lg border border-border/40 bg-card/25 p-8 text-center font-body text-sm text-muted-foreground">
                No published tracks yet.
              </p>
            )}
          </div>
        </section>
        )}

        {/* ---- Sound effects by this composer (hidden when none) ---- */}
        {soundTotal > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-foreground md:text-2xl">
                Sound effects
              </h2>
              <Link
                to="/sound-effects"
                className="inline-flex items-center gap-1 font-body text-sm text-muted-foreground transition-colors hover:text-[#F4C430]"
              >
                Open SFX library <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-border/60">
              {sounds.map((s) => {
                const active = isActiveSound(s);
                const playing = active && player.isPlaying;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0 hover:bg-secondary/20"
                  >
                    <button
                      type="button"
                      onClick={() => playSound(s)}
                      aria-label={playing ? `Pause ${s.name}` : `Play ${s.name}`}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        playing
                          ? "border-[#F4C430]/70 text-[#F4C430]"
                          : "border-border text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                      }`}
                    >
                      {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                    </button>
                    <span
                      className={`w-36 shrink-0 truncate font-body text-sm sm:w-56 ${
                        playing ? "text-[#F4C430]" : "text-foreground"
                      }`}
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    <WaveformPreview
                      active={playing}
                      durationRatio={1}
                      onSeek={(p) => playSound(s, p)}
                      progress={active ? player.progress : 0}
                      src={s.previewSrc}
                      className="hidden h-9 min-w-0 flex-1 md:block"
                    />
                    <span className="ml-auto shrink-0 font-body text-xs tabular-nums text-muted-foreground md:ml-0">
                      {s.duration}
                    </span>
                    <button
                      type="button"
                      disabled={dlBusyId === s.id}
                      onClick={() => void downloadSound(s)}
                      title="Download WAV (Pro and up)"
                      aria-label={`Download ${s.name}`}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430] disabled:opacity-50"
                    >
                      {dlBusyId === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            {soundPage < soundPages && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  disabled={soundsBusy}
                  onClick={() => void loadSounds(soundPage + 1, true)}
                  className="rounded-lg border border-border px-4 py-2 font-body text-sm text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-50"
                >
                  {soundsBusy ? "Loading…" : `Show more (${soundTotal - sounds.length} left)`}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Held back until the tracks are in: the plaque used to pop in above a
            skeleton list and then get pushed down when the rows arrived. */}
        {!isLoading && (
        <section className="mt-14 animate-fade-in rounded-xl border border-border bg-card p-6 md:flex md:items-center md:justify-between md:p-8">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              License {composer.displayName}'s music
            </h2>
            <p className="mt-2 max-w-lg font-body text-sm text-muted-foreground">
              Every track is covered by our plans — start free with 3 downloads a month. Need
              something written just for your project?
            </p>
          </div>
          <div className="mt-4 flex shrink-0 gap-3 md:mt-0">
            <Link
              to="/pricing"
              className="rounded-lg bg-[#F4C430] px-5 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
            >
              See plans
            </Link>
            <Link
              to="/custom"
              className="rounded-lg border border-[#F4C430]/70 px-5 py-2.5 font-body text-sm font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background"
            >
              Custom music
            </Link>
          </div>
        </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Artist;
