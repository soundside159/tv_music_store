import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, RefreshCw, Square, SquareCheckBig } from "lucide-react";
import { toast } from "sonner";

// Admin "Whitelisting" view, two tabs:
//   Channels        — the original per-channel table with a "New videos" expander.
//   All new videos  — the claim workflow: every new upload across all ACTIVE
//                     channels in one list; select → Copy All → send to the
//                     Content ID provider → Mark as sent (wl_handled). Handled
//                     videos are struck through behind a "Show handled" toggle.

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
  handled?: boolean;
  handledAt?: string | null;
}
interface VideoState {
  loading: boolean;
  error?: string;
  inactive?: boolean;
  videos?: Video[];
}
interface AllGroup {
  channelId: string;
  channelUrl: string;
  channelTitle: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  plan: string;
  error?: string;
  videos: Video[];
}
interface AllState {
  loading: boolean;
  error?: string;
  groups?: AllGroup[];
}

const GOLD = "#F4C430";
const day = (s: string) => (s ? s.slice(0, 10) : "—");

const copyText = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error("Clipboard unavailable — copy manually");
  }
};

const AdminWhitelist = () => {
  const [view, setView] = useState<"all" | "channels">("all");
  const [channels, setChannels] = useState<AdminChannel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [vids, setVids] = useState<Record<string, VideoState>>({});
  // --- "All new videos" workflow state ---
  const [all, setAll] = useState<AllState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHandled, setShowHandled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/whitelist", { credentials: "include" })
      .then(async (r) => {
        const d = (await r.json()) as { channels?: AdminChannel[]; error?: string };
        if (!r.ok || !d.channels) throw new Error(d.error ?? "Failed to load");
        setChannels(d.channels);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadAll = async () => {
    setAll({ loading: true });
    setSelected(new Set());
    try {
      const r = await fetch("/api/admin/whitelist-videos-all", { credentials: "include" });
      const d = (await r.json()) as { groups?: AllGroup[]; error?: string };
      if (!r.ok || !d.groups) throw new Error(d.error ?? "Failed to load");
      setAll({ loading: false, groups: d.groups });
    } catch (e) {
      setAll({ loading: false, error: e instanceof Error ? e.message : "Failed" });
    }
  };

  useEffect(() => {
    if (view === "all" && !all) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const groups = useMemo(() => all?.groups ?? [], [all]);
  const allVideos = useMemo(
    () => groups.flatMap((g) => g.videos.map((v) => ({ ...v, group: g }))),
    [groups],
  );
  const newVideos = allVideos.filter((v) => !v.handled);
  const handledCount = allVideos.length - newVideos.length;

  const toggleSelect = (videoId: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(newVideos.map((v) => v.videoId)));
  const selectNone = () => setSelected(new Set());

  const copyAll = () => {
    const chosen = selected.size > 0 ? newVideos.filter((v) => selected.has(v.videoId)) : newVideos;
    if (chosen.length === 0) {
      toast("Nothing to copy");
      return;
    }
    void copyText(chosen.map((v) => v.url).join("\n"), `${chosen.length} link${chosen.length > 1 ? "s" : ""}`);
  };

  const markSent = async () => {
    const chosen = newVideos.filter((v) => selected.has(v.videoId));
    if (chosen.length === 0) {
      toast("Select videos first");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/whitelist-handled", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videos: chosen.map((v) => ({
            videoId: v.videoId,
            userId: v.group.userId,
            channelId: v.group.channelId,
            url: v.url,
            title: v.title,
          })),
        }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Failed to mark");
      }
      const now = new Date().toISOString();
      setAll((a) =>
        a?.groups
          ? {
              ...a,
              groups: a.groups.map((g) => ({
                ...g,
                videos: g.videos.map((v) =>
                  selected.has(v.videoId) ? { ...v, handled: true, handledAt: now } : v,
                ),
              })),
            }
          : a,
      );
      setSelected(new Set());
      toast.success(`Marked ${chosen.length} as sent`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark");
    } finally {
      setBusy(false);
    }
  };

  const unmark = async (videoId: string) => {
    try {
      const r = await fetch(`/api/admin/whitelist-handled?videoId=${encodeURIComponent(videoId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
      setAll((a) =>
        a?.groups
          ? {
              ...a,
              groups: a.groups.map((g) => ({
                ...g,
                videos: g.videos.map((v) =>
                  v.videoId === videoId ? { ...v, handled: false, handledAt: null } : v,
                ),
              })),
            }
          : a,
      );
    } catch {
      toast.error("Couldn't un-mark");
    }
  };

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

  const TabButton = ({ id, label }: { id: "all" | "channels"; label: string }) => (
    <button
      type="button"
      onClick={() => setView(id)}
      className={`rounded-lg px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
        view === id
          ? "bg-[#F4C430] text-background"
          : "border border-border text-muted-foreground hover:border-[#F4C430]/60 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg text-foreground">
          Whitelisting{channels ? ` — ${activeCount} active` : ""}
        </h2>
        <div className="flex items-center gap-2">
          <TabButton id="all" label="All new videos" />
          <TabButton id="channels" label="Channels" />
        </div>
      </div>

      {view === "all" && (
        <div className="mt-4">
          <p className="font-body text-xs text-muted-foreground">
            New uploads across every active channel. Select → Copy All → send to your Content ID
            provider → Mark as sent. Sent videos drop out of this list.
          </p>

          {/* Toolbar */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <span className="font-body text-xs text-foreground">
              <span style={{ color: GOLD }} className="font-semibold">{newVideos.length} new</span>
              {" · "}
              {handledCount} handled
            </span>
            <span className="mx-1 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={selected.size === newVideos.length && newVideos.length > 0 ? selectNone : selectAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-body text-xs text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
            >
              {selected.size === newVideos.length && newVideos.length > 0 ? (
                <SquareCheckBig className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {selected.size === newVideos.length && newVideos.length > 0 ? "Select none" : "Select all"}
            </button>
            <button
              type="button"
              onClick={copyAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-body text-xs text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              Copy {selected.size > 0 ? `${selected.size} selected` : "all"}
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void markSent()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#F4C430] px-2.5 py-1 font-body text-xs font-bold text-background hover:bg-[#F4C430]/85 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Mark as sent{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
            <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 font-body text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showHandled}
                onChange={(e) => setShowHandled(e.target.checked)}
                className="accent-[#F4C430]"
              />
              Show handled
            </label>
            <button
              type="button"
              onClick={() => void loadAll()}
              title="Refresh"
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-body text-xs text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${all?.loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {all?.loading && <p className="mt-4 font-body text-sm text-muted-foreground">Checking channels on YouTube…</p>}
          {all?.error && <p className="mt-4 font-body text-xs text-red-400">{all.error}</p>}
          {all && !all.loading && !all.error && groups.length === 0 && (
            <p className="mt-4 font-body text-sm text-muted-foreground">No active whitelisted channels.</p>
          )}

          {groups.map((g) => {
            const gNew = g.videos.filter((v) => !v.handled);
            const gHandled = g.videos.length - gNew.length;
            const shown = showHandled ? g.videos : gNew;
            return (
              <div key={g.channelId} className="mt-5 rounded-lg border border-border/60 bg-background/40 p-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a
                    href={g.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-sm font-semibold text-[#F4C430] hover:underline"
                  >
                    {g.channelTitle || g.channelUrl}
                  </a>
                  <span className="font-body text-xs text-muted-foreground">
                    {g.customerName || g.customerEmail} · <span className="capitalize">{g.plan}</span>
                  </span>
                  <span className="ml-auto font-body text-xs text-muted-foreground">
                    {gNew.length} new · {gHandled} handled
                  </span>
                </div>
                {g.error && <p className="mt-2 font-body text-xs text-red-400">{g.error}</p>}
                {!g.error && shown.length === 0 && (
                  <p className="mt-2 font-body text-xs text-muted-foreground">
                    {g.videos.length === 0 ? "No new uploads since whitelisting." : "All handled."}
                  </p>
                )}
                {shown.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {shown.map((v) => (
                      <li key={v.videoId} className="flex items-center gap-2.5">
                        {v.handled ? (
                          <button
                            type="button"
                            onClick={() => void unmark(v.videoId)}
                            title={`Sent ${day(v.handledAt ?? "")} — click to un-mark`}
                            className="shrink-0 font-body text-[10px] uppercase tracking-wide text-muted-foreground hover:text-[#F4C430]"
                          >
                            undo
                          </button>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selected.has(v.videoId)}
                            onChange={() => toggleSelect(v.videoId)}
                            className="shrink-0 accent-[#F4C430]"
                          />
                        )}
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`min-w-0 flex-1 truncate font-body text-sm hover:underline ${
                            v.handled ? "text-muted-foreground/60 line-through" : "text-foreground"
                          }`}
                        >
                          {v.title || v.videoId}
                        </a>
                        <span className="shrink-0 font-body text-xs text-muted-foreground">{day(v.publishedAt)}</span>
                        {!v.handled && (
                          <button
                            type="button"
                            onClick={() => void copyText(v.url, "link")}
                            title="Copy link"
                            className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430]"
                          >
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === "channels" && (
        <div className="mt-4">
          <p className="mb-4 font-body text-xs text-muted-foreground">
            Channels customers whitelisted. For each <span className="text-foreground">Active</span> one,
            open "New videos" to see uploads since they whitelisted it.
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
                                      <a
                                        href={v.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`truncate hover:underline ${
                                          v.handled ? "text-muted-foreground/60 line-through" : "text-[#F4C430]"
                                        }`}
                                      >
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
      )}
    </div>
  );
};

export default AdminWhitelist;
