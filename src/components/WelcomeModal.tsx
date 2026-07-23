import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Download, FileText, Music4, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { refreshSession, useAuthSession } from "@/hooks/useAuth";

// "Welcome to Pro/Max" — shown once, right after Stripe sends the customer back
// to /account?checkout=success. It is our own layout (gold rail + perk grid),
// not a copy of anyone's. The plan name arrives with the webhook, so we poll
// /api/me for a few seconds instead of guessing.

const GOLD = "#F4C430";
const CREDIT = "Music from tvmusicstore.com";

const PLAN_NAME: Record<string, string> = { pro: "Pro", max: "Max" };

// Per-plan perks — must match the Compare-plans table on /pricing:
//   Pro  = unlimited downloads, MP3 320, personal/creator use (teams ≤5).
//   Max  = adds lossless WAV + stems and full commercial licensing.
const perksFor = (plan: string) =>
  plan === "max"
    ? [
        { icon: Download, title: "Unlimited downloads", body: "No counter, no daily cap." },
        { icon: Music4, title: "WAV, 320 kbps & stems", body: "Studio masters, not previews." },
        { icon: ShieldCheck, title: "Commercial license", body: "Clients, paid ads, sponsored content, brands." },
        { icon: FileText, title: "PDF certificate per track", body: "In Account → Licenses." },
      ]
    : [
        { icon: Download, title: "Unlimited downloads", body: "No counter, no daily cap." },
        { icon: Music4, title: "MP3 320 kbps", body: "High-quality MP3 for every track." },
        { icon: ShieldCheck, title: "Personal & creator license", body: "Your videos, social, YouTube, podcasts. Teams up to 5." },
        { icon: FileText, title: "PDF certificate per track", body: "In Account → Licenses." },
      ];

const WelcomeModal = () => {
  const navigate = useNavigate();
  const { subscription } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const polling = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    // Clean the URL so a refresh doesn't reopen the modal.
    params.delete("checkout");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    setOpen(true);

    // The Stripe webhook may land a second after the redirect — poll briefly.
    if (polling.current) return;
    polling.current = true;
    let tries = 0;
    const tick = () => {
      tries += 1;
      void refreshSession();
      if (tries < 6) window.setTimeout(tick, 1500);
    };
    tick();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);
  const planName = PLAN_NAME[subscription?.plan ?? ""] ?? "";
  const activePerks = perksFor(subscription?.plan ?? "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CREDIT);
      setCopied(true);
      toast.success("Credit line copied");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome"
    >
      <div
        className="my-8 flex w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* our signature: a solid gold rail down the left edge */}
        <div className="w-1.5 shrink-0" style={{ backgroundColor: GOLD }} />

        <div className="min-w-0 flex-1 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p
                className="font-body text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: GOLD }}
              >
                Subscription active
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-semibold text-foreground sm:text-3xl">
                Welcome to {planName || "the club"}
              </h2>
              <p className="mt-1.5 font-body text-sm text-muted-foreground">
                Your plan is live. Everything below is unlocked from this moment.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {activePerks.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-border/60 bg-background/40 p-3.5"
              >
                <Icon className="h-4 w-4" style={{ color: GOLD }} />
                <p className="mt-2 font-body text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 font-body text-xs leading-5 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>

          <div
            className="mt-5 rounded-xl border p-4"
            style={{ borderColor: "rgba(244,196,48,0.35)", backgroundColor: "rgba(244,196,48,0.06)" }}
          >
            <p className="font-body text-sm font-semibold text-foreground">
              Credit is optional now — but it means a lot to us.
            </p>
            <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
              Add one line in your description and you help a small store and the composer behind the
              track. Thank you.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background/60 px-3 py-2 font-body text-xs text-muted-foreground">
                {CREDIT}
              </code>
              <button
                type="button"
                onClick={() => void copy()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                close();
                navigate("/catalog");
              }}
              className="flex-1 rounded-lg bg-[#F4C430] py-3 font-body text-sm font-bold text-background transition-colors hover:bg-[#F4C430]/85"
            >
              Start downloading
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                navigate("/account?section=license");
              }}
              className="flex-1 rounded-lg border border-border py-3 font-body text-sm font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
            >
              My licenses
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
