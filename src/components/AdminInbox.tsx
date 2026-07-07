import { useCallback, useEffect, useState } from "react";
import { Archive, Mail, RefreshCw, Send, Trash2, User } from "lucide-react";
import { toast } from "sonner";

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
}

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
  thread: { id: string; email: string; name: string | null };
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

const AdminInbox = () => {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const d = (await api("/api/admin/mail")) as { threads: ThreadRow[] };
      setThreads(d.threads ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const openThread = async (id: string) => {
    setActiveId(id);
    setDetail(null);
    try {
      const d = (await api(`/api/admin/mail?id=${encodeURIComponent(id)}`)) as Detail;
      setDetail(d);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
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
      void loadThreads();
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
      void loadThreads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-body text-base font-semibold text-foreground">
          <Mail className="h-4 w-4" style={{ color: GOLD }} /> Inbox
        </h2>
        <button
          type="button"
          onClick={() => void loadThreads()}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="grid gap-0 md:grid-cols-[20rem_1fr]">
        {/* Thread list */}
        <div className="max-h-[70vh] overflow-y-auto border-b border-border md:border-b-0 md:border-r">
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
                  {t.unread > 0 && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 font-body text-[10px] font-bold text-background"
                      style={{ backgroundColor: GOLD }}
                    >
                      {t.unread}
                    </span>
                  )}
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

        {/* Conversation */}
        <div className="flex min-h-[50vh] flex-col">
          {!detail ? (
            <p className="px-4 py-6 font-body text-sm text-muted-foreground">
              {activeId ? "Loading…" : "Select a conversation."}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-body text-sm font-semibold text-foreground">
                    {detail.thread.name || detail.thread.email}
                  </p>
                  <p className="truncate font-body text-xs text-muted-foreground">{detail.thread.email}</p>
                </div>
                <div className="flex items-center gap-2">
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
                      <p className="mb-1 font-body text-xs font-semibold text-foreground">{m.subject}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words font-body text-sm text-foreground/90">{m.body}</p>
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
