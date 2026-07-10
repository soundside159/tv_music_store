import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { requestLoginCode, verifyLoginCode } from "@/hooks/useAuth";

// Tunetank-style sign-in dialog: Google button + email -> single-use code.
// Opens from the account icon in the navigation when the visitor is a guest.

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

const inputClass =
  "h-12 w-full rounded-lg border border-white/15 bg-background/60 px-4 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[#F4C430]/70";

const AuthModal = ({ open, onClose }: AuthModalProps) => {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("email");
    setCode("");
    setError(null);
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { google?: string }) => setGoogleReady(!!h.google && h.google !== "missing"))
      .catch(() => setGoogleReady(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestLoginCode(email.trim());
    setBusy(false);
    if (res.ok) setStep("code");
    else setError(res.error ?? "Something went wrong");
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await verifyLoginCode(email.trim(), code.trim());
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? "Invalid code");
  };

  // Portal to <body>: the fixed navbar uses backdrop-blur, which would trap
  // this fixed overlay inside it and pin the dialog to the top of the screen.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-card p-8 shadow-2xl sm:p-10">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-center font-body text-xs font-semibold uppercase tracking-[0.28em] text-[#F4C430]">
          TV Music Store
        </p>
        <h2 className="mt-4 text-center font-display text-2xl font-semibold text-white sm:text-3xl">
          {step === "email" ? "Welcome to TV Music Store" : "Check your email"}
        </h2>
        <p className="mt-2 text-center font-body text-sm text-muted-foreground">
          {step === "email"
            ? "Sign up to download for free"
            : `We sent a 6-digit code to ${email}`}
        </p>

        {step === "email" ? (
          <div className="mt-8">
            {googleReady && (
              <>
                <a
                  href={`/api/auth/google?next=${encodeURIComponent(
                    window.location.pathname + window.location.search,
                  )}`}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-background/40 font-body text-sm font-medium text-foreground transition-colors hover:border-white/30"
                >
                  <GoogleIcon />
                  Continue with Google
                </a>
                <div className="my-6 flex items-center gap-4">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
              </>
            )}
            <form onSubmit={sendCode} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                className={inputClass}
              />
              {email.trim().length > 0 && (
                <button
                  type="submit"
                  disabled={busy}
                  className="h-12 w-full rounded-lg bg-[#F4C430] font-body text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Sending..." : "Send Code"}
                </button>
              )}
            </form>
            <p className="mt-4 text-center font-body text-[11px] leading-relaxed text-muted-foreground/70">
              By creating an account you agree to receive occasional emails from TV Music Store. You
              can unsubscribe anytime.
            </p>
          </div>
        ) : (
          <form onSubmit={submitCode} className="mt-8 space-y-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className={`${inputClass} text-center text-lg tracking-[0.5em]`}
            />
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="h-12 w-full rounded-lg bg-[#F4C430] font-body text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Checking..." : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="w-full py-1 font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Use a different email or resend the code
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-center font-body text-xs text-red-400">{error}</p>}

        {step === "email" && (
          <p className="mt-6 text-center font-body text-xs text-muted-foreground">
            By continuing you agree to our{" "}
            <a href="/license-terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Terms of Use</a> and{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Privacy Policy</a>
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default AuthModal;
