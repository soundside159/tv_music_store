import { Fragment, useEffect, useState } from "react";

// Admin "Whitelisting" view — channels customers registered, grouped by
// subscription status. Each active channel can be expanded to pull recent
// YouTube uploads published after it was whitelisted (via /api/admin/whitelist-
// videos), so the owner can open each and clear Content ID claims.
interface AdminChannel {
  id: string;
  channelUrl: string;
  channelRef: string;
  addedAt: string;
  userId: string;
  userEmail: string;
  userName: string;
  plan: string;
  status: string;
  active: boolean;
}
interface Video {
  videoId: string;
  title: string;
  publishedAt: string;
  url: string;
}
interface VideoState {
  loading: boolean;
  error?: string;
  inactive?: boolean;
  videos?: Video[];
}

const GOLD = "#F4C430";
const day = (s: string) => (s ? s.slice(0, 10) : "—");

const AdminWhitelist = () => {
  const [channels, setChannels] = useState<AdminChannel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [vids, setVids] = useState<Record<string, VideoState>>({});

  useEffect(() => {
    fetch("/api/admin/whitelist", { credentials: "include" })
      .then(async (r) => {
        const d = (await r.json()) as { channels?: AdminChannel[]; error?: string };
        if (!r.ok || !d.channels) throw new Error(d.error ?? "Failed to load");
        setChannels(d.channels);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadVideos = async (id: string) => {
    setVids((v) => ({ ...v, [id]: { loading: true } }));
    try {
      const r = await fetch(`/api/admin/whitelist-videos?id=${encodeURIComponent(id)}`, { credentials: "include" });
      const d = (await r.json()) as { videos?: Video[]; inactive?: boolean; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Failed to load videos");
      setVids((v) => ({ ...v, [id]: { loading: false, videos: d.videos ?? [], inactive: d.inactive } }));
    } catch (e) {
      setVids((v) => ({ ...v, [id]: { loading: false, error: e instanceof Error ? e.message : "Failed" } }));
    }
  };

  const toggle = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!vids[id]) void loadVideos(id);
  };

  const q = query.trim().toLowerCase();
  const rows = (channels ?? []).filter(
    (c) =>
      !q ||
      c.channelUrl.toLowerCase().includes(q) ||
      c.userEmail.toLowerCase().includes(q) ||
      c.userName.toLowerCase().includes(q),
  );
  const activeCount = (channels ?? []).filter((c) => c.active).length;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg text-foreground">
        Whitelisting{channels ? ` — ${activeCount} active` : ""}
      </h2>
      <p className="mb-4 mt-1 font-body text-xs text-muted-foreground">
        Channels customers whitelisted. For each <span className="text-foreground">Active</span> one,
        open "New videos" to see uploads since they whitelisted it, then clear Content ID claims on
        those videos.
      </p>

      <input
        placeholder="Search by channel, email or name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
      />

      {error && <p className="mb-3 font-body text-xs text-red-400">{error}</p>}
      {!channels && !error && <p className="font-body text-sm text-muted-foreground">Loading...</p>}
      {channels && rows.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">No whitelisted channels.</p>
      )}

      {channels && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] font-body text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Channel</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Added</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const vs = vids[c.id];
                const open = openId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            c.active ? "bg-[#F4C430]/15 text-[#F4C430]" : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {c.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <a href={c.channelUrl} target="_blank" rel="noopener noreferrer" className="text-[#F4C430] hover:underline">
                          {c.channelRef || c.channelUrl}
                        </a>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="block text-foreground">{c.userName || c.userEmail.split("@")[0]}</span>
                        <span className="block text-xs text-muted-foreground">{c.userEmail}</span>
                      </td>
                      <td className="py-2.5 pr-4 capitalize" style={{ color: c.active ? GOLD : undefined }}>
                        {c.plan}
                        {c.status && c.status !== "active" ? ` (${c.status})` : ""}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{day(c.addedAt)}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => toggle(c.id)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                        >
                          {open ? "Hide" : "New videos"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border/50 bg-background/40">
                        <td colSpan={6} className="px-4 py-3">
                          {vs?.loading && <p className="font-body text-xs text-muted-foreground">Loading videos...</p>}
                          {vs?.error && <p className="font-body text-xs text-red-400">{vs.error}</p>}
                          {vs?.inactive && (
                            <p className="font-body text-xs text-muted-foreground">
                              Subscription is not active — not servicing new videos on this channel.
                            </p>
                          )}
                          {vs && !vs.loading && !vs.error && !vs.inactive && (vs.videos?.length ?? 0) === 0 && (
                            <p className="font-body text-xs text-muted-foreground">
                              No new uploads since this channel was whitelisted.
                            </p>
                          )}
                          {vs?.videos && vs.videos.length > 0 && (
                            <ul className="space-y-1.5">
                              {vs.videos.map((v) => (
                                <li key={v.videoId} className="flex items-center justify-between gap-3">
                                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="truncate text-[#F4C430] hover:underline">
                                    {v.title || v.videoId}
                                  </a>
                                  <span className="shrink-0 font-body text-xs text-muted-foreground">{day(v.publishedAt)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminWhitelist;
