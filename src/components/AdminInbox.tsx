import { useCallback, useEffect, useState } from "react";
import { Archive, Mail, PenSquare, RefreshCw, Search, Send, Star, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { refreshUnreadMail } from "@/hooks/useUnreadMail";

// Admin -> Inbox. Reads contact@ conversations from D1 (filled by the separate
// Email Worker) and replies via Resend (from contact@tvmusicstore.com).

interface ThreadRow {
  id: string;
  email: string;
  name: string | null;
  last_message_at: string | null;
  last_snippet: string | null;
  last_direction: string | null;
  unread: number;
  priority?: number;
  favorite?: number;
}

type MailTab = "inbox" | "sent" | "favorites";
const MAIL_TABS: { id: MailTab; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "favorites", label: "Favorites" },
];

interface MessageRow {
  id: string;
  direction: "in" | "out";
  subject: string | null;
  body: string | null;
  created_at: string;
}

interface Customer {
  id: string;
  name: string | null;
  role: string;
  plan: string;
  purchases: number;
  downloads: number;
}

interface Detail {
  thread: { id: string; email: string; name: string | null; favorite?: number };
  messages: MessageRow[];
  customer: Customer | null;
}

const GOLD = "#F4C430";

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(path, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
};

const fmt = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
};

const AdminInbox = ({ onOpenCustomer }: { onOpenCustomer?: (userId: string) => void }) => {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  // Tabs (triage view: client spoke last / we spoke last / starred people).
  const [tab, setTab] = useState<MailTab>("inbox");
  const [counts, setCounts] = useState<{ inbox: number; sent: number; favorites: number } | null>(null);
  // "New email" compose form (takes over the right pane).
  const [composing, setComposing] = useState(false);
  const [cTo, setCTo] = useState("");
  const [cSubject, setCSubject] = useState("");
  const [cBody, setCBody] = useState("");
  const [cSending, setCSending] = useState(false);

  const loadThreads = useCallback(async (q?: string, t: MailTab = "inbox") => {
    setLoading(true);
    try {
      // A search looks EVERYWHERE (all tabs + archived) — that's what search is for.
      const url =
        q && q.trim()
          ? `/api/admin/mail?q=${encodeURIComponent(q.trim())}`
          : `/api/admin/mail?tab=${t}`;
      const d = (await api(url)) as {
        threads: ThreadRow[];
        counts?: { inbox: number; sent: number; favorites: number };
      };
      setThreads(d.threads ?? []);
      if (d.counts) setCounts(d.counts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + debounced search as you type + tab switches.
  useEffect(() => {
    const t = setTimeout(() => void loadThreads(query, tab), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, tab, loadThreads]);

  const openThread = async (id: string) => {
    setComposing(false);
    setActiveId(id);
    setDetail(null);
    try {
      const d = (await api(`/api/admin/mail?id=${encodeURIComponent(id)}`)) as Detail;
      setDetail(d);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
      refreshUnreadMail(); // header envelope + sidebar chip drop right away
      const lastInbound = [...d.messages].reverse().find((m) => m.direction === "in");
      const base = lastInbound?.subject ?? "your message";
      setSubject(base.toLowerCase().startsWith("re:") ? base : `Re: ${base}`);
      setReply("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open thread");
    }
  };

  const sendReply = async () => {
    if (!detail || !reply.trim()) return;
    setSending(true);
    try {
      await api("/api/admin/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reply", threadId: detail.thread.id, subject, body: reply.trim() }),
      });
      toast.success("Reply sent");
      setReply("");
      await openThread(detail.thread.id);
      void loadThreads(query, tab);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setSending(false);
    }
  };

  const act = async (action: "archive" | "delete", threadId: string) => {
    if (action === "delete" && !window.confirm("Delete this conversation permanently?")) return;
    try {
      await api("/api/admin/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, threadId }),
      });
      if (activeId === threadId) {
        setActiveId(null);
        setDetail(null);
      }
      void loadThreads(query, tab);
      refreshUnreadMail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const toggleFavorite = async (threadId: string, next: boolean) => {
    // Optimistic: the star flips immediately, the request follows.
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, favorite: next ? 1 : 0 } : t)));
    setDetail((prev) =>
      prev && prev.thread.id === threadId
        ? { ...prev, thread: { ...prev.thread, favorite: next ? 1 : 0 } }
        : prev,
    );
    try {
      await api("/api/admin/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "favorite", threadId, favorite: next }),
      });
      if (tab === "favorites" && !next) void loadThreads(query, tab);
      setCounts((c) => (c ? { ...c, favorites: c.favorites + (next ? 1 : -1) } : c));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update favorite");
      void loadThreads(query, tab);
    }
  };

  const sendCompose = async () => {
    if (!cTo.trim() || !cBody.trim() || cSending) return;
    setCSending(true);
    try {
      const d = (await api("/api/admin/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "compose", to: cTo.trim(), subject: cSubject.trim(), body: cBody.trim() }),
      })) as { threadId?: string };
      toast.success("Email sent");
      setComposing(false);
      setCTo("");
      setCSubject("");
      setCBody("");
      void loadThreads(query, tab);
      if (d.threadId) void openThread(d.threadId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setCSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-body text-base font-semibold text-foreground">
          <Mail className="h-4 w-4" style={{ color: GOLD }} /> Inbox
        </h2>
        <div className="relative ml-auto min-w-[12rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email, name, or message text…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-8 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadThreads(query, tab)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
        <button
          type="button"
          onClick={() => {
            setComposing(true);
            setActiveId(null);
            setDetail(null);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[#F4C430] px-3 py-1.5 font-body text-xs font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
        >
          <PenSquare className="h-3.5 w-3.5" /> New email
        </button>
      </div>

      {/* Inbox / Sent / Favorites — a triage view over the same people:
          Inbox = the client spoke last, Sent = we did, Favorites = starred. */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        <div className="flex gap-1 rounded-full border border-border/70 bg-background/40 p-1">
          {MAIL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
                tab === t.id ? "bg-[#F4C430] text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.id === "favorites" && <Star className="h-3 w-3" />}
              {t.label}
              {counts && (
                <span className={tab === t.id ? "opacity-70" : "opacity-50"}>· {counts[t.id]}</span>
              )}
            </button>
          ))}
        </div>
        {query && (
          <span className="ml-2 font-body text-[11px] text-muted-foreground">
            Search covers all tabs and archived threads
          </span>
        )}
      </div>

      {/* minmax(0,1fr) + min-w-0: a long unbroken word in a message must WRAP,
          not stretch the conversation column past the card (it did). */}
      <div className="grid gap-0 md:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Thread list */}
        <div className="min-w-0 max-h-[70vh] overflow-y-auto border-b border-border md:border-b-0 md:border-r">
          {loading ? (
            <p className="px-4 py-6 font-body text-sm text-muted-foreground">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="px-4 py-6 font-body text-sm text-muted-foreground">
              No messages yet. Emails to contact@tvmusicstore.com will appear here once the mail worker
              is set up (see docs/ADMIN_MAILBOX.md).
            </p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void openThread(t.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-border/50 px-4 py-3 text-left transition-colors ${
                  activeId === t.id ? "bg-secondary" : "hover:bg-foreground/[0.03]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`min-w-0 truncate font-body text-sm ${
                      t.unread > 0 ? "font-semibold text-foreground" : "text-foreground/90"
                    }`}
                  >
                    {t.name || t.email}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span
                      role="button"
                      tabIndex={0}
                      title={t.favorite ? "Remove from Favorites" : "Add to Favorites"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFavorite(t.id, !t.favorite);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          void toggleFavorite(t.id, !t.favorite);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <Star
                        className={`h-3.5 w-3.5 transition-colors ${
                          t.favorite ? "fill-[#F4C430] text-[#F4C430]" : "text-muted-foreground/40 hover:text-[#F4C430]"
                        }`}
                      />
                    </span>
                    {t.priority ? (
                      <span
                        className="rounded-full px-1.5 py-0.5 font-body text-[9px] font-bold uppercase tracking-wide text-background"
                        style={{ backgroundColor: GOLD }}
                      >
                        Pro
                      </span>
                    ) : null}
                    {t.unread > 0 && (
                      <span
                        className="rounded-full px-1.5 py-0.5 font-body text-[10px] font-bold text-background"
                        style={{ backgroundColor: GOLD }}
                      >
                        {t.unread}
                      </span>
                    )}
                  </span>
                </div>
                <span className="truncate font-body text-xs text-muted-foreground">
                  {t.last_direction === "out" ? "You: " : ""}
                  {t.last_snippet}
                </span>
                <span className="font-body text-[11px] text-muted-foreground/70">{fmt(t.last_message_at)}</span>
              </button>
            ))
          )}
        </div>

        {/* Conversation / compose */}
        <div className="flex min-h-[50vh] min-w-0 flex-col">
          {composing ? (
            <div className="flex flex-col gap-2 p-4">
              <h3 className="flex items-center gap-2 font-body text-sm font-semibold text-foreground">
                <PenSquare className="h-4 w-4" style={{ color: GOLD }} /> New email
              </h3>
              <input
                value={cTo}
                onChange={(e) => setCTo(e.target.value)}
                placeholder="To — client@email.com"
                type="email"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
              />
              <input
                value={cSubject}
                onChange={(e) => setCSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
              />
              <textarea
                value={cBody}
                onChange={(e) => setCBody(e.target.value)}
                rows={8}
                placeholder="Write your message…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={cSending || !cTo.trim() || !cBody.trim()}
                  onClick={() => void sendCompose()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {cSending ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="rounded-lg border border-border px-4 py-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
                <p className="ml-auto font-body text-[11px] text-muted-foreground">
                  Sends from contact@tvmusicstore.com; the reply lands in this inbox.
                </p>
              </div>
            </div>
          ) : !detail ? (
            <p className="px-4 py-6 font-body text-sm text-muted-foreground">
              {activeId ? "Loading…" : "Select a conversation or write a new email."}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                {detail.customer && onOpenCustomer ? (
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(detail.customer!.id)}
                    title="Open customer profile"
                    className="group min-w-0 text-left"
                  >
                    <p className="truncate font-body text-sm font-semibold text-foreground transition-colors group-hover:text-[#F4C430]">
                      {detail.thread.name || detail.thread.email}
                    </p>
                    <p className="truncate font-body text-xs text-muted-foreground">{detail.thread.email}</p>
                  </button>
                ) : (
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm font-semibold text-foreground">
                      {detail.thread.name || detail.thread.email}
                    </p>
                    <p className="truncate font-body text-xs text-muted-foreground">{detail.thread.email}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(detail.thread.id, !detail.thread.favorite)}
                    title={detail.thread.favorite ? "Remove from Favorites" : "Add to Favorites"}
                    className="transition-colors"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        detail.thread.favorite
                          ? "fill-[#F4C430] text-[#F4C430]"
                          : "text-muted-foreground hover:text-[#F4C430]"
                      }`}
                    />
                  </button>
                  {detail.customer && (
                    <span className="flex items-center gap-1 rounded-full border border-border px-2 py-1 font-body text-[11px] text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="capitalize text-foreground">{detail.customer.plan}</span> · {detail.customer.purchases} buys ·{" "}
                      {detail.customer.downloads} dl
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void act("archive", detail.thread.id)}
                    title="Archive"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void act("delete", detail.thread.id)}
                    title="Delete"
                    className="text-muted-foreground transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {detail.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-xl border p-3 ${
                      m.direction === "out"
                        ? "ml-auto border-[#F4C430]/40 bg-[#F4C430]/10"
                        : "border-border bg-background/40"
                    }`}
                  >
                    <p className="mb-1 font-body text-[11px] text-muted-foreground">
                      {m.direction === "out" ? "You" : detail.thread.name || detail.thread.email} · {fmt(m.created_at)}
                    </p>
                    {m.subject && (
                      <p className="mb-1 font-body text-xs font-semibold text-foreground [overflow-wrap:anywhere]">{m.subject}</p>
                    )}
                    <p className="min-w-0 whitespace-pre-wrap font-body text-sm text-foreground/90 [overflow-wrap:anywhere]">{m.body}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-3">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
                />
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    placeholder={`Reply to ${detail.thread.email}…`}
                    className="min-h-[3rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={sending || !reply.trim()}
                    onClick={() => void sendReply()}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#F4C430] px-4 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
                <p className="mt-2 font-body text-[11px] text-muted-foreground">
                  Sends from contact@tvmusicstore.com. Needs the root domain verified in Resend.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminInbox;
