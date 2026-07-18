import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";

// Admin "Copyright Claims" — the customer claim-release tickets from
// /api/claims (claim_requests). Each row: date, customer, video link, the
// tracks the customer named (with each track's composer — that tells the owner
// WHICH provider/composer the release request goes to), status. The owner works
// the list top-down: open video → send release to the composer's provider →
// In progress → Done.

interface ClaimTrack {
  id: string;
  slug: string;
  title: string;
  composer: string | null;
}
interface Claim {
  id: number;
  videoUrl: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  tracks: ClaimTrack[];
  userEmail: string;
  userName: string | null;
}

const GOLD = "#F4C430";
const day = (s: string | null) => (s ? s.slice(0, 10) : "—");

const copyText = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error("Clipboard unavailable — copy manually");
  }
};

const StatusPill = ({ status }: { status: string }) => {
  const cls =
    status === "done"
      ? "bg-[#F4C430]/15 text-[#F4C430]"
      : status === "in_progress"
        ? "border border-[#F4C430]/50 text-[#F4C430]"
        : "bg-secondary text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-body text-xs ${cls}`}>
      {status === "in_progress" ? "in progress" : status}
    </span>
  );
};

const AdminClaims = () => {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/claims?all=1", { credentials: "include" });
      const d = (await r.json()) as {
        claims?: {
          id: number;
          video_url: string;
          status: string;
          created_at: string;
          resolved_at: string | null;
          tracks?: ClaimTrack[];
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
          status: c.status,
          createdAt: c.created_at,
          resolvedAt: c.resolved_at,
          tracks: c.tracks ?? [],
          userEmail: c.user_email ?? "",
          userName: c.user_name ?? null,
        })),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setStatus = async (id: number, status: "new" | "in_progress" | "done") => {
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (claims ?? []).filter(
        (c) =>
          (showDone || c.status !== "done") &&
          (!q ||
            c.videoUrl.toLowerCase().includes(q) ||
            c.userEmail.toLowerCase().includes(q) ||
            (c.userName ?? "").toLowerCase().includes(q) ||
            c.tracks.some(
              (t) =>
                t.title.toLowerCase().includes(q) ||
                (t.composer ?? "").toLowerCase().includes(q),
            )),
      ),
    [claims, showDone, q],
  );
  const openCount = (claims ?? []).filter((c) => c.status !== "done").length;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg text-foreground">
          Copyright Claims
          {claims ? (
            <>
              {" — "}
              <span style={{ color: GOLD }}>{openCount} open</span>
            </>
          ) : (
            ""
          )}
        </h2>
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
        Content ID provider the release goes to. Send it, mark <span className="text-foreground">In
        progress</span>, and <span className="text-foreground">Done</span> once it is released.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          placeholder="Search by video, email, track or composer..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
        />
        <label className="inline-flex cursor-pointer items-center gap-1.5 font-body text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="accent-[#F4C430]"
          />
          Show done
        </label>
      </div>

      {error && <p className="mt-4 font-body text-xs text-red-400">{error}</p>}
      {!claims && !error && <p className="mt-4 font-body text-sm text-muted-foreground">Loading...</p>}
      {claims && rows.length === 0 && (
        <p className="mt-4 font-body text-sm text-muted-foreground">
          {openCount === 0 && !showDone ? "No open claims — all clear." : "Nothing matches."}
        </p>
      )}

      {claims && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] font-body text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Video</th>
                <th className="py-2 pr-4">Tracks</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border/50 align-top">
                  <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                    {day(c.createdAt)}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="block text-foreground">
                      {c.userName || c.userEmail.split("@")[0] || "—"}
                    </span>
                    <span className="block text-xs text-muted-foreground">{c.userEmail}</span>
                  </td>
                  <td className="max-w-[240px] py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={c.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-1 text-[#F4C430] hover:underline"
                      >
                        <span className="truncate">{c.videoUrl.replace("https://www.", "")}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      <button
                        type="button"
                        onClick={() => void copyText(c.videoUrl, "link")}
                        title="Copy link"
                        className="shrink-0 text-muted-foreground transition-colors hover:text-[#F4C430]"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    {c.tracks.length === 0 ? (
                      <span className="text-xs text-muted-foreground">not specified</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {c.tracks.map((t) => (
                          <li key={t.id}>
                            <span className="text-foreground">{t.title}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {t.composer ?? "TV Music Store"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4">
                    <StatusPill status={c.status} />
                    {c.status === "done" && c.resolvedAt && (
                      <span className="ml-2 text-xs text-muted-foreground">{day(c.resolvedAt)}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-3 text-right">
                    {c.status === "new" && (
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => void setStatus(c.id, "in_progress")}
                        className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
                      >
                        In progress
                      </button>
                    )}
                    {c.status !== "done" ? (
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => void setStatus(c.id, "done")}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-[#F4C430] px-2.5 py-1 text-xs font-bold text-background hover:bg-[#F4C430]/85 disabled:opacity-40"
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
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
                      >
                        <Undo2 className="h-3 w-3" />
                        Re-open
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminClaims;
