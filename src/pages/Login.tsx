import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";

const Login = () => (
  <div className="min-h-screen bg-background text-foreground">
    <Navigation />
    <main className="flex min-h-screen items-center justify-center px-4 py-24">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card/40 p-8">
        <h1 className="font-display text-3xl font-semibold text-white">Sign in</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">Access your licenses and downloads.</p>
        <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
          <div>
            <label className="mb-1 block font-body text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              className="h-11 w-full rounded-lg border border-white/15 bg-background/50 px-3 font-body text-sm text-foreground outline-none transition-colors focus:border-[#FCD162]/70"
            />
          </div>
          <div>
            <label className="mb-1 block font-body text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="********"
              className="h-11 w-full rounded-lg border border-white/15 bg-background/50 px-3 font-body text-sm text-foreground outline-none transition-colors focus:border-[#FCD162]/70"
            />
          </div>
          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-[#FCD162] font-body text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>
        <p className="mt-4 text-center font-body text-xs text-muted-foreground">
          No account? <Link to="/login" className="text-[#FCD162] hover:underline">Create one</Link>
        </p>
      </div>
    </main>
  </div>
);

export default Login;
