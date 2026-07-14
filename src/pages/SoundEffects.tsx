import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AudioLines, ChevronLeft, ChevronRight, Download, Loader2, Music2, Pause, Play, Search } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

// Public Sound Effects pages (see docs/SFX_PLAN.md):
//
//   /sound-effects/                    landing: search + the category shelves
//   /sound-effects/:category           one shelf, paged
//   /sound-effects/?q=…&page=2         search results, paged
//
// Everything is PAGED IN THE DATABASE (50/page) — the browser never holds more
// than a page, and every page is its own URL (indexable, shareable), the way
// TuneTank does it and the way the owner asked for.
//
// Downloads are WAV only and start at Pro. Free accounts can listen here.

const GOLD = "#F4C430";

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

const POPULAR = ["Whoosh", "Explosion", "Click", "Rain", "Footsteps", "Thunder"];

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
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page) });
    if (q) sp.set("q", q);
    if (category) sp.set("cat", category);
    if (sub) sp.set("sub", sub);
    try {
      const res = await fetch(`/api/sfx?${sp.toString()}`);
      const d = (await res.json()) as SfxResponse & { ok?: boolean };
      if (!res.ok || !d.ok) throw new Error("Failed");
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, q, category, sub]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- playback: one preview at a time -------------------------------------
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const play = (s: Sound) => {
    if (!s.previewSrc) return;
    if (playingId === s.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = s.previewSrc;
    audioRef.current.onended = () => setPlayingId(null);
    void audioRef.current.play();
    setPlayingId(s.id);
  };

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
    setParams(next);
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
  const libSize = data?.librarySize ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        {/* ---------- Hero + search (every page carries it) ---------- */}
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:items-center">
          <div>
            <p className="flex items-center gap-2 font-body text-[0.7rem] font-semibold uppercase tracking-[0.32em]" style={{ color: GOLD }}>
              <AudioLines className="h-4 w-4" />
              Sound Effects
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-foreground md:text-4xl">
              {current ? current.title : "High-quality sounds for every project"}
            </h1>
            <p className="mt-3 max-w-lg font-body text-sm text-muted-foreground">
              {current?.description ||
                "Studio-quality sound effects, ready to use in your videos, games, podcasts and more."}
            </p>
          </div>

          <div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(search);
              }}
              className="relative"
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={libSize > 0 ? `Search ${libSize.toLocaleString("en-US")} sound effects…` : "Search sound effects…"}
                className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-4 font-body text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-[#F4C430]/70 focus:outline-none"
              />
            </form>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-body text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Popular
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
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---------- Landing: the shelves ---------- */}
        {isLanding && (
          <section className="mt-12">
            <h2 className="text-xl text-foreground md:text-2xl">Browse all categories</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cats.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#F4C430]/60">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      to={`/sound-effects/${c.id}`}
                      className="flex min-w-0 items-center gap-2 font-body text-sm font-semibold text-foreground transition-colors hover:text-[#F4C430]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#F4C430]/30 bg-[#F4C430]/10">
                        {c.image ? (
                          <img src={c.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Music2 className="h-4 w-4" style={{ color: GOLD }} />
                        )}
                      </span>
                      <span className="truncate">{c.title}</span>
                    </Link>
                    <span className="shrink-0 font-body text-xs tabular-nums text-muted-foreground">
                      {c.count.toLocaleString("en-US")}
                    </span>
                  </div>
                  {c.subs.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.subs.slice(0, 8).map((s) => (
                        <Link
                          key={s.id}
                          to={`/sound-effects/${c.id}?sub=${encodeURIComponent(s.id)}`}
                          className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430]/60 hover:text-[#F4C430]"
                        >
                          {s.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {cats.length === 0 && !loading && (
                <p className="font-body text-sm text-muted-foreground">The library is being stocked — check back soon.</p>
              )}
            </div>
          </section>
        )}

        {/* ---------- Results (a category, or a search) ---------- */}
        {!isLanding && (
          <section className="mt-10">
            {/* subcategory chips of the open shelf */}
            {current && current.subs.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2">
                <Link
                  to={`/sound-effects/${current.id}`}
                  className={`rounded-full border px-3 py-1 font-body text-xs transition-colors ${
                    !sub ? "border-[#F4C430] text-[#F4C430]" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All
                </Link>
                {current.subs.map((s) => (
                  <Link
                    key={s.id}
                    to={`/sound-effects/${current.id}?sub=${encodeURIComponent(s.id)}`}
                    className={`rounded-full border px-3 py-1 font-body text-xs transition-colors ${
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

            <div className="mt-4 overflow-hidden rounded-lg border border-border/40 bg-card/25">
              {(data?.sounds ?? []).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-b border-border/30 px-3 py-2.5 last:border-b-0 hover:bg-foreground/[0.03]"
                >
                  <button
                    type="button"
                    onClick={() => play(s)}
                    aria-label={playingId === s.id ? `Pause ${s.name}` : `Play ${s.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                  >
                    {playingId === s.id ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-sm text-foreground">{s.name}</span>
                    <span className="block truncate font-body text-xs text-muted-foreground">
                      {s.artist ? `by ${s.artist}` : "TV Music Store"}
                      {s.tags.length > 0 ? ` · ${s.tags.slice(0, 3).join(", ")}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-body text-xs tabular-nums text-muted-foreground">{s.duration}</span>
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
              ))}

              {!loading && (data?.sounds.length ?? 0) === 0 && (
                <p className="px-4 py-10 text-center font-body text-sm text-muted-foreground">
                  Nothing here yet.
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
