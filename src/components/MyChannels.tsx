import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";

// Customer "My Channels" — live channel whitelist backed by /api/whitelist.
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add channel");
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

  if (!data && !error) {
    return <p className="font-body text-sm text-muted-foreground">Loading channels...</p>;
  }

  if (data && data.limit === 0) {
    return (
      <div>
        <p className="font-body text-sm text-muted-foreground">
          Channel whitelisting lets us clear Content ID claims on your YouTube channel while your
          subscription is active. Available on the Pro and Max plans.
        </p>
        <Link
          to="/pricing"
          className="mt-4 inline-block rounded-lg bg-[#F4C430] px-5 py-2 font-body text-sm font-semibold text-background hover:bg-[#F4C430]/85"
        >
          Upgrade to Pro
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="mb-3 font-body text-xs text-red-400">{error}</p>}
      {data && (
        <p className="mb-3 font-body text-xs text-muted-foreground">
          {data.used} of {data.limit} channels used. We clear Content ID claims on these channels
          while your subscription is active.
        </p>
      )}

      {data && data.channels.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">
          No channels yet. Add your YouTube channel URL below.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {data?.channels.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
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

      {data && data.used < data.limit && (
        <form className="mt-4 flex gap-2" onSubmit={add}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/@yourchannel"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="rounded-lg border border-[#F4C430]/70 px-4 py-2 font-body text-sm font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background disabled:opacity-50"
          >
            {busy ? "Adding..." : "Add channel"}
          </button>
        </form>
      )}
    </div>
  );
};

export default MyChannels;
