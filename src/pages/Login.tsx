import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import {
  loginWithPassword,
  registerWithPassword,
  requestLoginCode,
  verifyLoginCode,
} from "@/hooks/useAuth";

const inputClass =
  "h-11 w-full rounded-lg border border-white/15 bg-background/50 px-3 font-body text-sm text-foreground outline-none transition-colors focus:border-[#F4C430]/70";

const labelClass =
  "mb-1 block font-body text-xs font-medium uppercase tracking-wide text-muted-foreground";

const buttonClass =
  "h-11 w-full rounded-lg bg-[#F4C430] font-body text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50";

type Mode = "code-email" | "code-verify" | "pw-signin" | "pw-signup";

const Login = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("code-email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, onOk: () => void) => {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (res.ok) onOk();
    else setError(res.error ?? "Something went wrong");
  };

  const heading =
    mode === "pw-signup" ? "Create account" : mode === "code-verify" ? "Check your email" : "Sign in";

  const sub =
    mode === "code-email"
      ? "Enter your email and we'll send you a single-use login code. New here? The same step creates your free account."
      : mode === "code-verify"
        ? `We sent a 6-digit code to ${email}. It expires in 10 minutes.`
        : mode === "pw-signin"
          ? "Sign in with your email and password."
          : "Free plan included — 3 downloads every month.";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card/40 p-8">
          <h1 className="font-display text-3xl font-semibold text-white">{heading}</h1>
          <p className="mt-2 font-body text-sm text-muted-foreground">{sub}</p>

          {mode === "code-email" && (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => requestLoginCode(email.trim()), () => go("code-verify"));
              }}
            >
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={busy} className={buttonClass}>
                {busy ? "Sending..." : "Continue with email"}
              </button>
            </form>
          )}

          {mode === "code-verify" && (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => verifyLoginCode(email.trim(), code.trim()),
                  () => navigate("/account"),
                );
              }}
            >
              <div>
                <label className={labelClass}>Login code</label>
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
              <button type="submit" disabled={busy || code.length !== 6} className={buttonClass}>
                {busy ? "Checking..." : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCode("");
                  go("code-email");
                }}
                className="w-full font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Use a different email or resend the code
              </button>
            </form>
          )}

          {(mode === "pw-signin" || mode === "pw-signup") && (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    mode === "pw-signin"
                      ? loginWithPassword(email.trim(), password)
                      : registerWithPassword(email.trim(), password, name.trim() || undefined),
                  () => navigate("/account"),
                );
              }}
            >
              {mode === "pw-signup" && (
                <div>
                  <label className={labelClass}>Name (optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name or studio"
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "pw-signup" ? "At least 8 characters" : "********"}
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={busy} className={buttonClass}>
                {busy
                  ? "Working..."
                  : mode === "pw-signin"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>
          )}

          {error && <p className="mt-4 text-center font-body text-xs text-red-400">{error}</p>}

          <div className="mt-5 space-y-1.5 text-center font-body text-xs text-muted-foreground">
            {mode === "code-email" && (
              <p>
                Prefer a password?{" "}
                <button type="button" onClick={() => go("pw-signin")} className="text-[#F4C430] hover:underline">
                  Sign in with password
                </button>
              </p>
            )}
            {mode === "pw-signin" && (
              <>
                <p>
                  <button type="button" onClick={() => go("code-email")} className="text-[#F4C430] hover:underline">
                    Sign in with an email code instead
                  </button>
                </p>
                <p>
                  No account?{" "}
                  <button type="button" onClick={() => go("pw-signup")} className="text-[#F4C430] hover:underline">
                    Create one
                  </button>
                </p>
              </>
            )}
            {mode === "pw-signup" && (
              <p>
                Already have an account?{" "}
                <button type="button" onClick={() => go("pw-signin")} className="text-[#F4C430] hover:underline">
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
