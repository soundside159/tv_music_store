import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { SectionHeading, SectionPanel } from "@/components/SectionHeading";

// Account -> Support. Free plan: contact email. Pro/Max (priority support): an
// internal ticket chat backed by /api/support (shows up in /admin -> Inbox with
// a PRO badge; admin replies appear here).

interface Msg {
  id: string;
  direction: "in" | "out";
  body: string | null;
  created_at: string;
}

const fmt = (s: string) => {
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
};

const SupportSection = () => {
  const [plan, setPlan] = useState<string | null>(null);
  const [contact, setContact] = useState("contact@tvmusicstore.com");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(contact);
      setCopied(true);
      toast.success("Email copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the address manually");
    }
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/support", { credentials: "include" });
      const d = (await r.json()) as { plan?: string; contact?: string; messages?: Msg[] };
      if (r.ok) {
        setPlan(d.plan ?? "free");
        if (d.contact) setContact(d.contact);
        setMessages(d.messages ?? []);
      } else {
        setPlan("free");
      }
    } catch {
      setPlan("free");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      });
      if (!r.ok) throw new Error();
      setText("");
      toast.success("Message sent to support");
      await load();
    } catch {
      toast.error("Could not send — try again");
    } finally {
      setSending(false);
    }
  };

  const isPaid = plan === "pro" || plan === "max";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Support</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          {isPaid
            ? "Priority support — message us here and we'll reply in this thread."
            : "Questions? We're happy to help."}
        </p>
      </div>

      {/* Contact card (always) */}
      <SectionPanel title="Contact">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <p className="font-body text-sm font-semibold text-foreground">Email us</p>
            <a href={`mailto:${contact}`} className="font-body text-sm text-[#F4C430] hover:underline">
              {contact}
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void copyEmail()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy email"}
        </button>
        </div>
      </SectionPanel>

      {/* Priority ticket chat (paid plans) */}
      {isPaid && (
        <div className="rounded-xl border border-border bg-card">
          <SectionHeading
            title="Your conversation"
            right={
              <span
                className="shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-background"
                style={{ backgroundColor: "#F4C430" }}
              >
                Priority
              </span>
            }
          />

          <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <p className="font-body text-sm text-muted-foreground">
                No messages yet. Send us anything — plan questions, licensing, claims — and we'll reply here.
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-xl border p-3 ${
                    m.direction === "in"
                      ? "ml-auto border-[#F4C430]/40 bg-[#F4C430]/10"
                      : "border-border bg-background/40"
                  }`}
                >
                  <p className="mb-1 font-body text-[11px] text-muted-foreground">
                    {m.direction === "in" ? "You" : "Support"} · {fmt(m.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words font-body text-sm text-foreground/90">{m.body}</p>
                </div>
              ))
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-border/60 p-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Type your message…"
              className="min-h-[3rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
            />
            <button
              type="button"
              disabled={sending || !text.trim()}
              onClick={() => void send()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F4C430] px-4 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportSection;
