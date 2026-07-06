import { useState } from "react";

// Opt-in newsletter capture. Posts to /api/newsletter. GDPR-friendly: the user
// submits their email intentionally; every campaign email carries an unsubscribe
// link.
const NewsletterSignup = ({ source = "footer" }: { source?: string }) => {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    setMessage("");
    try {
      const r = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Something went wrong.");
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  if (state === "done") {
    return (
      <p className="font-body text-sm text-[#F4C430]">
        Thanks — you're on the list. New tracks are on the way.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "busy" || !email.trim()}
          className="shrink-0 rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
        >
          {state === "busy" ? "..." : "Subscribe"}
        </button>
      </div>
      {state === "error" && <p className="font-body text-xs text-red-400">{message}</p>}
    </form>
  );
};

export default NewsletterSignup;
