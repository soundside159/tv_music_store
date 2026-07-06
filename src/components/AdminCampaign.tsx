import { useState } from "react";

// Admin "Campaigns" — send a marketing email to newsletter subscribers,
// optionally narrowed to a taste tag (genre/mood/use-case from the CRM).
// Every email includes an unsubscribe link (handled server-side).

type Result = { sent: number; failed: number; recipients: number; capped?: boolean };

const AdminCampaign = () => {
  const [useTag, setUseTag] = useState(false);
  const [tag, setTag] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const payload = () => ({ subject, body, tag: useTag ? tag.trim() : "" });

  const preview = async () => {
    setBusy("preview");
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/admin/campaign", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload(), preview: true }),
      });
      const d = (await r.json()) as { count?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setCount(d.count ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!window.confirm(`Send this campaign to ${count ?? "the selected"} subscribers?`)) return;
    setBusy("send");
    setError(null);
    try {
      const r = await fetch("/api/admin/campaign", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const d = (await r.json()) as Result & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Failed to send");
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBusy(null);
    }
  };

  const input =
    "w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";

  return (
    <div className="max-w-2xl rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg text-foreground">Send a campaign</h2>
      <p className="mb-5 mt-1 font-body text-xs text-muted-foreground">
        Emails go to newsletter subscribers only, each with an unsubscribe link. Optionally target
        people whose taste (downloads/purchases) matches a genre, mood, or use-case.
      </p>

      <label className="mb-4 flex items-center gap-2 font-body text-sm text-foreground">
        <input type="checkbox" checked={useTag} onChange={(e) => { setUseTag(e.target.checked); setCount(null); }} />
        Target by taste tag
      </label>
      {useTag && (
        <input
          value={tag}
          onChange={(e) => { setTag(e.target.value); setCount(null); }}
          placeholder="e.g. Epic, Trailer, Uplifting"
          className={`${input} mb-4`}
        />
      )}

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject line"
        className={`${input} mb-3`}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder={"Write your message. Blank lines start new paragraphs.\n\nA “Listen now” button and unsubscribe link are added automatically."}
        className={`${input} mb-4 resize-y`}
      />

      {error && <p className="mb-3 font-body text-sm text-red-400">{error}</p>}

      {count !== null && !result && (
        <p className="mb-3 font-body text-sm text-muted-foreground">
          Audience: <span className="text-foreground">{count}</span> subscriber{count === 1 ? "" : "s"}.
          {count > 300 && " Only the first 300 will be sent (batching for larger lists is a future step)."}
        </p>
      )}

      {result && (
        <p className="mb-3 font-body text-sm text-[#F4C430]">
          Sent to {result.sent} of {result.recipients}
          {result.failed ? ` (${result.failed} failed)` : ""}.
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={preview}
          disabled={busy !== null}
          className="rounded-lg border border-border px-4 py-2 font-body text-sm text-foreground hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-50"
        >
          {busy === "preview" ? "Checking..." : "Preview count"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy !== null || !subject.trim() || !body.trim() || count === null || count === 0}
          className="rounded-lg bg-[#F4C430] px-5 py-2 font-body text-sm font-semibold text-background hover:bg-[#F4C430]/85 disabled:opacity-50"
        >
          {busy === "send" ? "Sending..." : "Send campaign"}
        </button>
      </div>
      <p className="mt-2 font-body text-xs text-muted-foreground">Run "Preview count" first to enable sending.</p>
    </div>
  );
};

export default AdminCampaign;
