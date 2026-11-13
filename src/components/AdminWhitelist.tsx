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
  state: "new" | "in_sheet" | "released" | "not_eligible" | "removed";
  license: string; // plan | track | manual | custom | none | none:emailed
  userId: string;
  trackSlug: string;
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
  customLists?: string[];
  sheetsSyncedAt?: string | null;
  videos?: { videoId: string; channelId: string; title: string; publishedAt: string; status: string; found: number }[];
}

const GOLD = "#F4C430";
const PALETTE = ["#F4C430", "#ff8fb1", "#7cc7ff", "#9be38a", "#c9a0ff", "#ffb366", "#6ee7d8"];
const API = "/api/admin/wl-scan";
/** The one plain button style of this page (the gold one is reserved for the main action). */
const BTN =
  "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40";

const agoText = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
};

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
  const [showRemoved, setShowRemoved] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // "More": Custom / Scanner tabs and the search + filters, hidden by default.
  const [more, setMore] = useState(false);

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

  const [step, setStep] = useState("");
  // The routine in one click: look for new videos, read the composers' sheets
  // (what they released), then write the new claims into their sheets.
  const updateEverything = async () => {
    setBusy("all");
    const notes: string[] = [];
    try {
      setStep("Looking for new videos...");
      const r1 = await post({ action: "refresh", force: true });
      notes.push(`${r1.queued ?? 0} new video(s)`);
      setStep("Reading composer sheets...");
      const r2 = await post({ action: "sheets_sync" });
      notes.push(`${r2.released ?? 0} newly released`);
      setStep("Writing new claims to sheets...");
      const r3 = await post({ action: "sheets_update" });
      const added = Object.values((r3.added as Record<string, number>) ?? {}).reduce((a, b) => a + b, 0);
      notes.push(`${added} added to sheets`);
      const miss = (r3.missingSheets as string[]) ?? [];
      if (miss.length) notes.push(`no sheet yet for ${miss.length} composer(s)`);
      toast.success(`Updated: ${notes.join(" · ")}`);
    } catch (e) {
      toast.error(`${step || "Update"} failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setStep("");
      setBusy(null);
      load();
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
  const unlicensed = data.matches
    .filter((m) => m.state === "not_eligible")
    .filter(matchHit)
    .sort((a, b) => (a.email || "").localeCompare(b.email || "") || (a.createdAt < b.createdAt ? 1 : -1));

  const scannerOnline = data.scanner.lastSeen && Date.now() - new Date(data.scanner.lastSeen).getTime() < 10 * 60000;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold text-foreground">Whitelisting</h2>
        {/* One button does the routine: new videos -> read sheets -> write new claims. */}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void updateEverything()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-body text-xs font-bold text-black disabled:opacity-40"
          style={{ background: GOLD }}
        >
          {busy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {busy === "all" && step ? step : "Sync"}
        </button>
        {/* Emails stay a separate, deliberate action (owner rule). */}
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
          className={BTN}
        >
          {busy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          Email composers
        </button>
      </div>
      <p className="-mt-2 font-body text-xs text-muted-foreground">
        {data.sheetsSyncedAt ? `Last update ${agoText(data.sheetsSyncedAt)}` : "Not updated yet"} ·{" "}
        <span className={scannerOnline ? "text-emerald-300" : ""}>Scanner {scannerOnline ? "online" : "offline"}</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["composers", "Claims"],
            ["channels", "Customer channels"],
            ...(more
              ? ([
                  ["custom", `Admin Custom · ${(data.customLists ?? [...new Set(data.channels.filter((c) => c.group).map((c) => c.group))]).length}`],
                  ["scanner", "Scanner"],
                ] as const)
              : []),
          ] as ReadonlyArray<readonly [typeof tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg border px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
              tab === id ? "border-foreground/60 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (more && (tab === "custom" || tab === "scanner")) setTab("composers");
            setMore((m) => !m);
          }}
          className="ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-body text-xs text-muted-foreground hover:text-foreground"
        >
          More {more ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {tab === "composers" && (
        <>
          {more && <div className="flex flex-wrap items-center gap-3">
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
            <label className="flex items-center gap-2 font-body text-sm text-muted-foreground">
              <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} className="accent-[#F4C430]" />
              Show removed too
            </label>
          </div>}

          {composerList.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">No matches yet. The desktop scanner adds them as it checks new videos.</p>
          )}

          {composerList.map((c) => {
            const mine = eligible.filter((m) => m.composerId === c.id);
            const waiting = mine.filter((m) => m.state === "in_sheet");
            const fresh = mine.filter((m) => m.state === "new");
            const released = mine.filter((m) => m.state === "released");
            const removed = mine.filter((m) => m.state === "removed");
            const oldest = waiting.reduce((a, m) => Math.max(a, daysSince(m.sheetDate) ?? 0), 0);
            const rows = mine
              .filter((m) => showReleased || m.state !== "released")
              .filter((m) => showRemoved || m.state !== "removed")
              .filter(matchHit)
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            const isOpen = needle ? rows.length > 0 : !!open[c.id];
            if (needle && rows.length === 0) return null;
            return (
              <div
                key={c.id}
                className="overflow-hidden rounded-r-xl border border-l-0 border-border bg-card"
                style={{ borderLeft: `3px solid ${c.color}` }}
              >
                {/* Whole row opens the list; numbers stacked on the right (owner's approved look). */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setOpen((o) => ({ ...o, [c.id]: !isOpen }));
                  }}
                  className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-white/[0.02]"
                >
                  <span className="min-w-0 flex-1 truncate font-body text-base font-semibold text-foreground">{c.name}</span>
                  <span className="text-center">
                    <b className={`block font-body text-lg leading-tight ${waiting.length + fresh.length ? "text-red-400" : "text-muted-foreground"}`}>
                      {waiting.length + fresh.length}
                    </b>
                    <span className="block font-body text-[11px] text-muted-foreground">
                      waiting{waiting.length > 0 && oldest > 0 ? ` · ${oldest}d` : ""}
                    </span>
                  </span>
                  <span className="text-center">
                    <b className={`block font-body text-lg leading-tight ${released.length ? "text-emerald-300" : "text-muted-foreground"}`}>
                      {released.length}
                    </b>
                    <span className="block font-body text-[11px] text-muted-foreground">released</span>
                  </span>
                  {c.sheetUrl ? (
                    <a
                      href={c.sheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open this composer's sheet"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-[#F4C430]"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <span title="No sheet yet (Scanner tab)" className="w-7" />
                  )}
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
                              <Pill ok>Admin Custom · {ch.group}</Pill>
                            ) : (
                              <>
                                <Pill ok>
                                  {m.license === "track" ? "Bought the track" : m.license === "manual" ? "Released by you"
                                    : `${(ch?.plan ?? "paid").replace(/^./, (x) => x.toUpperCase())} · when published`}
                                </Pill>
                                <span className="block truncate text-[11px] text-muted-foreground">{m.email}</span>
                              </>
                            )}
                          </div>
                          <div className={`text-center text-[15px] font-bold ${d !== null ? "text-red-400" : "text-muted-foreground/50"}`}>
                            {d !== null ? d : "-"}
                          </div>
                          <div className="text-xs">
                            {m.state === "new" && (
                              <span className="whitespace-nowrap text-muted-foreground">
                                Not in sheet
                                <button
                                  type="button"
                                  title="Put just this match into the composer's sheet"
                                  className="ml-2 text-[11px] text-[#F4C430] underline-offset-2 hover:underline"
                                  onClick={() => void act("send1", { action: "sheets_update", matchId: m.id }, () => "Sent to the sheet")}
                                >
                                  Send now
                                </button>
                              </span>
                            )}
                            {m.state === "in_sheet" && <span className="text-red-400">Waiting</span>}
                            {m.state === "released" && <span className="text-emerald-300">✓ Released {shortDate(m.releasedAt)}</span>}
                            {m.state === "removed" && (
                              <span className="whitespace-nowrap text-muted-foreground">
                                Removed from sheet
                                <button
                                  type="button"
                                  title="Back to 'not in sheet': the next sheets update sends it again"
                                  className="ml-2 text-[11px] text-[#F4C430] underline-offset-2 hover:underline"
                                  onClick={() => void act(`again${m.id}`, { action: "match_again", matchId: m.id }, () => "Back in the queue for the sheet")}
                                >
                                  Send again
                                </button>
                              </span>
                            )}
                            {m.state !== "removed" && (
                            <button
                              type="button"
                              title="Added by mistake? Takes the row out of the composer's sheet; the match stays here as removed."
                              className="mt-1 block text-[11px] text-muted-foreground underline-offset-2 hover:text-red-400 hover:underline"
                              onClick={() => {
                                if (!window.confirm("Remove this match from the composer's sheet?")) return;
                                void act("remove", { action: "match_remove", matchId: m.id }, (d) =>
                                  `Removed (${d.sheetRows ?? 0} sheet row(s))`);
                              }}
                            >
                              Remove
                            </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {unlicensed.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-red-400/40 bg-card">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="font-display text-base font-bold text-foreground">No license</span>
                <span className="font-body text-xs text-muted-foreground">
                  {unlicensed.length} match{unlicensed.length === 1 ? "" : "es"}: our track found, but the customer had no plan when the
                  video came out and did not buy the track. Checked again every sync, so a purchase frees the claim by itself.
                </span>
              </div>
              <div className="border-t border-border/60 px-4 pb-2">
                {unlicensed.map((m) => (
                  <div
                    key={m.id}
                    className="grid grid-cols-[80px_1fr] items-center gap-3 border-t border-border/40 py-2.5 font-body text-[13px] md:grid-cols-[80px_1.5fr_1.1fr_1fr_190px]"
                  >
                    <a href={`https://www.youtube.com/watch?v=${m.videoId}`} target="_blank" rel="noreferrer">
                      <img src={`https://i.ytimg.com/vi/${m.videoId}/mqdefault.jpg`} alt="" loading="lazy" className="h-[45px] w-[80px] rounded-md object-cover" />
                    </a>
                    <div className="min-w-0">
                      <a href={`https://www.youtube.com/watch?v=${m.videoId}`} target="_blank" rel="noreferrer" className="block truncate font-semibold text-foreground hover:text-[#F4C430]">
                        {m.videoTitle || m.videoId}
                      </a>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {m.channelTitle} · {shortDate(m.publishedAt)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-foreground">{m.track}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{m.composer}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-foreground">{m.email || "no email"}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {m.license === "none:emailed" ? "Offer emailed" : "Not emailed yet"} · found {shortDate(m.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <button
                        type="button"
                        title="Email the customer: the track was found, the claim is released once the track is licensed"
                        className="text-[#F4C430] underline-offset-2 hover:underline"
                        onClick={() => {
                          if (!window.confirm(`Email ${m.email || "the customer"} about "${m.track}"?`)) return;
                          void act(`mail${m.id}`, { action: "email_customer", matchId: m.id }, (d) => `Sent to ${String(d.to ?? "")}`);
                        }}
                      >
                        Email customer
                      </button>
                      <button
                        type="button"
                        title="Release the claim anyway (goes to the composer's sheet)"
                        className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        onClick={() => {
                          if (!window.confirm("Release this claim without a license?")) return;
                          void act(`force${m.id}`, { action: "match_force", matchId: m.id }, () => "Marked for release");
                        }}
                      >
                        Release anyway
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground underline-offset-2 hover:text-red-400 hover:underline"
                        onClick={() => {
                          if (!window.confirm("Remove this match?")) return;
                          void act(`rm${m.id}`, { action: "match_remove", matchId: m.id }, () => "Removed");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
    for (const c of data.channels) if (!c.group && c.url !== "solo") g.set(c.userId, [...(g.get(c.userId) ?? []), c]);
    return [...g.values()];
  }, [data]);
  // A customer wrote "please release this video": one video without a channel.
  const addSolo = async (userId: string) => {
    const url = window.prompt("YouTube video link the customer sent:");
    if (!url) return;
    const m = /(?:v=|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(url.trim());
    if (!m) {
      toast.error("That does not look like a YouTube video link");
      return;
    }
    try {
      const d = await post({ action: "solo_add", userId, videoId: m[1] });
      toast.success(`"${String(d.title || m[1])}" added, it is in the scan queue`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const removeSolo = async (videoId: string, title: string) => {
    if (!window.confirm(`Remove "${title}"?`)) return;
    try {
      await post({ action: "solo_remove", videoId });
      toast.success("Video removed");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
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
              <button
                type="button"
                onClick={() => void addSolo(first.userId)}
                title="The customer sent one video link without a channel"
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
              >
                <Plus className="h-3 w-3" /> Add a video
              </button>
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
                  <span className="block truncate text-[11px] text-muted-foreground">added {shortDate(c.addedAt)}</span>
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
            {(() => {
              const soloCh = data.channels.find((c) => c.userId === first.userId && c.url === "solo");
              const vids = soloCh ? (data.videos ?? []).filter((v) => v.channelId === soloCh.id) : [];
              if (!vids.length) return null;
              return (
                <div className="mt-1 border-t border-border/40 pt-1">
                  <div className="py-1 font-body text-[11px] uppercase tracking-wide text-muted-foreground">Single videos</div>
                  {vids.map((v) => (
                    <div key={v.videoId} className="grid grid-cols-1 items-center gap-3 py-1.5 font-body text-[13px] md:grid-cols-[2fr_0.8fr_0.8fr_32px]">
                      <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer" className="block truncate font-semibold text-foreground hover:text-[#F4C430]">
                        {v.title || v.videoId}
                      </a>
                      <div className="text-muted-foreground">{shortDate(v.publishedAt)}</div>
                      <div className={v.status === "done" ? (v.found ? "text-red-400" : "text-emerald-300") : "text-muted-foreground"}>
                        {v.status === "done" ? (v.found ? `${v.found} match` : "clean") : v.status === "error" ? "error" : "in queue"}
                      </div>
                      <button type="button" onClick={() => void removeSolo(v.videoId, v.title || v.videoId)} aria-label="Remove video" className="rounded-md p-1 text-muted-foreground hover:text-red-400">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
};

// Owner's own channel lists ("Pixabay", ...). Found tracks go into the
// composers' sheets like customer videos, marked "[Pixabay] Channel".
const CustomTab = ({ data, reload }: { data: Overview; reload: () => void }) => {
  // A list is a folder: create it by name, then drop channel or video links into it.
  const lists = useMemo(() => {
    const names = new Set<string>(data.customLists ?? []);
    for (const c of data.channels) if (c.group) names.add(c.group);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [data]);
  const [newName, setNewName] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, body: Record<string, unknown>, ok: (d: Record<string, unknown>) => string) => {
    setBusy(key);
    try {
      const d = await post(body);
      toast.success(ok(d));
      reload();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (await run("new", { action: "custom_list_add", name: newName.trim() }, () => `List "${newName.trim()}" created`)) setNewName("");
  };
  const addLink = async (g: string) => {
    const url = (links[g] ?? "").trim();
    if (!url) return;
    const ok = await run("link:" + g, { action: "custom_link", group: g, url }, (d) =>
      d.video ? `Video "${String(d.title || "")}" added to ${g}` : `Channel "${String(d.title || "")}" added to ${g}`);
    if (ok) setLinks((l) => ({ ...l, [g]: "" }));
  };

  return (
    <div className="space-y-4">
      <form onSubmit={createList} className="rounded-2xl border border-border bg-card px-5 py-4">
        <h3 className="font-body text-sm font-semibold text-foreground">Your own lists</h3>
        <p className="mt-1 max-w-2xl font-body text-xs text-muted-foreground">
          For channels and videos other stocks ask you to whitelist. No customer or plan needed: claims on our tracks are
          always released. Create a list, then paste channel or video links into it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New list name, e.g. Pixabay"
            className="h-9 w-64 rounded-lg border border-border bg-background px-3 font-body text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={busy !== null || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-body text-xs font-bold text-black disabled:opacity-40"
            style={{ background: GOLD }}
          >
            {busy === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create list
          </button>
        </div>
      </form>

      {lists.length === 0 && <p className="font-body text-sm text-muted-foreground">No lists yet.</p>}

      {lists.map((g, gi) => {
        const chans = data.channels.filter((c) => c.group === g && c.url !== "solo");
        const soloCh = data.channels.find((c) => c.group === g && c.url === "solo");
        const vids = soloCh ? (data.videos ?? []).filter((v) => v.channelId === soloCh.id) : [];
        const key = "link:" + g;
        return (
          <div key={g} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="h-[3px]" style={{ background: PALETTE[(gi + 2) % PALETTE.length] }} />
            <div className="flex flex-wrap items-center gap-3 px-4 pt-3 font-body text-xs text-muted-foreground">
              <b className="text-base text-foreground">{g}</b>
              {chans.length} channel{chans.length === 1 ? "" : "s"} · {vids.length} video{vids.length === 1 ? "" : "s"}
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Remove the list "${g}" with its channels and videos? Videos found so far stay in the sheets.`)) return;
                  void run("rm:" + g, { action: "custom_list_remove", name: g }, () => `List "${g}" removed`);
                }}
                className="ml-auto text-[11px] text-muted-foreground hover:text-red-400"
              >
                Remove list
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addLink(g);
              }}
              className="flex flex-wrap gap-2 px-4 pt-3"
            >
              <input
                value={links[g] ?? ""}
                onChange={(e) => setLinks((l) => ({ ...l, [g]: e.target.value }))}
                placeholder="Paste a YouTube channel or video link"
                className="h-9 min-w-[280px] flex-1 rounded-lg border border-border bg-background px-3 font-body text-sm text-foreground"
              />
              <button
                type="submit"
                disabled={busy !== null || !(links[g] ?? "").trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-40"
              >
                {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </button>
            </form>
            <div className="px-4 pb-3">
              {chans.length > 0 && (
                <div className="hidden grid-cols-[1.6fr_1fr_0.6fr_0.7fr_0.6fr_32px] gap-3 py-2 font-body text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
                  <div>Channel</div>
                  <div>Check videos from</div>
                  <div>Checked</div>
                  <div>Not released</div>
                  <div>Released</div>
                  <div />
                </div>
              )}
              {chans.map((c) => (
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
                        if (e.target.value && e.target.value !== c.checkFrom)
                          void run("from", { action: "check_from", channelId: c.id, date: e.target.value }, () => `Videos from ${e.target.value} will be checked`);
                      }}
                      className="h-8 rounded-lg border border-border bg-background px-2 font-body text-xs text-foreground"
                    />
                    {c.checkFromCustom && (
                      <button
                        type="button"
                        onClick={() => void run("from", { action: "check_from", channelId: c.id, date: null }, () => "Back to the default date")}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        reset
                      </button>
                    )}
                  </div>
                  <div>{c.checked}</div>
                  <div className={`text-base font-bold ${c.waiting ? "text-red-400" : "text-foreground"}`}>{c.waiting}</div>
                  <div className="text-base font-bold text-emerald-300">{c.released}</div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Remove "${c.title || c.url}" from ${g}? Videos found so far stay in the sheets.`)) return;
                      void run("rmc", { action: "custom_remove", channelId: c.id }, () => "Channel removed");
                    }}
                    aria-label="Remove channel"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {vids.length > 0 && (
                <div className="mt-2 hidden grid-cols-[2fr_0.8fr_0.8fr_32px] gap-3 py-2 font-body text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
                  <div>Video</div>
                  <div>Published</div>
                  <div>Status</div>
                  <div />
                </div>
              )}
              {vids.map((v) => (
                <div
                  key={v.videoId}
                  className="grid grid-cols-1 items-center gap-3 border-t border-border/40 py-2 font-body text-[13px] md:grid-cols-[2fr_0.8fr_0.8fr_32px]"
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${v.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-semibold text-foreground hover:text-[#F4C430]"
                  >
                    {v.title || v.videoId}
                  </a>
                  <div className="text-muted-foreground">{shortDate(v.publishedAt)}</div>
                  <div className={v.status === "done" ? (v.found ? "text-red-400" : "text-emerald-300") : "text-muted-foreground"}>
                    {v.status === "done" ? (v.found ? `${v.found} match` : "clean") : v.status === "error" ? "error" : "in queue"}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Remove "${v.title || v.videoId}" from ${g}?`)) return;
                      void run("rmv", { action: "solo_remove", videoId: v.videoId }, () => "Video removed");
                    }}
                    aria-label="Remove video"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
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
