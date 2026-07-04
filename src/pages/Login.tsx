import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { requestLoginCode, verifyLoginCode } from "@/hooks/useAuth";

const inputClass =
  "h-11 w-full rounded-lg border border-white/15 bg-background/50 px-3 font-body text-sm text-foreground outline-none transition-colors focus:border-[#F4C430]/70";

const Login = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestLoginCode(email.trim());
    setBusy(false);
    if (res.ok) setStep("code");
    else setError(res.error ?? "Something went wrong");
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await verifyLoginCode(email.trim(), code.trim());
    setBusy(false);
    if (res.ok) navigate("/account");
    else setError(res.error ?? "Invalid code");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card/40 p-8">
          <h1 className="font-display text-3xl font-semibold text-white">Sign in</h1>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            {step === "email"
              ? "Enter your email — we'll send you a 6-digit login code. No password needed."
              : `We sent a code to ${email}. Enter it below.`}
          </p>

          {step === "email" ? (
            <form className="mt-6 space-y-4" onSubmit={submitEmail}>
              <div>
                <label className="mb-1 block font-body text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="h-11 w-full rounded-lg bg-[#F4C430] font-body text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Sending..." : "Send code"}
              </button>
            </form>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={submitCode}>
              <div>
                <label className="mb-1 block font-body text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Login code
                </label>
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
              </div>
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="h-11 w-full rounded-lg bg-[#F4C430] font-body text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
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
                className="w-full font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Use a different email
              </button>
            </form>
          )}

          {error && (
            <p className="mt-4 text-center font-body text-xs text-red-400">{error}</p>
          )}

          <p className="mt-4 text-center font-body text-xs text-muted-foreground">
            New here? Signing in creates your free account automatically.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
