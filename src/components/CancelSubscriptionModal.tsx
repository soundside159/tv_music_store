import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { openBillingPortal } from "@/lib/billing";

// "Before you cancel" popup — opened from the Cancel Subscription card in
// /account?section=billing. It lists what the customer loses, then hands off to
// the Stripe Billing Portal, where the cancellation itself happens.

const LOSES = [
  "Unlimited access to music and sound effects",
  "Premium-quality MP3 and WAV downloads",
  "Personal licensing for your projects",
  "Included PDF license certificates",
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Plan name shown in the heading copy, e.g. "Pro". */
  planName: string;
  /** Human date the benefits run until, e.g. "Aug 13, 2026". */
  until: string;
}

const CancelSubscriptionModal = ({ open, onClose, planName, until }: Props) => {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await openBillingPortal();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Before you cancel"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl text-foreground">Before you cancel</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 font-body text-sm text-muted-foreground">
          By ending your {planName} subscription, you'll lose:
        </p>

        <ul className="mt-4 flex flex-col gap-2.5">
          {LOSES.map((item) => (
            <li key={item} className="flex items-start gap-3 font-body text-sm text-foreground">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: "#F4C430" }}
              />
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-5 rounded-xl border border-border bg-background/50 p-3 font-body text-xs text-muted-foreground">
          If you cancel, your premium benefits stay active until {until}.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-[#F4C430] px-5 py-3 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
          >
            Keep my plan
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="flex-1 rounded-xl border border-border px-5 py-3 font-body text-sm font-semibold text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-60"
          >
            {busy ? "Opening…" : "Cancel subscription"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelSubscriptionModal;
