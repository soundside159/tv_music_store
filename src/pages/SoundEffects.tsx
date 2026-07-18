import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pause,
  Play,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import WaveformPreview from "@/components/WaveformPreview";

// Public Sound Effects pages (see docs/SFX_PLAN.md + the owner's mockups):
//
//   /sound-effects/                    landing: hero + search, "Popular
//                                      Categories" artwork cards, "Browse by
//                                      Category" panels with arc-lit chips
//   /sound-effects/:category           TuneTank-style list: breadcrumb, title,
//                                      search, chips, waveform rows, paged
//   /sound-effects/?q=…&page=2         search results, paged
//
// Everything is PAGED IN THE DATABASE (50/page) — the browser never holds more
// than a page, and every page is its own URL (indexable, shareable).
//
// Downloads are WAV only and start at Pro. Free accounts can listen here.

const GOLD = "#F4C430";

/** Same palette as the homepage "Browse by" chips — the arcs cycle through it. */
const ARC_COLORS = ["#F4C430", "#7c3aed", "#22d3ee", "#34d399", "#fb7185", "#fb923c", "#60a5fa", "#e879f9"];

interface Sound {
  id: string;
  name: string;
  categoryId: string | null;
  tags: string[];
  duration: string;
  previewSrc: string;
  artist: string | null;
}
interface Category {
  id: string;
  title: string;
  description: string | null;
  image: string | null;
  popular: boolean;
  count: number;
  subs: { id: string; title: string }[];
}
interface SfxResponse {
  page: number;
  pages: number;
  total: number;
  librarySize: number;
  sounds: Sound[];
  categories: Category[];
}

const POPULAR = ["Whoosh", "Explosion", "Click", "Notification", "Rain", "Footsteps", "Thunder", "Door", "Fire", "Wind"];

// Module-level answer cache (stale-while-revalidate, same idea as useTracks):
// navigating back to a query the session has already seen renders INSTANTLY
// from the last answer while a background refetch swaps fresh data in — no
// skeletons, no jumping. Skeletons only ever show on a truly first visit.
const sfxCache = new Map<string, SfxResponse>();

// Library size survives reloads so the search placeholder reads
// "Search 14 sound effects…" from the FIRST frame instead of flipping to it.
const LIB_SIZE_KEY = "tvms:sfx-library-size";
const readLibSize = (): number => {
  try {
    return Math.max(0, Number(window.localStorage.getItem(LIB_SIZE_KEY) ?? 0) || 0);
  } catch {
    return 0;
  }
};

/** The chip with the self-drawing coloured left rim — the homepage "Browse by"
 *  look, reused on the Browse by Category panels (owner request). */
const ArcChip = ({ to, label, index }: { to: string; label: string; index: number }) => (
  <Link
    to={to}
    className="relative inline-flex items-center overflow-hidden rounded-full border border-border bg-card/50 px-3.5 py-1 font-body text-xs text-muted-foreground transition-colors duration-200 hover:border-[#F4C430]/70 hover:bg-[#F4C430]/[0.07] hover:text-[#F4C430]"
  >
    <svg
      aria-hidden
      viewBox="0 0 16 30"
      preserveAspectRatio="xMinYMid meet"
      className="pointer-events-none absolute inset-y-0 left-0 h-full w-4"
    >
      <path
        d="M15 1 A14 14 0 0 0 15 29"
        pathLength={100}
        fill="none"
        stroke={ARC_COLORS[index % ARC_COLORS.length]}
        strokeWidth="2"
        strokeLinecap="round"
        className="arc-draw"
        style={{ animationDelay: `${150 + index * 35}ms` }}
      />
    </svg>
    {label}
  </Link>
);

const SoundEffects = () => {
  const { category } = useParams<{ category?: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const q = params.get("q") ?? "";
  const sub = params.get("sub") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const [data, setData] = useState<SfxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(q);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(page) });
    if (q) sp.set("q", q);
    if (category) sp.set("cat", category);
    if (sub) sp.set("sub", sub);
    const key = sp.toString();

    // Seen this exact query before? Paint it NOW, refresh quietly behind.
    const cached = sfxCache.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/sfx?${key}`);
      const d = (await res.json()) as SfxResponse & { ok?: boolean };
      if (!res.ok || !d.ok) throw new Error("Failed");
      sfxCache.set(key, d);
      setData(d);
      try {
        window.localStorage.setItem(LIB_SIZE_KEY, String(d.librarySize ?? 0));
      } catch {
        // storage unavailable — the placeholder just stays generic
      }
    } catch {
      if (!cached) setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, q, category, sub]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- playback: one preview at a time, with a live waveform ----------------
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [prog, setProg] = useState(0);

  const play = (s: Sound, seekTo?: number) => {
    if (!s.previewSrc) return;
    if (playingId === s.id && seekTo === undefined) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (playingId !== s.id) {
      a.src = s.previewSrc;
      setProg(0);
    }
    a.onended = () => {
      setPlayingId(null);
      setProg(0);
    };
    a.ontimeupdate = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setProg(a.currentTime / a.duration);
    };
    if (seekTo !== undefined) {
      const apply = () => {
        if (Number.isFinite(a.duration) && a.duration > 0) {
          a.currentTime = seekTo * a.duration;
          setProg(seekTo);
        }
      };
      if (Number.isFinite(a.duration) && a.duration > 0) apply();
      else a.onloadedmetadata = apply;
    }
    void a.play();
    setPlayingId(s.id);
  };

  /** Waveform click: seek inside the playing sound, or start it there. */
  const seek = (s: Sound, p: number) => play(s, p);

  // ---- download (WAV, Pro and up) ------------------------------------------
  const [busyId, setBusyId] = useState<string | null>(null);
  const download = async (s: Sound) => {
    setBusyId(s.id);
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
      setBusyId(null);
    }
  };

  const submitSearch = (value: string) => {
    const next = new URLSearchParams();
    if (value.trim()) next.set("q", value.trim());
    if (category) navigate(`/sound-effects/?${next.toString()}`);
    else setParams(next);
  };

  const gotoPage = (n: number) => {
    const next = new URLSearchParams(params);
    if (n <= 1) next.delete("page");
    else next.set("page", String(n));
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cats = data?.categories ?? [];
  const current = cats.find((c) => c.id === category);
  const isLanding = !category && !q;
  const libSize = data?.librarySize ?? readLibSize();
  const popularCats = cats.filter((c) => c.popular);

  const pageTitle = current
    ? /sounds?$/i.test(current.title.trim())
      ? current.title
      : `${current.title} Sounds`
    : "Sound Effects";

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        {/* ---------- Hero: title, subtext, then the full-width search ---------- */}
        {current && (
          <nav className="mb-2 flex items-center gap-1.5 font-body text-xs text-muted-foreground">
            <Link to="/sound-effects" className="transition-colors hover:text-[#F4C430]">
              Sound Effects
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{current.title}</span>
          </nav>
        )}

        <h1 className="font-display text-3xl font-bold leading-tight text-foreground md:text-4xl">
          {pageTitle}
        </h1>
        <p className="mt-3 max-w-2xl font-body text-sm text-muted-foreground">
          {current
            ? current.description ||
              `Royalty-free ${current.title.toLowerCase()} sound effects for your video content, games and creative projects — studio-quality WAV with a commercial license.`
            : "Premium royalty-free sound effects for video, gaming, podcasts, and creative content. Every sound comes in studio-quality WAV format with commercial licensing included."}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(search);
          }}
          className="relative mt-6"
        >
          <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2 text-muted-foreground">
            <AudioLines className="h-4 w-4" />
            <span className="hidden font-body text-sm sm:inline">Sound Effects</span>
            <span className="hidden h-4 w-px bg-border sm:inline-block" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              libSize > 0
                ? `Search ${libSize.toLocaleString("en-US")} sound effects…`
                : "Search for sound effects"
            }
            className="h-12 w-full rounded-xl border border-border bg-card pl-12 pr-11 font-body text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-[#F4C430]/70 focus:outline-none sm:pl-40"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-[#F4C430]"
          >
            <Search className="h-4 w-4" />
          </button>
        </form>

        {isLanding && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-body text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Popular:
            </span>
            {POPULAR.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setSearch(p);
                  navigate(`/sound-effects/?q=${encodeURIComponent(p)}`);
                }}
                className="rounded-full border border-border bg-card/60 px-3 py-1 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
              >
                {p.toLowerCase()}
              </button>
            ))}
          </div>
        )}

        {/* ---------- Landing skeletons: the sections keep their footprint
            while the very first answer loads, so "Browse by Category" never
            jumps up when the data lands. Cached visits skip this entirely. ---------- */}
        {isLanding && loading && cats.length === 0 && (
          <div aria-hidden>
            <section className="mt-12">
              <div className="h-7 w-52 animate-pulse rounded bg-foreground/[0.06]" />
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[3/2] animate-pulse rounded-xl border border-white/5 bg-foreground/[0.05]"
                    style={{ animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </div>
            </section>
            <section className="mt-12">
              <div className="h-7 w-56 animate-pulse rounded bg-foreground/[0.06]" />
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 animate-pulse rounded-xl border border-border/40 bg-foreground/[0.04]"
                    style={{ animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ---------- Landing: Popular Categories (artwork cards) ---------- */}
        {isLanding && !loading && popularCats.length > 0 && (
          <section className="mt-12 animate-fade-in">
            <h2 className="text-xl text-foreground md:text-2xl">Popular Categories</h2>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {popularCats.map((c) => (
                <Link
                  key={c.id}
                  to={`/sound-effects/${c.id}`}
                  className="group relative aspect-[3/2] overflow-hidden rounded-xl border border-white/10 bg-card transition-colors duration-300 hover:border-[#F4C430]/60"
                >
                  {c.image ? (
                    <img
                      src={c.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="absolute inset-0 bg-gradient-to-br from-secondary to-background" />
                  )}
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute bottom-2.5 left-3 font-body text-sm font-semibold text-white">
                    {c.title}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Landing: Browse by Category (arc-lit chips) ---------- */}
        {isLanding && !(loading && cats.length === 0) && (
          <section className="mt-12 animate-fade-in">
            <h2 className="text-xl text-foreground md:text-2xl">Browse by Category</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cats.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#F4C430]/50"
                >
                  <Link
                    to={`/sound-effects/${c.id}`}
                    className="group flex items-center gap-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors group-hover:text-[#F4C430]">
                      <AudioLines className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate font-body text-sm font-semibold text-foreground transition-colors group-hover:text-[#F4C430]">
                      {c.title}
                    </span>
                    <span className="ml-auto shrink-0 font-body text-xs tabular-nums text-muted-foreground">
                      {c.count.toLocaleString("en-US")}
                    </span>
                  </Link>
                  {c.subs.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap gap-2">
                      {c.subs.slice(0, 12).map((s, i) => (
                        <ArcChip
                          key={s.id}
                          to={`/sound-effects/${c.id}?sub=${encodeURIComponent(s.id)}`}
                          label={s.title}
                          index={i}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {cats.length === 0 && !loading && (
                <p className="font-body text-sm text-muted-foreground">
                  The library is being stocked — check back soon.
                </p>
              )}
            </div>
          </section>
        )}

        {/* ---------- Results (a category, or a search) ---------- */}
        {!isLanding && (
          <section className="mt-8">
            {/* subcategory chips of the open shelf */}
            {current && current.subs.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2">
                <Link
                  to={`/sound-effects/${current.id}`}
                  className={`rounded-full border px-3.5 py-1.5 font-body text-xs transition-colors ${
                    !sub ? "border-[#F4C430] text-[#F4C430]" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All
                </Link>
                {current.subs.map((s) => (
                  <Link
                    key={s.id}
                    to={`/sound-effects/${current.id}?sub=${encodeURIComponent(s.id)}`}
                    className={`rounded-full border px-3.5 py-1.5 font-body text-xs transition-colors ${
                      sub === s.id
                        ? "border-[#F4C430] text-[#F4C430]"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.title}
                  </Link>
                ))}
              </div>
            )}

            {/* a search landed here: quick way into the shelves */}
            {!current && (
              <div className="mb-5 flex flex-wrap gap-2">
                {cats.map((c) => (
                  <Link
                    key={c.id}
                    to={`/sound-effects/${c.id}`}
                    className="rounded-full border border-border px-3.5 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                  >
                    {c.title}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="font-body text-sm text-muted-foreground">
                {loading
                  ? "Loading…"
                  : `${(data?.total ?? 0).toLocaleString("en-US")} sound${data?.total === 1 ? "" : "s"}${
                      q ? ` for “${q}”` : ""
                    }`}
              </p>
              {(category || q) && (
                <Link to="/sound-effects" className="font-body text-sm text-muted-foreground hover:text-[#F4C430]">
                  All categories
                </Link>
              )}
            </div>

            {/* TuneTank-style rows: tile · name · waveform · duration · download.
                While a NEW query loads, the previous answer's rows must NOT
                show (they are a different category/search — the owner saw them
                flash and vanish): placeholders hold the space instead. */}
            <div className="mt-4 overflow-hidden rounded-lg border border-border/40 bg-card/25">
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    aria-hidden
                    className="flex items-center gap-3 border-b border-border/30 px-3 py-2 last:border-b-0"
                  >
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-foreground/[0.06]" />
                    <div className="flex w-36 flex-col gap-1.5 sm:w-48">
                      <div
                        className="h-3.5 w-3/4 animate-pulse rounded bg-foreground/[0.06]"
                        style={{ animationDelay: `${i * 90}ms` }}
                      />
                      <div
                        className="h-3 w-1/2 animate-pulse rounded bg-foreground/[0.04]"
                        style={{ animationDelay: `${i * 90}ms` }}
                      />
                    </div>
                    <div
                      className="hidden h-9 min-w-0 flex-1 animate-pulse rounded bg-foreground/[0.04] md:block"
                      style={{ animationDelay: `${i * 90}ms` }}
                    />
                  </div>
                ))}
              {!loading &&
                (data?.sounds ?? []).map((s) => {
                const isPlaying = playingId === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 border-b border-border/30 px-3 py-2 last:border-b-0 hover:bg-foreground/[0.03]"
                  >
                    <button
                      type="button"
                      onClick={() => play(s)}
                      aria-label={isPlaying ? `Pause ${s.name}` : `Play ${s.name}`}
                      className={`group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border transition-colors ${
                        isPlaying
                          ? "border-[#F4C430]/70 bg-[#F4C430]/10 text-[#F4C430]"
                          : "border-border/60 bg-secondary/50 text-muted-foreground hover:border-[#F4C430]/60 hover:text-[#F4C430]"
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <>
                          <AudioLines className="h-4 w-4 transition-opacity group-hover:opacity-0" />
                          <Play className="absolute ml-0.5 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                        </>
                      )}
                    </button>

                    <span className="w-36 shrink-0 sm:w-48">
                      <span
                        className={`block truncate font-body text-sm ${isPlaying ? "text-[#F4C430]" : "text-foreground"}`}
                        title={s.name}
                      >
                        {s.name}
                      </span>
                      <span className="block truncate font-body text-xs text-muted-foreground">
                        {s.artist ? `by ${s.artist}` : "TV Music Store"}
                      </span>
                    </span>

                    <WaveformPreview
                      active={isPlaying}
                      durationRatio={1}
                      onSeek={(p) => seek(s, p)}
                      progress={isPlaying ? prog : 0}
                      src={s.previewSrc}
                      className="hidden h-9 min-w-0 flex-1 md:block"
                    />

                    <span className="ml-auto shrink-0 font-body text-xs tabular-nums text-muted-foreground md:ml-0">
                      {s.duration}
                    </span>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => void download(s)}
                      title="Download WAV (Pro and up)"
                      aria-label={`Download ${s.name}`}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430] disabled:opacity-50"
                    >
                      {busyId === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                );
              })}

              {!loading && (data?.sounds.length ?? 0) === 0 && (
                <p className="px-4 py-10 text-center font-body text-sm text-muted-foreground">
                  {current
                    ? "No sounds in this category yet — they appear once sounds are assigned to it."
                    : "Nothing here yet."}
                </p>
              )}
            </div>

            {/* numbered pages — each one is its own URL */}
            {data && data.pages > 1 && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => gotoPage(page - 1)}
                  className="rounded-lg border border-border px-2 py-1.5 text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: data.pages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === data.pages || Math.abs(n - page) <= 2)
                  .map((n, i, arr) => (
                    <span key={n} className="flex items-center gap-1.5">
                      {i > 0 && arr[i - 1] !== n - 1 && (
                        <span className="font-body text-xs text-muted-foreground">…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => gotoPage(n)}
                        className={`rounded-lg px-3 py-1.5 font-body text-xs transition-colors ${
                          n === page
                            ? "border border-[#F4C430] text-[#F4C430]"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    </span>
                  ))}
                <button
                  type="button"
                  disabled={page >= data.pages}
                  onClick={() => gotoPage(page + 1)}
                  className="rounded-lg border border-border px-2 py-1.5 text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <p className="mt-6 text-center font-body text-xs text-muted-foreground">
              Sound effects download as WAV with the Pro and Max plans — on Free you can listen to them
              right here.
            </p>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default SoundEffects;
