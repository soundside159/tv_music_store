import { useEffect, useState } from "react";
import { Crown, ShieldCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { openPlanModal } from "@/lib/billing";

// Customer "YouTube Whitelisting" (owner design 2026-11-03, minimal):
//   link input on top -> what happens (we scan new videos, nothing to do)
//   -> one row per channel (Protected / Paused) -> channels per plan.
// Backed by /api/whitelist. Channels beyond the plan's limit (after a
// downgrade) stay listed as Paused; the oldest ones keep working.

interface Channel {
  id: string;
  channel_url: string;
  channel_ref: string | null;
  added_at: string;
  yt_title?: string | null;
  paused?: boolean;
}
interface WlData {
  channels: Channel[];
  plan: string;
  limit: number;
  used: number;
}

const GOLD = "#F4C430";
const AVATAR = ["#2f7a62,#d8a843", "#55304a,#c46a4f", "#25456b,#7fb3d5", "#40284a,#a07ad0", "#3d5a2a,#b9c46a"];

const upgrade = () =>
  openPlanModal({
    title: "Upgrade to protect more channels",
    subtitle: "Pro protects 3 YouTube channels, Max protects 10.",
  });

const handleOf = (c: Channel) =>
  c.channel_ref ? (c.channel_ref.startsWith("@") ? c.channel_ref : c.channel_ref) : c.channel_url.replace(/^https?:\/\/(www\.)?/, "");

const YoutubeMark = () => (
  <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded-md bg-[#ff2d2d]">
    <span className="ml-0.5 border-y-[4.5px] border-l-[7px] border-y-transparent border-l-white" />
  </span>
);

const MyChannels = () => {
  const [data, setData] = useState<WlData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/whitelist", { credentials: "include" })
      .then(async (r) => {
        const d = (await r.json()) as WlData & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Failed to load channels");
        setData(d);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/whitelist", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = (await r.json()) as WlData & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Failed to add channel");
      setData(d);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add channel");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remove this channel from the whitelist?")) return;
    setError(null);
    const r = await fetch(`/api/whitelist?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
    const d = (await r.json()) as WlData & { error?: string };
    if (r.ok) setData(d);
    else setError(d.error ?? "Failed to remove channel");
  };

  const limit = data?.limit ?? 0;
  const used = data?.used ?? 0;
  const full = !!data && (limit === 0 || used >= limit);
  const plan = data?.plan ?? "free";

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">YouTube Whitelisting</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Add your channels. While your subscription is active, claims on our music in your new videos are released
            automatically.
          </p>
        </div>
        {data && limit > 0 && (
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" style={{ color: GOLD }} />
            <b className="text-foreground">
              {Math.min(used, limit)}/{limit}
            </b>{" "}
            channels
          </span>
        )}
      </div>

      {/* Link input - always on top. Plainer than a channel card: a labelled field whose
          border lights up on hover / focus. */}
      <form onSubmit={add} className="flex flex-col gap-1.5">
        <span className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a channel</span>
        <div className="group flex items-center gap-3 rounded-lg border border-border bg-background py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-[#F4C430] hover:border-[#F4C430]/70">
        <YoutubeMark />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={full || busy}
          placeholder={
            full
              ? limit === 0
                ? "Whitelisting comes with Pro and Max plans."
                : `All slots in use. Remove a channel or upgrade${plan === "max" ? "" : " to Max"}.`
              : "Paste your YouTube channel link"
          }
          className={`min-w-0 flex-1 bg-transparent font-body text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none ${full ? "opacity-60" : ""}`}
        />
        <button
          type={full ? "button" : "submit"}
          onClick={full ? upgrade : undefined}
          disabled={busy}
          className="shrink-0 rounded-lg px-4 py-2 font-body text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: GOLD }}
        >
          {full ? "Upgrade" : busy ? "Adding..." : "Add channel"}
        </button>
        </div>
      </form>

      {error && <p className="font-body text-xs text-red-400">{error}</p>}
      {!data && !error && <p className="font-body text-sm text-muted-foreground">Loading channels...</p>}

      {data && (data.channels.length > 0 || limit > 0) && (
        <div className="flex flex-col gap-2">
          {data.channels.map((c, i) => (
            <div
              key={c.id}
              className={`flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-white/[0.03] ${c.paused ? "opacity-60" : ""}`}
            >
              <span
                className="h-9 w-9 shrink-0 rounded-full"
                style={{ background: `linear-gradient(135deg,${AVATAR[i % AVATAR.length]})` }}
              />
              <a href={c.channel_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <span className="block truncate font-body text-[15px] font-semibold text-foreground">
                  {c.yt_title || handleOf(c)}
                </span>
                <span className="block truncate font-body text-xs text-muted-foreground">{handleOf(c)}</span>
              </a>
              {c.paused ? (
                <button
                  type="button"
                  onClick={upgrade}
                  className="shrink-0 rounded-full border border-border px-2.5 py-1 font-body text-[11px] font-semibold text-muted-foreground"
                >
                  Paused · upgrade to resume
                </button>
              ) : (
                <span className="group/prot relative flex shrink-0 cursor-default items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-body text-[11px] font-bold text-emerald-300">
                  <ShieldCheck className="h-3 w-3" /> Protected by our system
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-border bg-card p-3 text-left font-body text-xs font-normal leading-relaxed text-foreground opacity-0 shadow-xl transition-opacity group-hover/prot:opacity-100"
                  >
                    While your subscription is active, our system finds every new video on this channel and releases the
                    claims on our music by itself. You don't need to do anything. A claim is released once the video is
                    public, usually within one working day.
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={() => void remove(c.id)}
                aria-label="Remove channel"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 flex items-center gap-2 font-body text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Crown className="h-4 w-4" style={{ color: GOLD }} /> Channels per plan
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["pro", "Pro", 3],
                ["max", "Max", 10],
              ] as const
            ).map(([id, name, n]) => {
              const current = plan === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={current ? undefined : upgrade}
                  className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                    current
                      ? "cursor-default border-[#F4C430]/50 bg-gradient-to-r from-[#F4C430]/[0.12] to-[#F4C430]/[0.03]"
                      : "border-border bg-background/40 hover:border-[#F4C430]/40"
                  }`}
                >
                  <span className={`min-w-[44px] font-body text-3xl font-extrabold ${current ? "text-[#F4C430]" : "text-foreground"}`}>
                    {n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-body text-sm font-bold ${current ? "text-[#F4C430]" : "text-foreground"}`}>{name}</span>
                    <span className="block font-body text-xs text-muted-foreground">YouTube channels</span>
                  </span>
                  {current ? (
                    <span className="rounded-full px-2.5 py-1 font-body text-[11px] font-bold text-black" style={{ background: GOLD }}>
                      Current
                    </span>
                  ) : (
                    <span className="font-body text-xs font-bold" style={{ color: GOLD }}>
                      Upgrade →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="font-body text-[13px] text-muted-foreground">
        Got a claim our system didn't catch?{" "}
        <Link to="/account?section=claims" className="font-semibold" style={{ color: GOLD }}>
          Let us know
        </Link>
        <span className="mt-1 block text-xs text-muted-foreground/70">A claim can only be released once the video is public, usually within one working day.</span>
      </p>
    </div>
  );
};

export default MyChannels;
