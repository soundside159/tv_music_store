import { useEffect, useSyncExternalStore } from "react";
import type { Subscription, User } from "@/types/domain";

// ---------------------------------------------------------------------------
// Live auth session backed by /api/* (Cloudflare Pages Functions + D1).
// Module-level store so every component sees the same session state.
// While the session is unknown/absent, useMockData hooks fall back to the
// dev persona switcher — design previews keep working.
// ---------------------------------------------------------------------------

export interface AuthSession {
  /** null until the first /api/me response arrives */
  status: "loading" | "guest" | "authed";
  user: User | null;
  subscription: Subscription | null;
  downloadsUsedThisMonth: number;
}

let session: AuthSession = {
  status: "loading",
  user: null,
  subscription: null,
  downloadsUsedThisMonth: 0,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

interface ApiMeResponse {
  user: { id: string; email: string; name: string | null; role: string } | null;
  subscription?: {
    plan?: string;
    interval?: string | null;
    status?: string;
    current_period_end?: string | null;
  } | null;
  downloadsUsedThisMonth?: number;
}

const mapSession = (data: ApiMeResponse): AuthSession => {
  if (!data.user) {
    return { status: "guest", user: null, subscription: null, downloadsUsedThisMonth: 0 };
  }
  const u = data.user;
  const s = data.subscription;
  const user: User = {
    id: u.id,
    email: u.email,
    name: u.name ?? u.email.split("@")[0],
    role: (u.role as User["role"]) ?? "customer",
    createdAt: "",
  };
  const subscription: Subscription = {
    id: `live_${u.id}`,
    userId: u.id,
    plan: (s?.plan as Subscription["plan"]) ?? "free",
    interval: (s?.interval as Subscription["interval"]) ?? null,
    status: (s?.status as Subscription["status"]) ?? "active",
    currentPeriodEnd: s?.current_period_end ?? "",
    downloadsUsedThisPeriod: data.downloadsUsedThisMonth ?? 0,
  };
  return {
    status: "authed",
    user,
    subscription,
    downloadsUsedThisMonth: data.downloadsUsedThisMonth ?? 0,
  };
};

let refreshPromise: Promise<void> | null = null;

/** Fetch /api/me and update the shared session. Safe to call repeatedly. */
export const refreshSession = (): Promise<void> => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch("/api/me", { credentials: "include" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      session = mapSession((await res.json()) as ApiMeResponse);
    })
    .catch(() => {
      // API unreachable (local dev without functions) — treat as guest.
      session = { status: "guest", user: null, subscription: null, downloadsUsedThisMonth: 0 };
    })
    .finally(() => {
      refreshPromise = null;
      emit();
    });
  return refreshPromise;
};

export const requestLoginCode = async (email: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    return res.ok && data.ok ? { ok: true } : { ok: false, error: data.error ?? "Request failed" };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
};

export const verifyLoginCode = async (
  email: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, code }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Invalid code" };
    await refreshSession();
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
};

export const logout = async (): Promise<void> => {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // ignore network errors; clear local state regardless
  }
  session = { status: "guest", user: null, subscription: null, downloadsUsedThisMonth: 0 };
  emit();
};

let bootStarted = false;

/** Shared live session. Kicks off the initial /api/me fetch on first use. */
export const useAuthSession = (): AuthSession => {
  const snap = useSyncExternalStore(subscribe, () => session, () => session);
  useEffect(() => {
    if (!bootStarted) {
      bootStarted = true;
      void refreshSession();
    }
  }, []);
  return snap;
};
