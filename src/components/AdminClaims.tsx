import { useEffect, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, RefreshCw, Undo2, X } from "lucide-react";
import { toast } from "sonner";

// Admin "Copyright Claims" — the customer claim-release tickets from
// /api/claims (claim_requests). Status tabs like the Users view (New /
// In progress / Done) instead of a status column + "show done" toggle; a row
// moves between tabs as the owner works it. The composer next to each track
// tells the owner WHOSE Content ID provider the release request goes to.
// Customer name opens the mini-CRM profile (same as Inbox).

interface ClaimTrack {
  id: string;
  slug: string;
  title: string;
  composer: string | null;
}
interface Claim {
  id: number;
  videoUrl: string;
  videoTitle: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  tracks: ClaimTrack[];
  /** Free-typed track titles (customer wrote anything) — no composer known. */
  trackNames: string[];
  userId: string | null;
  userEmail: string;
  userName: string | null;
}

type Tab = "new" | "in_progress" | "done";

const day = (s: string | null) => (s ? s.slice(0, 10) : "—");

const copyText = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error("Clipboard unavailable — copy manually");
  }
};

const AdminClaims = ({ onOpenCustomer }: { onOpenCustomer?: (userId: string) => void }) => {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("new");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  // Checkbox selection — for "Copy links" (send a batch to the Content ID
  // provider in one paste). Cleared on tab switch and reload.
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/claims?all=1", { credentials: "include" });
      const d = (await r.json()) as {
        claims?: {
          id: number;
          video_url: string;
          video_title?: string | null;
          status: string;
          created_at: string;
          resolved_at: string | null;
          tracks?: ClaimTrack[];
          track_names?: string[];
          user_id?: string;
          user_email?: string;
          user_name?: string | null;
        }[];
        error?: string;
      };
      if (!r.ok || !d.claims) throw new Error(d.error ?? "Failed to load");
      setClaims(
        d.claims.map((c) => ({
          id: c.id,
          videoUrl: c.video_url,
          videoTitle: c.video_title ?? null,
          status: c.status,
          createdAt: c.created_at,
          resolvedAt: c.resolved_at,
          tracks: c.tracks ?? [],
          trackNames: c.track_names ?? [],
          userId: c.user_id ?? null,
          userEmail: c.user_email ?? "",
          userName: c.user_name ?? null,
        })),
      );
      setError(null);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setStatus = async (id: number, status: Tab) => {
    setBusyId(id);
    try {
      const r = await fetch("/api/claims", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Failed to update");
      }
      setClaims((list) =>
        list
          ? list.map((c) =>
              c.id === id
                ? {
                    ...c,
                    status,
                    resolvedAt: status === "done" ? new Date().toISOString() : null,
                  }
                : c,
            )
          : list,
      );
      // The row jumps to another tab — say where it went so it doesn't feel lost.
      toast.success(
        status === "done" ? "Done — moved to Done" : status === "in_progress" ? "Moved to In progress" : "Re-opened — moved to New",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  };

  const deleteClaim = async (id: number) => {
    if (!window.confirm("Delete this request? This cannot be undone.")) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/claims?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Failed to delete");
      }
      setClaims((list) => (list ? list.filter((c) => c.id !== id) : list));
      setSelected((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const q = query.trim().toLowerCase();
  const matches = (c: Claim) =>
    !q ||
    c.videoUrl.toLowerCase().includes(q) ||
    c.userEmail.toLowerCase().includes(q) ||
    (c.userName ?? "").toLowerCase().includes(q) ||
    c.tracks.some(
      (t) => t.title.toLowerCase().includes(q) || (t.composer ?? "").toLowerCase().includes(q),
    ) ||
    c.trackNames.some((n) => n.toLowerCase().includes(q)) ||
    (c.videoTitle ?? "").toLowerCase().includes(q);

  // ≤200 rows — plain filtering, no memo gymnastics needed.
  const filtered = (claims ?? []).filter(matches);
  const counts = {
    new: filtered.filter((c) => c.status === "new").length,
    in_progress: filtered.filter((c) => c.status === "in_progress").length,
    done: filtered.filter((c) => c.status === "done").length,
  };
  const rows = filtered.filter((c) => c.status === tab);

  const tabs: [Tab, string, number][] = [
    ["new", "New", counts.new],
    ["in_progress", "In progress", counts.in_progress],
    ["done", "Done", counts.done],
  ];

  const selectedRows = rows.filter((c) => selected.has(c.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  const copySelected = () => {
    const links = selectedRows.map((c) => c.videoUrl);
    if (links.length === 0) return;
    void copyText(links.join("\n"), `${links.length} link${links.length > 1 ? "s" : ""}`);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg text-foreground">Copyright Claims</h2>
        <button
          type="button"
          onClick={() => void load()}
          title="Refresh"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-body text-xs text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="mt-2 font-body text-xs text-muted-foreground">
        Claim-release requests from customers. The composer next to each track tells you whose
        Content ID provider the release goes to.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex w-fit gap-1 rounded-lg border border-border/60 bg-background/40 p-1">
          {tabs.map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setSelected(new Set());
              }}
              className={`rounded-md px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
                tab === id
                  ? "bg-secondary text-[#F4C430]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label} <span className="opacity-60">({n})</span>
            </button>
          ))}
        </div>
        <input
          placeholder="Search by video, email, track or composer..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
        />
        {/* Appears once at least one video is ticked: one paste for the
            Content ID provider. */}
        {selectedRows.length > 0 && (
          <button
            type="button"
            onClick={copySelected}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4C430] px-3 py-2 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy {selectedRows.length} link{selectedRows.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {error && <p className="mt-4 font-body text-xs text-red-400">{error}</p>}
      {!claims && !error && <p className="mt-4 font-body text-sm text-muted-foreground">Loading...</p>}
      {claims && rows.length === 0 && (
        <p className="mt-4 font-body text-sm text-muted-foreground">
          {q
            ? "Nothing matches."
            : tab === "new"
              ? "No new claims — all clear."
              : tab === "in_progress"
                ? "Nothing in progress."
                : "Nothing done yet."}
        </p>
      )}

      {claims && rows.length > 0 && (
        <table className="mt-4 w-full font-body text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-8 py-2 pr-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(rows.map((c) => c.id)))
                  }
                  title={allSelected ? "Select none" : "Select all"}
                  className="accent-[#F4C430]"
                />
              </th>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Customer</th>
              <th className="py-2 pr-4">Video</th>
              <th className="py-2 pr-4">Tracks</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border/50 align-top">
                <td className="py-3 pr-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="accent-[#F4C430]"
                  />
                </td>
                <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                  {day(tab === "done" ? (c.resolvedAt ?? c.createdAt) : c.createdAt)}
                </td>
                <td className="py-3 pr-4">
                  {c.userId && onOpenCustomer ? (
                    <button
                      type="button"
                      onClick={() => onOpenCustomer(c.userId!)}
                      title="Open customer profile"
                      className="group block text-left"
                    >
                      <span className="block text-foreground transition-colors group-hover:text-[#F4C430]">
                        {c.userName || c.userEmail.split("@")[0] || "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">{c.userEmail}</span>
                    </button>
                  ) : (
                    <>
                      <span className="block text-foreground">
                        {c.userName || c.userEmail.split("@")[0] || "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">{c.userEmail}</span>
                    </>
                  )}
                </td>
                <td className="max-w-[220px] py-3 pr-4">
                  {/* Nobody reads a YouTube URL — short link + copy + the
                      video's own title underneath. */}
                  <span className="flex items-center gap-2">
                    <a
                      href={c.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#F4C430] hover:underline"
                    >
                      Watch
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => void copyText(c.videoUrl, "link")}
                      title="Copy link"
                      className="text-muted-foreground transition-colors hover:text-[#F4C430]"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  {c.videoTitle && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={c.videoTitle}>
                      {c.videoTitle}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {c.tracks.length === 0 && c.trackNames.length === 0 ? (
                    <span className="text-xs text-muted-foreground">not specified</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {c.tracks.map((t) => (
                        <li key={t.id}>
                          {/* Catalogue track — the title links to its page. */}
                          <a
                            href={`/track/${t.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground hover:text-[#F4C430] hover:underline"
                          >
                            {t.title}
                          </a>
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {t.composer ?? "TV Music Store"}
                          </span>
                        </li>
                      ))}
                      {/* Free-typed titles — not matched to the catalogue. */}
                      {c.trackNames.map((n) => (
                        <li key={`txt-${n}`}>
                          <span className="text-foreground">{n}</span>
                          <span className="ml-1.5 text-xs italic text-muted-foreground">typed by customer</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap py-3 text-right">
                  {c.status === "new" && (
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => void setStatus(c.id, "in_progress")}
                      className="inline-flex h-6 items-center rounded-md border border-border px-2.5 align-middle text-xs text-foreground hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
                    >
                      In progress
                    </button>
                  )}
                  {c.status !== "done" ? (
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => void setStatus(c.id, "done")}
                      className="ml-1.5 inline-flex h-6 items-center gap-1 rounded-md bg-[#F4C430] px-2.5 align-middle text-xs font-bold text-background hover:bg-[#F4C430]/85 disabled:opacity-40"
                    >
                      <Check className="h-3 w-3" />
                      Done
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => void setStatus(c.id, "new")}
                      title="Re-open"
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2.5 align-middle text-xs text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
                    >
                      <Undo2 className="h-3 w-3" />
                      Re-open
                    </button>
                  )}
                  {/* Delete — works from any tab. */}
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void deleteClaim(c.id)}
                    title="Delete request"
                    aria-label="Delete request"
                    className="ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border align-middle text-muted-foreground transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-40"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminClaims;
