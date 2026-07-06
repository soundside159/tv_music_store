import { useEffect, useState } from "react";
import { X, Copy } from "lucide-react";

// Admin customer profile modal — opened by clicking a customer/buyer. Fetches
// /api/admin/customer?id= and shows identity, subscriptions, purchases, download
// taste, and whitelisted channels for support + targeted marketing.

interface TasteItem { label: string; count: number }
interface Profile {
  user: { id: string; email: string; name: string; role: string; memberSince: string };
  subscriptions: { plan: string; status: string | null; interval: string | null; current_period_end: string | null }[];
  purchases: { id: string; tier: string; price: number; createdAt: string; trackTitle: string }[];
  downloads: { format: string; plan: string; createdAt: string; trackTitle: string }[];
  downloadTotal: number;
  channels: string[];
  taste: { genres: TasteItem[]; moods: TasteItem[]; useCases: TasteItem[] };
}

const GOLD = "#F4C430";
const date = (s: string) => (s ? s.slice(0, 10) : "—");

const Chips = ({ title, items }: { title: string; items: TasteItem[] }) => {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 font-body text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <span key={t.label} className="rounded-full bg-[#F4C430]/12 px-2.5 py-0.5 font-body text-xs text-[#F4C430]">
            {t.label} · {t.count}
          </span>
        ))}
      </div>
    </div>
  );
};

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mt-5">
    <h3 className="mb-2 font-body text-sm font-semibold text-foreground">{title}</h3>
    {children}
  </div>
);

const AdminCustomerProfile = ({ userId, onClose }: { userId: string; onClose: () => void }) => {
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/admin/customer?id=${encodeURIComponent(userId)}`, { credentials: "include" })
      .then(async (r) => {
        const d = (await r.json()) as Profile & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Failed to load customer");
        setData(d);
      })
      .catch((e: Error) => setError(e.message));
  }, [userId]);

  const sub = data?.subscriptions[0];
  const noTaste =
    data && !data.taste.genres.length && !data.taste.moods.length && !data.taste.useCases.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            {data ? (
              <>
                <h2 className="text-lg text-foreground">{data.user.name || data.user.email.split("@")[0]}</h2>
                <button
                  onClick={() => void navigator.clipboard?.writeText(data.user.email)}
                  className="mt-0.5 inline-flex items-center gap-1.5 font-body text-sm text-muted-foreground hover:text-[#F4C430]"
                >
                  {data.user.email} <Copy className="h-3 w-3" />
                </button>
              </>
            ) : (
              <h2 className="text-lg text-foreground">Customer</h2>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="mt-4 font-body text-sm text-red-400">{error}</p>}
        {!data && !error && <p className="mt-4 font-body text-sm text-muted-foreground">Loading...</p>}

        {data && (
          <>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-body text-xs text-muted-foreground">
              <span>
                Plan:{" "}
                <span style={{ color: sub && sub.plan !== "free" ? GOLD : undefined }} className="text-foreground">
                  {sub?.plan ?? "free"}
                  {sub?.status && sub.status !== "active" ? ` (${sub.status})` : ""}
                </span>
              </span>
              <span>Member since: <span className="text-foreground">{date(data.user.memberSince)}</span></span>
              <span>Downloads: <span className="text-foreground">{data.downloadTotal}</span></span>
              <span>Role: <span className="text-foreground">{data.user.role}</span></span>
            </div>

            <Block title="Taste">
              {noTaste ? (
                <p className="font-body text-sm text-muted-foreground">No downloads or purchases yet.</p>
              ) : (
                <>
                  <Chips title="Genres" items={data.taste.genres} />
                  <Chips title="Moods" items={data.taste.moods} />
                  <Chips title="Use cases" items={data.taste.useCases} />
                </>
              )}
            </Block>

            <Block title={`Purchases (${data.purchases.length})`}>
              {data.purchases.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">No one-time purchases.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {data.purchases.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2 font-body text-sm">
                      <span className="truncate text-foreground">
                        {p.trackTitle} <span className="text-muted-foreground">· {p.tier}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        <span>{date(p.createdAt)}</span>
                        <a
                          href={`/api/license-pdf?order=${encodeURIComponent(p.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#F4C430] hover:underline"
                        >
                          PDF
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title="Subscription history">
              {data.subscriptions.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">Never subscribed.</p>
              ) : (
                <ul className="space-y-1 font-body text-sm text-muted-foreground">
                  {data.subscriptions.map((s, i) => (
                    <li key={i}>
                      <span className="capitalize text-foreground">{s.plan}</span> · {s.status ?? "—"}
                      {s.interval ? ` · ${s.interval}` : ""}
                      {s.current_period_end ? ` · until ${date(s.current_period_end)}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            {data.channels.length > 0 && (
              <Block title="Whitelisted channels">
                <ul className="space-y-1 font-body text-sm">
                  {data.channels.map((c) => (
                    <li key={c}>
                      <a href={c} target="_blank" rel="noopener noreferrer" className="text-[#F4C430] hover:underline">
                        {c}
                      </a>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            <Block title={`Recent downloads (${data.downloads.length})`}>
              {data.downloads.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">No downloads yet.</p>
              ) : (
                <ul className="max-h-40 divide-y divide-border/60 overflow-y-auto">
                  {data.downloads.map((d, i) => (
                    <li key={i} className="flex items-center justify-between py-1.5 font-body text-xs">
                      <span className="truncate text-foreground">{d.trackTitle}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {d.format.toUpperCase()} · {date(d.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminCustomerProfile;
