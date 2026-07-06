import { useEffect, useState } from "react";

// Admin "Whitelisting" view — channels customers registered, grouped by
// subscription status so the owner knows which to service (clear claims on).
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

const GOLD = "#F4C430";

const AdminWhitelist = () => {
  const [channels, setChannels] = useState<AdminChannel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/whitelist", { credentials: "include" })
      .then(async (r) => {
        const d = (await r.json()) as { channels?: AdminChannel[]; error?: string };
        if (!r.ok || !d.channels) throw new Error(d.error ?? "Failed to load");
        setChannels(d.channels);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

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
        Channels customers whitelisted. Service the <span className="text-foreground">Active</span>{" "}
        ones: open each channel and clear Content ID claims on videos using our music.
      </p>

      <input
        placeholder="Search by channel, email or name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
      />

      {error && <p className="mb-3 font-body text-xs text-red-400">{error}</p>}
      {!channels && !error && (
        <p className="font-body text-sm text-muted-foreground">Loading...</p>
      )}

      {channels && rows.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">No whitelisted channels.</p>
      )}

      {channels && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] font-body text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Channel</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
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
                    <a
                      href={c.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#F4C430] hover:underline"
                    >
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
                  <td className="py-2.5 text-muted-foreground">
                    {c.addedAt ? c.addedAt.slice(0, 10) : "—"}
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

export default AdminWhitelist;
