import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Check,
  Download,
  Heart,
  Home,
  Music,
  Pause,
  Play,
  Share2,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import WaveformPreview from "@/components/WaveformPreview";
import type { CatalogTrack, TrackAudioVersion, TrackVersion } from "@/data/catalogTracks";
import { useTracks } from "@/hooks/useTracks";
import { useSeo } from "@/hooks/useSeo";
import { useCurrentUser } from "@/hooks/useMockData";
import {
  AdminTrackCollectionsPanel,
  AdminTrackCoverOverlay,
  AdminTrackTagsPanel,
  AdminTrackTopBar,
  useAdminTrackContent,
} from "@/components/AdminTrackPanel";
import { splitFilterValues } from "@/components/TrackRowPlayer";
import { discoverPath, type TagFacet } from "@/lib/discovery";
import { composerRecencyPercentile } from "@/lib/catalogSort";
import { toggleFavourite, useFavourites } from "@/lib/favourites";
import { usePlayer } from "@/components/playerContext";
import { useLicenseTiers, type LicenseTierId } from "@/lib/licenses";
import { addToCart } from "@/hooks/useCart";
import { displayVersionLabel, openDownloadOptions } from "@/lib/downloadTrack";
import { openPlanModal } from "@/lib/billing";

const GOLD = "#F4C430";

type DetailTab = "versions" | "similar";

const TrackDetail = () => {
  const { slug } = useParams();
  const user = useCurrentUser();
  // Admins also load draft tracks (the server ignores ?drafts=1 for everyone
  // else), so bulk-uploaded drafts can be curated on their own track pages.
  const { tracks: catalogTracks, reload: reloadTracks, source, isLoading } = useTracks({
    drafts: user?.role === "admin",
  });
  // Admin-only side panels (tags/trending left, collections/playlists right).
  // Only when the catalog is DB-backed — edits against mock ids would no-op.
  const isAdmin = user?.role === "admin" && source === "api";
  const admin = useAdminTrackContent(isAdmin);
  // Resolve by the leading code (/track/1042-anything) so the text part can
  // change without breaking the link; fall back to an exact slug match.
  const codeParam = slug?.match(/^(\d+)/)?.[1];
  const track =
    catalogTracks.find((item) => item.slug === slug) ??
    (codeParam ? catalogTracks.find((item) => String(item.code) === codeParam) : undefined);
  const [activeTab, setActiveTab] = useState<DetailTab>("versions");
  const [selectedVersions, setSelectedVersions] = useState<Record<string, TrackVersion>>({});
  const [selectedTier, setSelectedTier] = useState<LicenseTierId>("personal");
  // Live tier prices (admin-editable) — re-renders when they hydrate/change.
  const liveTiers = useLicenseTiers();
  const { activePlayer, isPlaying, progress, playVersion: playFromEngine } = usePlayer();
  const favIds = useFavourites();
  const liked = track ? favIds.has(track.id) : false;

  // Similar = tracks sharing this one's genre / mood / use case, ranked by
  // overlap — with a FRESHNESS boost (same recency signal the catalog's
  // Recommended sort uses: import_no percentile within each composer), so
  // among equally-matching tracks the NEWER ones surface first instead of the
  // oldest rows in the table (the owner kept hearing his old stock here).
  const similarTracks = useMemo(() => {
    if (!track) return [];
    const set = (s: string) => new Set(splitFilterValues(s || "").map((x) => x.toLowerCase()));
    const g = set(track.genre);
    const m = set(track.mood);
    const u = set(track.useCase);
    const overlap = (a: Set<string>, s: string) =>
      splitFilterValues(s || "").reduce((n, x) => n + (a.has(x.toLowerCase()) ? 1 : 0), 0);
    const recency = composerRecencyPercentile(catalogTracks); // 0 = oldest … 1 = newest
    const scored = catalogTracks
      .filter((item) => item.id !== track.id)
      .map((item) => ({
        item,
        match: overlap(g, item.genre) * 2 + overlap(m, item.mood) * 2 + overlap(u, item.useCase),
        // Freshness is worth up to 2 points — one facet match. A strong match
        // still beats a fresh weak one, but among peers the newest wins.
        fresh: (recency.get(item.id) ?? 0) * 2,
      }))
      .filter((x) => x.match > 0)
      .sort((a, b) => b.match + b.fresh - (a.match + a.fresh))
      .slice(0, 6)
      .map((x) => x.item);
    if (scored.length > 0) return scored;
    // No tag overlap at all — show the newest tracks rather than the oldest.
    return catalogTracks
      .filter((item) => item.id !== track.id)
      .sort((a, b) => (recency.get(b.id) ?? 0) - (recency.get(a.id) ?? 0))
      .slice(0, 4);
  }, [track, catalogTracks]);

  useSeo(
    track
      ? {
          title: `${track.title}${track.artist ? ` by ${track.artist}` : ""} — Royalty-Free Music | TV Music Store`,
          description: `License "${track.title}" — royalty-free ${[track.useCase, track.genre, track.mood]
            .filter(Boolean)
            .join(", ")} music for YouTube, ads, film and games. MP3, WAV and stems, one-time or subscription licenses.`,
          path: `/track/${track.slug}`,
          image: track.cover,
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "MusicRecording",
            name: track.title,
            url: `https://tvmusicstore.com/track/${track.slug}`,
            ...(track.artist ? { byArtist: { "@type": "MusicGroup", name: track.artist } } : {}),
            ...(track.genre ? { genre: track.genre } : {}),
          },
        }
      : { title: isLoading ? "Loading… | TV Music Store" : "Track not found | TV Music Store" },
  );

  // While /api/tracks is still loading, a direct page load (F5) briefly has no
  // track yet — show a quiet skeleton, NOT the "Track not found" screen. That
  // message is reserved for a finished load with a genuinely missing slug.
  if (!track && isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto max-w-7xl px-4 pb-24 pt-28 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <div className="aspect-square animate-pulse rounded-xl bg-card" />
            <div className="flex flex-col gap-4">
              <div className="h-8 w-2/3 animate-pulse rounded bg-card" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-card" />
              <div className="mt-4 h-24 animate-pulse rounded-xl bg-card" />
              <div className="h-16 animate-pulse rounded-xl bg-card" />
            </div>
          </div>
        </main>
      </div>
    );
  }

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

  const getSelectedVersion = (item: CatalogTrack) =>
    item.audioVersions.find((version) => version.id === selectedVersions[item.id]) ?? item.audioVersions[0];

  const playVersion = (item: CatalogTrack, version: TrackAudioVersion, seekTo: number | null = null) => {
    setSelectedVersions((current) => ({ ...current, [item.id]: version.id }));
    playFromEngine(item, version, seekTo);
  };

  // The big waveform card + hero play button are pinned to the MAIN version
  // (audioVersions[0]); alternates live in the Versions tab below.
  const mainVersion = track.audioVersions[0];
  const mainIsPlaying = activePlayer?.trackId === track.id && activePlayer.versionId === mainVersion.id && isPlaying;
  const tier = liveTiers.find((t) => t.id === selectedTier) ?? liveTiers[0];
  // Each use-case / genre / mood value is its own clickable chip that jumps to
  // the catalog pre-filtered by that value (matching the Catalog ?usecase/genre/mood params).
  // Each chip opens that tag's own indexable page (/discover/moods/happy …).
  const filterChips = [
    ...splitFilterValues(track.useCase).map((value) => ({ value, facet: "useCase" as TagFacet })),
    ...splitFilterValues(track.genre).map((value) => ({ value, facet: "genre" as TagFacet })),
    ...splitFilterValues(track.mood).map((value) => ({ value, facet: "mood" as TagFacet })),
  ];
  // NOTE: extra tags (track.tags) are search-engine food only — deliberately
  // NOT rendered under the track; the chips show Use Case / Genre / Mood only.

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied");
    } catch {
      toast("Copy the link from the address bar");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <Navigation />
      <main className={`mx-auto w-full px-4 pt-24 sm:px-6 ${isAdmin ? "max-w-[110rem]" : "max-w-7xl"}`}>
        <TrackBreadcrumb trackTitle={track.title} />

        {/* Admin top bar: publish status + Publish/Unpublish + Delete track. */}
        {isAdmin && (
          <div className="mt-4">
            <AdminTrackTopBar track={track} run={admin.run} onTracksChanged={() => void reloadTracks()} />
          </div>
        )}

        {/* Admin gets two extra side columns (tags/trending left, collections/
            playlists right); customers see the normal centered page. */}
        <div
          className={
            isAdmin
              ? "mt-8 flex flex-col gap-8 xl:grid xl:grid-cols-[17rem_minmax(0,1fr)_19rem]"
              : "mt-8"
          }
        >
          {isAdmin && (
            <AdminTrackTagsPanel
              track={track}
              data={admin.data}
              setData={admin.setData}
              run={admin.run}
              tracks={catalogTracks}
              onTracksChanged={() => void reloadTracks()}
            />
          )}

          <div className="min-w-0">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* Left: cover + info */}
          <div className="h-fit rounded-xl border border-border bg-card p-6">
            {/* Square cover — real artwork from admin; placeholder otherwise.
                Admins: hover to upload/remove the cover right here. */}
            <div className="group/cover relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br from-secondary via-background to-secondary">
              {track.cover ? (
                <img src={track.cover} alt={`${track.title} cover art`} className="h-full w-full object-cover" />
              ) : (
                <>
                  <Music className="h-16 w-16 text-[#F4C430]/40" />
                  <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 font-body text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                    <img src="/logo.svg" alt="" className="h-3.5 w-auto opacity-70" />
                    TV Music Store
                  </span>
                </>
              )}
              {isAdmin && (
                <AdminTrackCoverOverlay
                  track={track}
                  run={admin.run}
                  onTracksChanged={() => void reloadTracks()}
                />
              )}
            </div>

            <h1 className="mt-5 font-body text-2xl font-semibold text-foreground">
              {track.title}
              {isAdmin && track.status === "draft" && (
                <span className="ml-2 align-middle rounded border border-amber-400/50 bg-amber-400/10 px-1.5 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-amber-400">
                  Draft
                </span>
              )}
            </h1>
            {/* The composer credit is a link to their page — same behaviour as
                the track rows on the homepage and in the catalog. Falls back to
                plain text when the track has no artist slug. */}
            <p className="mt-1 font-body text-sm text-muted-foreground">
              by{" "}
              {track.artistSlug ? (
                <Link
                  to={`/artist/${track.artistSlug}`}
                  className="text-muted-foreground transition-colors hover:text-[#F4C430]"
                >
                  {track.artist}
                </Link>
              ) : (
                track.artist
              )}
            </p>
            <p className="mt-2 font-body text-xs text-muted-foreground">
              {mainVersion.duration} · {track.bpm} BPM
            </p>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => playVersion(track, mainVersion)}
                aria-label={mainIsPlaying ? "Pause preview" : "Play preview"}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-[#F4C430]"
              >
                {mainIsPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <IconButton
                label={liked ? "Remove from favorites" : "Add to favorites"}
                onClick={() => void toggleFavourite(track.id)}
              >
                <Heart className="h-4 w-4" style={liked ? { color: GOLD, fill: GOLD } : undefined} />
              </IconButton>
              <IconButton label="Share" onClick={() => void share()}>
                <Share2 className="h-4 w-4" />
              </IconButton>
              {track.hasStems && (
                <span
                  title="Stems included (Max plan)"
                  className="rounded-md border border-[#F4C430]/60 bg-[#F4C430]/10 px-2 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F4C430]"
                >
                  Stems
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                openDownloadOptions({
                  slug: track.slug,
                  versionId: mainVersion.id,
                  src: mainVersion.src,
                  title: track.title,
                  label: mainVersion.label,
                  hasStems: track.hasStems,
                })
              }
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F4C430] py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
            >
              <Download className="h-4 w-4" />
              Download
            </button>

            <div className="mt-5 flex flex-wrap gap-2">
              {filterChips.map((chip) => (
                <Link
                  key={`${chip.facet}:${chip.value}`}
                  to={discoverPath(chip.facet, chip.value)}
                  className="rounded-full border border-border px-3 py-1 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                >
                  {chip.value}
                </Link>
              ))}
            </div>

            <div className="mt-6 border-t border-border/60 pt-5">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                About the track
              </p>
              <p className="mt-3 font-body text-sm leading-6 text-muted-foreground">{track.description}</p>
            </div>
          </div>

          {/* Right: licenses */}
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {liveTiers.map((t) => {
                  const active = t.id === selectedTier;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTier(t.id)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        active
                          ? "border-[#F4C430] bg-[#F4C430]/10"
                          : "border-border bg-background/40 hover:border-[#F4C430]/50"
                      }`}
                    >
                      <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t.name}
                      </p>
                      <p className="mt-1.5 font-body text-2xl font-semibold text-foreground">${t.price}</p>
                      <p className="mt-1 font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t.formats}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-border/60 pt-5">
                <p className="font-body text-sm font-semibold text-foreground">Usage Terms</p>
                <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {tier.usageTerms.map((term) => (
                    <li key={term} className="flex items-center gap-2.5 font-body text-sm text-muted-foreground">
                      <Check className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                      {term}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-5">
                <span className="font-body text-3xl font-semibold text-foreground">${tier.price}</span>
                <button
                  type="button"
                  onClick={() =>
                    addToCart({
                      trackId: track.id,
                      slug: track.slug,
                      title: track.title,
                      artist: track.artist,
                      tier: selectedTier,
                      cover: track.cover,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-[#F4C430] px-6 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add to Cart
                </button>
              </div>
              <p className="mt-3 font-body text-xs text-muted-foreground">
                Unlimited downloads for subscribers —{" "}
                <button
                  type="button"
                  onClick={() => openPlanModal()}
                  className="font-semibold text-[#F4C430] hover:underline"
                >
                  see plans
                </button>
                .
              </p>
            </div>

            {/* Main waveform */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="grid gap-4 md:grid-cols-[3.5rem_minmax(0,1fr)_auto] md:items-center">
                <button
                  type="button"
                  onClick={() => playVersion(track, mainVersion)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                  aria-label={mainIsPlaying ? "Pause preview" : "Play preview"}
                >
                  {mainIsPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                </button>
                <WaveformPreview
                  active={mainIsPlaying}
                  bars={360}
                  onSeek={(nextProgress) => playVersion(track, mainVersion, nextProgress)}
                  progress={
                    activePlayer?.trackId === track.id && activePlayer.versionId === mainVersion.id ? progress : 0
                  }
                  src={mainVersion.src}
                  className="h-16"
                />
                <div className="font-body text-sm text-muted-foreground md:text-right">
                  <div>{mainVersion.label.replace(/_+/g, " ").replace(/^\s*\d+[\s._-]+(?!(?:sec(?:s|onds?)?|min(?:s|utes?)?)\b)/i, "").trim() || mainVersion.label}</div>
                  <div>
                    {mainVersion.duration} / {track.bpm} BPM
                  </div>
                </div>
              </div>
            </div>

            {/* Versions / Similar */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex gap-8 border-b border-border/40">
                <TabButton active={activeTab === "versions"} onClick={() => setActiveTab("versions")}>
                  Versions
                </TabButton>
                <TabButton active={activeTab === "similar"} onClick={() => setActiveTab("similar")}>
                  Similar tracks
                </TabButton>
              </div>

              {activeTab === "versions" && (
                <div>
                  {track.audioVersions.length <= 1 && (
                    <p className="py-4 font-body text-sm text-muted-foreground">
                      No alternate versions for this track.
                    </p>
                  )}
                  {/* Main plays in the big waveform card above — list alternates only. */}
                  {track.audioVersions.slice(1).map((version) => {
                    const active = activePlayer?.trackId === track.id && activePlayer.versionId === version.id;
                    return (
                      <TrackVersionRow
                        key={version.id}
                        active={active}
                        isPlaying={active && isPlaying}
                        onPlay={() => playVersion(track, version)}
                        onSeek={(nextProgress) => playVersion(track, version, nextProgress)}
                        onDownload={() =>
                          openDownloadOptions({
                            slug: track.slug,
                            versionId: version.id,
                            src: version.src,
                            title: track.title,
                            label: version.label,
                            hasStems: track.hasStems,
                          })
                        }
                        progress={active ? progress : 0}
                        version={version}
                        trackTitle={track.title}
                      />
                    );
                  })}
                </div>
              )}

              {activeTab === "similar" && (
                <div>
                  {similarTracks.map((item) => {
                    const version = getSelectedVersion(item);
                    const active = activePlayer?.trackId === item.id && activePlayer.versionId === version.id;
                    return (
                      <div key={item.id} className="border-b border-border/40 py-4 last:border-b-0">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <Link
                            to={`/track/${item.slug}`}
                            className="font-body text-sm font-semibold text-foreground transition-colors hover:text-[#F4C430]"
                          >
                            {item.title}
                          </Link>
                          <span className="font-body text-xs text-muted-foreground">
                            {item.audioVersions.length} versions / {item.bpm} BPM
                          </span>
                        </div>
                        <div className="grid gap-4 md:grid-cols-[2rem_minmax(10rem,16rem)_minmax(0,1fr)_3.5rem] md:items-center">
                          <button
                            type="button"
                            onClick={() => playVersion(item, version)}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label={active && isPlaying ? `Pause ${item.title}` : `Play ${item.title}`}
                          >
                            {active && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </button>
                          <span className="font-body text-sm text-muted-foreground">{displayVersionLabel(version.label, item.title)}</span>
                          <WaveformPreview
                            active={active && isPlaying}
                            onSeek={(nextProgress) => playVersion(item, version, nextProgress)}
                            progress={active ? progress : 0}
                            src={version.src}
                            className="h-9"
                          />
                          <span className="font-body text-xs text-muted-foreground">{version.duration}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
          </div>

          {isAdmin && (
            <AdminTrackCollectionsPanel
              track={track}
              data={admin.data}
              setData={admin.setData}
              run={admin.run}
            />
          )}
        </div>
      </main>
    </div>
  );
};

const IconButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
  >
    {children}
  </button>
);

const TrackBreadcrumb = ({ trackTitle }: { trackTitle: string }) => (
  <nav className="flex flex-wrap items-center gap-2 font-body text-sm text-muted-foreground">
    <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-[#F4C430]">
      <Home className="h-3.5 w-3.5" />
      Home
    </Link>
    <span>/</span>
    <Link to="/catalog" className="transition-colors hover:text-[#F4C430]">
      Music Library
    </Link>
    <span>/</span>
    <span className="font-semibold text-foreground">{trackTitle}</span>
  </nav>
);

const TabButton = ({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`border-b py-3.5 font-body text-sm font-semibold uppercase tracking-[0.14em] transition-colors ${
      active
        ? "border-[#F4C430] text-foreground"
        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

const TrackVersionRow = ({
  active,
  isPlaying,
  onPlay,
  onSeek,
  onDownload,
  progress,
  version,
  trackTitle,
}: {
  active: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onSeek: (progress: number) => void;
  /** Opens the download dialog for THIS version (each one is downloadable). */
  onDownload: () => void;
  progress: number;
  version: TrackAudioVersion;
  trackTitle: string;
}) => (
  <div className="grid gap-4 border-b border-border/40 py-4 last:border-b-0 md:grid-cols-[2rem_minmax(10rem,16rem)_minmax(0,1fr)_3.5rem_2rem] md:items-center">
    <button
      type="button"
      onClick={onPlay}
      className="text-muted-foreground transition-colors hover:text-foreground"
      aria-label={isPlaying ? `Pause ${version.label}` : `Play ${version.label}`}
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
    <span className={`font-body text-sm ${active ? "text-foreground" : "text-muted-foreground"}`}>
      {displayVersionLabel(version.label, trackTitle)}
    </span>
    <WaveformPreview active={isPlaying} bars={360} onSeek={onSeek} progress={progress} src={version.src} className="h-9" />
    <span className="font-body text-xs text-muted-foreground">{version.duration}</span>
    <button
      type="button"
      onClick={onDownload}
      title="Download this version"
      aria-label={`Download ${displayVersionLabel(version.label, trackTitle)}`}
      className="justify-self-end text-muted-foreground transition-colors hover:text-[#F4C430]"
    >
      <Download className="h-4 w-4" />
    </button>
  </div>
);

export default TrackDetail;
