import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { loginWithPassword, registerWithPassword } from "@/hooks/useAuth";

const inputClass =
  "h-11 w-full rounded-lg border border-white/15 bg-background/50 px-3 font-body text-sm text-foreground outline-none transition-colors focus:border-[#F4C430]/70";

const labelClass =
  "mb-1 block font-body text-xs font-medium uppercase tracking-wide text-muted-foreground";

const Login = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === "signin"
        ? await loginWithPassword(email.trim(), password)
        : await registerWithPassword(email.trim(), password, name.trim() || undefined);
    setBusy(false);
    if (res.ok) navigate("/account");
    else setError(res.error ?? "Something went wrong");
  };

  const switchMode = (next: "signin" | "signup") => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card/40 p-8">
          <h1 className="font-display text-3xl font-semibold text-white">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            {mode === "signin"
              ? "Access your downloads, licenses and billing."
              : "Free plan included — 3 downloads every month."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "signup" && (
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
                autoFocus
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
                placeholder={mode === "signup" ? "At least 8 characters" : "********"}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-lg bg-[#F4C430] font-body text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy
                ? mode === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          {error && (
            <p className="mt-4 text-center font-body text-xs text-red-400">{error}</p>
          )}

          <p className="mt-4 text-center font-body text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="text-[#F4C430] hover:underline"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="text-[#F4C430] hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
