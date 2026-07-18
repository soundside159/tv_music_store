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

// The last confirmed sign-in, remembered across reloads. Without it a cold
// load renders the GUEST header icon for a beat and then flips to the avatar
// once /api/me answers — the owner filmed it frame by frame. The hint paints
// the avatar immediately; /api/me still has the final word (a session revoked
// elsewhere corrects itself on the first response).
const HINT_KEY = "tvms:session-hint";

interface SessionHint {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan: string;
}

const readHintSession = (): AuthSession | null => {
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as SessionHint;
    if (!h?.email || !h?.id) return null;
    const role = (h.role as User["role"]) ?? "customer";
    const plan = (role === "admin" ? "max" : h.plan || "free") as Subscription["plan"];
    return {
      status: "authed",
      user: {
        id: h.id,
        email: h.email,
        name: h.name ?? h.email.split("@")[0],
        role,
        createdAt: "",
      },
      subscription: {
        id: `hint_${h.id}`,
        userId: h.id,
        plan,
        interval: null,
        status: "active",
        currentPeriodEnd: "",
        downloadsUsedThisPeriod: 0,
      },
      downloadsUsedThisMonth: 0,
    };
  } catch {
    return null;
  }
};

const writeHint = (s: AuthSession) => {
  try {
    if (s.status === "authed" && s.user) {
      const h: SessionHint = {
        id: s.user.id,
        email: s.user.email,
        name: s.user.name,
        role: s.user.role,
        plan: s.subscription?.plan ?? "free",
      };
      window.localStorage.setItem(HINT_KEY, JSON.stringify(h));
    } else {
      window.localStorage.removeItem(HINT_KEY);
    }
  } catch {
    // storage unavailable — the hint is only a nicety
  }
};

let session: AuthSession = readHintSession() ?? {
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
  // Admins get Max-level access without a subscription — the same rule the
  // server applies in /api/download, so every plan gate in the UI (formats,
  // PDF certificate, download limit) matches what the API will actually do.
  // Account → Plan & Billing shows this as "Admin access", not a fake plan.
  const isAdmin = user.role === "admin";
  const subscription: Subscription = {
    id: `live_${u.id}`,
    userId: u.id,
    plan: isAdmin ? "max" : ((s?.plan as Subscription["plan"]) ?? "free"),
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
      writeHint(session);
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

const passwordCall = async (
  path: string,
  payload: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Request failed" };
    await refreshSession();
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
};

export const loginWithPassword = (email: string, password: string) =>
  passwordCall("/api/auth/login", { email, password });

export const registerWithPassword = (email: string, password: string, name?: string) =>
  passwordCall("/api/auth/register", name ? { email, password, name } : { email, password });

/** Update the display name of the signed-in user. */
export const updateProfile = async (name: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Update failed" };
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
  writeHint(session);
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
