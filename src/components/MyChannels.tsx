import { useEffect, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { openPlanModal } from "@/lib/billing";

// Customer "YouTube Whitelisting" — live channel whitelist backed by /api/whitelist.
// Upgrade prompts open the shared plan popup with a whitelisting-specific heading.

interface Channel {
  id: string;
  channel_url: string;
  channel_ref: string | null;
  added_at: string;
}
interface WlData {
  channels: Channel[];
  plan: string;
  limit: number;
  used: number;
}

const GOLD = "#F4C430";

const upgrade = () =>
  openPlanModal({
    title: "Upgrade to protect channels",
    subtitle: "YouTube channel protection is included with Pro and Max.",
  });

const PlanBox = ({
  name,
  channels,
  current,
}: {
  name: string;
  channels: number;
  current: boolean;
}) => (
  <button
    type="button"
    onClick={current ? undefined : upgrade}
    className={`flex flex-col items-center gap-0.5 rounded-xl border p-4 text-center transition-colors ${
      current ? "border-[#F4C430]/60 bg-[#F4C430]/5 cursor-default" : "border-border bg-background/40 hover:border-[#F4C430]/50"
    }`}
  >
    <span className="font-body text-sm font-semibold text-foreground">{name}</span>
    <span className="font-body text-2xl font-semibold text-foreground">{channels}</span>
    <span className="font-body text-[11px] text-muted-foreground">channels covered</span>
    <span className="mt-1 font-body text-xs font-semibold text-[#F4C430]">
      {current ? "Current plan" : "Upgrade →"}
    </span>
  </button>
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
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/whitelist", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
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
    setError(null);
    const r = await fetch(`/api/whitelist?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const d = (await r.json()) as WlData & { error?: string };
    if (r.ok) setData(d);
    else setError(d.error ?? "Failed to remove channel");
  };

  const limit = data?.limit ?? 0;
  const used = data?.used ?? 0;
  const isMax = data?.plan === "max";
  const canAdd = !!data && used < limit;

  const channelsBadge = (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 font-body text-xs text-muted-foreground">
      <ShieldCheck className="h-4 w-4" style={{ color: GOLD }} />
      <span className="font-semibold text-foreground">
        {used}/{limit}
      </span>{" "}
      channels
    </span>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">YouTube Whitelisting</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Add your channels and we take care of Content ID claims on your new videos while your
          subscription is active — set it once and relax.
        </p>
      </div>

      {error && <p className="font-body text-xs text-red-400">{error}</p>}
      {!data && !error && (
        <p className="font-body text-sm text-muted-foreground">Loading channels…</p>
      )}

      {/* Existing channels */}
      {data && data.channels.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
          {data.channels.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="truncate font-body text-sm text-foreground">{c.channel_url}</span>
              <button
                type="button"
                onClick={() => remove(c.id)}
                aria-label="Remove channel"
                className="shrink-0 text-muted-foreground transition-colors hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add a channel */}
      {canAdd ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-body text-sm font-semibold text-foreground">Add a channel</p>
            {channelsBadge}
          </div>
          <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/@yourchannel"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !url.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F4C430] px-5 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> {busy ? "Adding…" : "Add channel"}
            </button>
          </form>
        </div>
      ) : (
        data && (
          <button
            type="button"
            onClick={upgrade}
            className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border p-5 text-left transition-colors hover:border-[#F4C430]/50"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Plus className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-body text-sm font-semibold text-foreground">Add a channel</span>
                <span className="block font-body text-xs text-muted-foreground">
                  {limit === 0
                    ? "Upgrade your plan to whitelist channels"
                    : "You've used all your channel slots — upgrade for more"}
                </span>
              </span>
            </span>
            {channelsBadge}
          </button>
        )
      )}

      {/* Channels per plan (hidden on Max) */}
      {data && !isMax && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-4 w-4" style={{ color: GOLD }} /> Channels per plan
          </p>
          <div className="grid grid-cols-2 gap-3">
            <PlanBox name="Pro" channels={3} current={data.plan === "pro"} />
            <PlanBox name="Max" channels={10} current={false} />
          </div>
        </div>
      )}
    </div>
  );
};

export default MyChannels;
