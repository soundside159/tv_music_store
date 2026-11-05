import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Mail, Plus, RefreshCw, Search, Send, X } from "lucide-react";
import { toast } from "sonner";

// Admin "Whitelisting" (owner design 2026-11-03):
//   Composers - one coloured line per composer; open it to see the videos that
//               use their music; two buttons push new matches into the
//               composers' Google Sheets and email them how many wait.
//   Channels  - every customer channel grouped by customer, with released /
//               not released counts and the "check videos from" date.
//   Custom    - the owner's own lists of channels (e.g. "Pixabay": other stocks
//               ask him to release claims). No customer, no plan, always released.
//   Scanner   - desktop scanner status + composer sheet settings.
// Data: /api/admin/wl-scan (functions/api/admin/_wlscan.ts, _wlsheets.ts).

interface Match {
  id: number;
  videoId: string;
  videoTitle: string;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  email: string;
  track: string;
  composerId: string;
  composer: string;
  regions: [number, number][];
  total: number;
  score: number;
  eligible: boolean;
  onSite: boolean;
  state: "new" | "in_sheet" | "released" | "not_eligible";
  sheetDate: string | null;
  releasedAt: string | null;
  createdAt: string;
}
interface Channel {
  id: string;
  userId: string;
  email: string;
  url: string;
  title: string;
  addedAt: string;
  checkFrom: string;
  checkFromCustom: boolean;
  group: string;
  state: "active" | "paused" | "noplan";
  plan: string;
  checked: number;
  waiting: number;
  released: number;
  lead: number;
}
interface Composer {
  id: string;
  name: string;
  email: string;
  sheetId: string;
  sheetUrl: string;
}
interface Overview {
  composers: Composer[];
  sheetsConnected: boolean;
  scriptUrl: string;
  scanner: { lastSeen: string | null; host: string | null; queue: number; week: number; errors: number };
  channels: Channel[];
  matches: Match[];
}

const GOLD = "#F4C430";
const PALETTE = ["#F4C430", "#ff8fb1", "#7cc7ff", "#9be38a", "#c9a0ff", "#ffb366", "#6ee7d8"];
const API = "/api/admin/wl-scan";

const fmt = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const strength = (score: number) => (score >= 150 ? "sure" : score >= 80 ? "good" : "weak");
const daysSince = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(iso.replace(" ", "T") + (iso.length <= 19 ? "Z" : "")).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86400000));
};
const shortDate = (iso: string | null) =>
  iso ? new Date(iso.replace(" ", "T") + (iso.length <= 19 ? "Z" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

const post = async (body: Record<string, unknown>) => {
  const res = await fetch(API, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || d.error) throw new Error(String(d.error ?? `Request failed (${res.status})`));
  return d;
};

const Pill = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 font-body text-[11px] font-semibold ${
      ok ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-muted-foreground"
    }`}
  >
    {children}
  </span>
);

const AdminWhitelist = () => {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"composers" | "channels" | "custom" | "scanner">("composers");
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showReleased, setShowReleased] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    fetch(`${API}?action=overview`, { credentials: "include" })
      .then(async (r) => {
        const d = (await r.json()) as Overview & { error?: string };
        if (!r.ok || d.error) throw new Error(d.error ?? "Failed to load");
        setData(d);
        setErr(null);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const act = async (name: string, body: Record<string, unknown>, done: (d: Record<string, unknown>) => string) => {
    setBusy(name);
    try {
      const d = await post(body);
      toast.success(done(d));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const channelById = useMemo(() => new Map((data?.channels ?? []).map((c) => [c.id, c])), [data]);

  // Composers that have a sheet OR at least one match, in a stable colour order.
  const composerList = useMemo(() => {
    if (!data) return [];
    const ids = new Map<string, { id: string; name: string; sheetUrl: string }>();
    for (const c of data.composers) ids.set(c.id, { id: c.id, name: c.name, sheetUrl: c.sheetUrl });
    for (const m of data.matches) if (!ids.has(m.composerId)) ids.set(m.composerId, { id: m.composerId, name: m.composer, sheetUrl: "" });
    return [...ids.values()]
      .filter((c) => c.sheetUrl || data.matches.some((m) => m.composerId === c.id))
      .map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] }));
  }, [data]);

  if (err) return <p className="font-body text-sm text-red-400">{err}</p>;
  if (!data) return <p className="font-body text-sm text-muted-foreground">Loading whitelisting...</p>;

  const needle = q.trim().toLowerCase();
  const matchHit = (m: Match) =>
    !needle ||
    m.videoTitle.toLowerCase().includes(needle) ||
    m.videoId.toLowerCase().includes(needle) ||
    needle.includes(m.videoId.toLowerCase()) ||
    m.channelTitle.toLowerCase().includes(needle) ||
    m.track.toLowerCase().includes(needle);
  const eligible = data.matches.filter((m) => m.state !== "not_eligible");
  const newCount = eligible.filter((m) => m.state === "new").length;

  const scannerOnline = data.scanner.lastSeen && Date.now() - new Date(data.scanner.lastSeen).getTime() < 10 * 60000;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold text-foreground">Whitelisting</h2>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            New matches go into each composer's Google Sheet. Composers mark Released there.
          </p>
        </div>
        <button
          type="button"
          disabled={busy !== null || newCount === 0}
          onClick={() =>
            void act("sheets", { action: "sheets_update" }, (d) => {
              const added = Object.values((d.added as Record<string, number>) ?? {}).reduce((a, b) => a + b, 0);
              const miss = (d.missingSheets as string[]) ?? [];
              return `${added} video(s) added to composer sheets${miss.length ? `; no sheet yet for ${miss.length} composer(s)` : ""}`;
            })
          }
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
        >
          {busy === "sheets" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Update composer sheets{newCount ? ` · ${newCount} new` : ""}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void act("email", { action: "email_composers" }, (d) => {
              const sent = (d.sent as string[]) ?? [];
              const skipped = (d.skipped as string[]) ?? [];
              return sent.length
                ? `Emailed: ${sent.join(", ")}${skipped.length ? ` · skipped: ${skipped.join(", ")}` : ""}`
                : `Nothing to send${skipped.length ? ` · ${skipped.join(", ")}` : ""}`;
            })
          }
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 font-body text-xs font-bold text-black disabled:opacity-40"
          style={{ background: GOLD }}
        >
          {busy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          Email composers
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["composers", "Composers"],
            ["channels", `Channels · ${data.channels.filter((c) => !c.group).length}`],
            ["custom", `Custom · ${data.channels.filter((c) => c.group).length}`],
            ["scanner", "Scanner"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full border px-3.5 py-1.5 font-body text-xs font-semibold transition-colors ${
              tab === id ? "border-[#F4C430] bg-[#F4C430] text-black" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "composers" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by video link or video title"
                className="w-full bg-transparent font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 font-body text-sm text-foreground">
              <input type="checkbox" checked={showReleased} onChange={(e) => setShowReleased(e.target.checked)} className="accent-[#F4C430]" />
              Show released videos too
            </label>
          </div>

          {composerList.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">No matches yet. The desktop scanner adds them as it checks new videos.</p>
          )}

          {composerList.map((c) => {
            const mine = eligible.filter((m) => m.composerId === c.id);
            const waiting = mine.filter((m) => m.state === "in_sheet");
            const fresh = mine.filter((m) => m.state === "new");
            const released = mine.filter((m) => m.state === "released");
            const oldest = waiting.reduce((a, m) => Math.max(a, daysSince(m.sheetDate) ?? 0), 0);
            const rows = mine
              .filter((m) => showReleased || m.state !== "released")
              .filter(matchHit)
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            const isOpen = needle ? rows.length > 0 : !!open[c.id];
            if (needle && rows.length === 0) return null;
            return (
              <div key={c.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="h-[3px]" style={{ background: c.color }} />
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))}
                    className="flex items-center gap-2"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="min-w-[150px] text-left font-body text-base font-bold" style={{ color: c.color }}>
                      {c.name}
                    </span>
                  </button>
                  <span className="font-body text-xs text-muted-foreground">
                    <b className="mr-1 text-sm text-red-400">{waiting.length}</b>waiting
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    <b className="mr-1 text-sm text-foreground">{fresh.length}</b>not in sheet yet
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    <b className="mr-1 text-sm text-emerald-300">{released.length}</b>released
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    {waiting.length ? (
                      <>
                        <b className="mr-1 text-sm text-red-400">{oldest}</b>
                        {oldest === 1 ? "day oldest" : "days oldest"}
                      </>
                    ) : (
                      "-"
                    )}
                  </span>
                  <span className="ml-auto">
                    {c.sheetUrl ? (
                      <a
                        href={c.sheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-xs font-semibold text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                      >
                        Open sheet <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="font-body text-xs text-muted-foreground">no sheet yet (Scanner tab)</span>
                    )}
                  </span>
                </div>
                {isOpen && (
                  <div className="border-t border-border/60 px-4 pb-2">
                    <div className="hidden grid-cols-[80px_1.5fr_1.1fr_1fr_0.9fr_90px_130px] gap-3 py-2 font-body text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
                      <div />
                      <div>Video</div>
                      <div>Track</div>
                      <div>Where</div>
                      <div>Customer</div>
                      <div className="text-center">Days waiting</div>
                      <div>Status</div>
                    </div>
                    {rows.length === 0 && <p className="py-3 font-body text-sm text-muted-foreground">Nothing open.</p>}
                    {rows.map((m) => {
                      const ch = channelById.get(m.channelId);
                      const d = m.state === "in_sheet" ? daysSince(m.sheetDate) : null;
                      return (
                        <div
                          key={m.id}
                          className="grid grid-cols-[80px_1fr] items-center gap-3 border-t border-border/40 py-2.5 font-body text-[13px] md:grid-cols-[80px_1.5fr_1.1fr_1fr_0.9fr_90px_130px]"
                        >
                          <a href={`https://www.youtube.com/watch?v=${m.videoId}`} target="_blank" rel="noreferrer">
                            <img
                              src={`https://i.ytimg.com/vi/${m.videoId}/mqdefault.jpg`}
                              alt=""
                              loading="lazy"
                              className="h-[45px] w-[80px] rounded-md object-cover"
                            />
                          </a>
                          <div className="min-w-0">
                            <a
                              href={`https://www.youtube.com/watch?v=${m.videoId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate font-semibold text-foreground hover:text-[#F4C430]"
                            >
                              {m.videoTitle || m.videoId}
                            </a>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {m.channelTitle} · {shortDate(m.publishedAt)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-foreground">{m.track}</span>
                            {!m.onSite && (
                              <span className="mt-0.5 inline-block rounded-full bg-red-400/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                                Not on site yet
                              </span>
                            )}
                          </div>
                          <div>
                            {m.regions.map(([a, b]) => `${fmt(a)} - ${fmt(b)}`).join(", ")}
                            <span className="block text-[11px] text-muted-foreground">
                              plays {fmt(m.total)} · {strength(m.score)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            {ch?.group ? (
                              <Pill ok>Custom · {ch.group}</Pill>
                            ) : (
                              <>
                                <Pill ok>{(ch?.plan ?? "paid").replace(/^./, (x) => x.toUpperCase())} · when published</Pill>
                                <span className="block truncate text-[11px] text-muted-foreground">{m.email}</span>
                              </>
                            )}
                          </div>
                          <div className={`text-center text-[15px] font-bold ${d !== null ? "text-red-400" : "text-muted-foreground/50"}`}>
                            {d !== null ? d : "-"}
                          </div>
                          <div className="text-xs">
                            {m.state === "new" && <span className="text-muted-foreground">Not in sheet yet</span>}
                            {m.state === "in_sheet" && <span className="text-red-400">Waiting</span>}
                            {m.state === "released" && <span className="text-emerald-300">✓ Released {shortDate(m.releasedAt)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <p className="font-body text-xs text-muted-foreground">
            Videos published while the customer had no paid plan are not listed here. They are in Channels → "No active plan".
          </p>
        </>
      )}

      {tab === "channels" && <ChannelsTab data={data} reload={load} />}
      {tab === "custom" && <CustomTab data={data} reload={load} />}
      {tab === "scanner" && (
        <ScannerTab data={data} online={!!scannerOnline} busy={busy} act={act} reload={load} />
      )}
    </div>
  );
};

const ChannelsTab = ({ data, reload }: { data: Overview; reload: () => void }) => {
  const groups = useMemo(() => {
    const g = new Map<string, Channel[]>();
    for (const c of data.channels) if (!c.group) g.set(c.userId, [...(g.get(c.userId) ?? []), c]);
    return [...g.values()];
  }, [data]);
  const setFrom = async (id: string, date: string | null) => {
    try {
      await post({ action: "check_from", channelId: id, date });
      toast.success(date ? `Videos from ${date} will be checked` : "Back to the default date");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  if (groups.length === 0) return <p className="font-body text-sm text-muted-foreground">No customer channels yet.</p>;
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-2">
      <div className="hidden grid-cols-[1.6fr_0.7fr_1fr_0.7fr_0.7fr_0.7fr] gap-3 py-2 font-body text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
        <div>Channel</div>
        <div>Plan</div>
        <div>Check videos from</div>
        <div>Checked</div>
        <div>Not released</div>
        <div>Released</div>
      </div>
      {groups.map((list) => {
        const first = list[0];
        const noplan = list.every((c) => c.state === "noplan");
        const lead = list.reduce((a, c) => a + c.lead, 0);
        return (
          <div key={first.userId} className="border-t border-border/70 py-2">
            <div className="flex flex-wrap items-center gap-2 py-1 font-body text-xs text-muted-foreground">
              <b className="text-[13px] text-foreground">{first.email || first.userId}</b>
              {list.length} channel{list.length === 1 ? "" : "s"} · {noplan ? "no active plan" : first.plan.toUpperCase()}
              {noplan && lead > 0 && <span style={{ color: GOLD }}>{lead} claims could be released → send offer</span>}
            </div>
            {list.map((c) => (
              <div
                key={c.id}
                className={`grid grid-cols-1 items-center gap-3 py-2 font-body text-[13px] md:grid-cols-[1.6fr_0.7fr_1fr_0.7fr_0.7fr_0.7fr] ${
                  c.state === "active" ? "" : "opacity-60"
                }`}
              >
                <div className="min-w-0">
                  <a href={c.url} target="_blank" rel="noreferrer" className="block truncate font-semibold text-foreground hover:text-[#F4C430]">
                    {c.title || c.url}
                  </a>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {c.url.replace(/^https?:\/\/(www\.)?/, "")} · added {shortDate(c.addedAt)}
                  </span>
                </div>
                <div>
                  {c.state === "active" && <Pill ok>{c.plan.toUpperCase()}</Pill>}
                  {c.state === "paused" && <Pill ok={false}>Paused · over limit</Pill>}
                  {c.state === "noplan" && <Pill ok={false}>No active plan</Pill>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    defaultValue={c.checkFrom}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== c.checkFrom) void setFrom(c.id, e.target.value);
                    }}
                    className="h-8 rounded-lg border border-border bg-background px-2 font-body text-xs text-foreground"
                  />
                  {c.checkFromCustom && (
                    <button type="button" onClick={() => void setFrom(c.id, null)} className="text-[11px] text-muted-foreground hover:text-foreground">
                      reset
                    </button>
                  )}
                </div>
                <div>{c.checked}</div>
                <div className={`text-base font-bold ${c.waiting + c.lead ? "text-red-400" : "text-foreground"}`}>
                  {c.waiting + c.lead}
                </div>
                <div className="text-base font-bold text-emerald-300">{c.released}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// Owner's own channel lists ("Pixabay", ...). Found tracks go into the
// composers' sheets like customer videos, marked "[Pixabay] Channel".
const CustomTab = ({ data, reload }: { data: Overview; reload: () => void }) => {
  const groups = useMemo(() => {
    const g = new Map<string, Channel[]>();
    for (const c of data.channels) if (c.group) g.set(c.group, [...(g.get(c.group) ?? []), c]);
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);
  const [group, setGroup] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group.trim() || !url.trim()) {
      toast.error("Enter a list name and a channel link");
      return;
    }
    setBusy(true);
    try {
      const d = await post({ action: "custom_add", group: group.trim(), url: url.trim() });
      toast.success(`${String(d.title || "Channel")} added to ${group.trim()}`);
      setUrl("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: Channel) => {
    if (!window.confirm(`Remove "${c.title || c.url}" from ${c.group}? Videos found so far stay in the sheets.`)) return;
    try {
      await post({ action: "custom_remove", channelId: c.id });
      toast.success("Channel removed");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };
  const setFrom = async (id: string, date: string | null) => {
    try {
      await post({ action: "check_from", channelId: id, date });
      toast.success(date ? `Videos from ${date} will be checked` : "Back to the default date");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="rounded-2xl border border-border bg-card px-5 py-4">
        <h3 className="font-body text-sm font-semibold text-foreground">Add a channel to your own list</h3>
        <p className="mt-1 max-w-2xl font-body text-xs text-muted-foreground">
          For channels other stocks ask you to whitelist. No customer or plan needed: claims on our tracks are always
          released. New videos are checked from the day you add the channel (change the date below for older ones).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            list="wl-custom-groups"
            placeholder="List name, e.g. Pixabay"
            className="h-9 w-56 rounded-lg border border-border bg-background px-3 font-body text-sm text-foreground"
          />
          <datalist id="wl-custom-groups">
            {groups.map(([g]) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="YouTube channel link (youtube.com/@name)"
            className="h-9 min-w-[260px] flex-1 rounded-lg border border-border bg-background px-3 font-body text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-body text-xs font-bold text-black disabled:opacity-40"
            style={{ background: GOLD }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add channel
          </button>
        </div>
        {groups.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {groups.map(([g]) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className={`rounded-full border px-2.5 py-0.5 font-body text-[11px] ${
                  group === g ? "border-[#F4C430] text-[#F4C430]" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </form>

      {groups.length === 0 && <p className="font-body text-sm text-muted-foreground">No custom lists yet.</p>}

      {groups.map(([g, list], gi) => (
        <div key={g} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="h-[3px]" style={{ background: PALETTE[(gi + 2) % PALETTE.length] }} />
          <div className="flex flex-wrap items-center gap-3 px-4 pt-3 font-body text-xs text-muted-foreground">
            <b className="text-base text-foreground">{g}</b>
            {list.length} channel{list.length === 1 ? "" : "s"}
          </div>
          <div className="px-4 pb-2">
            <div className="hidden grid-cols-[1.6fr_1fr_0.6fr_0.7fr_0.6fr_32px] gap-3 py-2 font-body text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
              <div>Channel</div>
              <div>Check videos from</div>
              <div>Checked</div>
              <div>Not released</div>
              <div>Released</div>
              <div />
            </div>
            {list.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-1 items-center gap-3 border-t border-border/40 py-2 font-body text-[13px] md:grid-cols-[1.6fr_1fr_0.6fr_0.7fr_0.6fr_32px]"
              >
                <div className="min-w-0">
                  <a href={c.url} target="_blank" rel="noreferrer" className="block truncate font-semibold text-foreground hover:text-[#F4C430]">
                    {c.title || c.url}
                  </a>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {c.url.replace(/^https?:\/\/(www\.)?/, "")} · added {shortDate(c.addedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    defaultValue={c.checkFrom}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== c.checkFrom) void setFrom(c.id, e.target.value);
                    }}
                    className="h-8 rounded-lg border border-border bg-background px-2 font-body text-xs text-foreground"
                  />
                  {c.checkFromCustom && (
                    <button type="button" onClick={() => void setFrom(c.id, null)} className="text-[11px] text-muted-foreground hover:text-foreground">
                      reset
                    </button>
                  )}
                </div>
                <div>{c.checked}</div>
                <div className={`text-base font-bold ${c.waiting ? "text-red-400" : "text-foreground"}`}>{c.waiting}</div>
                <div className="text-base font-bold text-emerald-300">{c.released}</div>
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  aria-label="Remove channel"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ScannerTab = ({
  data,
  online,
  busy,
  act,
  reload,
}: {
  data: Overview;
  online: boolean;
  busy: string | null;
  act: (n: string, b: Record<string, unknown>, done: (d: Record<string, unknown>) => string) => Promise<void>;
  reload: () => void;
}) => {
  const [scriptUrl, setScriptUrl] = useState(data.scriptUrl);
  const [token, setToken] = useState("");
  const [sheets, setSheets] = useState<Record<string, string>>(
    Object.fromEntries(data.composers.map((c) => [c.id, c.sheetUrl])),
  );
  const s = data.scanner;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4">
        <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-red-400"}`} />
        <div>
          <b className="font-body text-sm text-foreground">Desktop scanner {online ? "online" : "offline"}</b>
          <div className="font-body text-xs text-muted-foreground">
            {s.lastSeen ? `${s.host ?? "scanner"} · last check ${shortDate(s.lastSeen)} ${new Date(s.lastSeen).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "never connected"} · {s.queue} video(s) in queue
            {s.errors ? ` · ${s.errors} failed` : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-6 font-body">
          <div className="text-right">
            <b className="block text-xl text-foreground">{s.week}</b>
            <small className="text-[11px] text-muted-foreground">videos checked this week</small>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void act("refresh", { action: "refresh", force: true }, (d) => `${d.queued ?? 0} new video(s) queued from ${d.channels ?? 0} channel(s)`)
            }
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
          >
            {busy === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Look for new videos now
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <h3 className="font-body text-sm font-semibold text-foreground">Composer sheets</h3>
        <p className="mt-1 max-w-2xl font-body text-xs text-muted-foreground">
          The site writes to the composers' Google Sheets through the small Google Apps Script in
          tools/whitelist_sheets/Code.gs. Paste its Web app URL and the token you set in it, then one sheet link per
          composer.
        </p>
        <div className="mt-3 grid max-w-3xl gap-2">
          <input
            value={scriptUrl}
            onChange={(e) => setScriptUrl(e.target.value)}
            placeholder="Apps Script Web app URL (https://script.google.com/macros/s/.../exec)"
            className="h-9 rounded-lg border border-border bg-background px-3 font-body text-sm text-foreground"
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={data.sheetsConnected ? "Token (saved, leave empty to keep)" : "Token from Code.gs"}
            className="h-9 rounded-lg border border-border bg-background px-3 font-body text-sm text-foreground"
          />
          {data.composers.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="w-36 shrink-0 truncate font-body text-sm text-foreground">{c.name}</span>
              <input
                value={sheets[c.id] ?? ""}
                onChange={(e) => setSheets((x) => ({ ...x, [c.id]: e.target.value }))}
                placeholder="Google Sheet link"
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 font-body text-sm text-foreground"
              />
              <span className="w-40 shrink-0 truncate font-body text-[11px] text-muted-foreground">{c.email || "no login email"}</span>
            </div>
          ))}
          <div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void act("cfg", { action: "sheets_config", scriptUrl, token, sheets }, () => "Sheet settings saved").then(() => {
                  setToken("");
                  reload();
                })
              }
              className="rounded-lg px-4 py-2 font-body text-xs font-bold text-black disabled:opacity-40"
              style={{ background: GOLD }}
            >
              Save settings
            </button>
            <button
              type="button"
              disabled={busy !== null || !data.sheetsConnected}
              onClick={() => void act("sync", { action: "sheets_sync" }, (d) => `${d.released ?? 0} newly released from the sheets`)}
              className="ml-2 rounded-lg border border-border px-4 py-2 font-body text-xs font-semibold text-foreground disabled:opacity-40"
            >
              Read statuses from sheets now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminWhitelist;
