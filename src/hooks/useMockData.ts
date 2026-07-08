import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type {
  Composer,
  DownloadLogEntry,
  Persona,
  PersonaId,
  PlanConfig,
  Subscription,
  User,
} from "@/types/domain";
import {
  mockComposers,
  mockDownloadLog,
  mockPersonas,
  mockPlans,
  mockSyncOrders,
} from "@/mocks";
import { useAuthSession } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Persona switching (design-first): the owner can preview the site as any
// user state. Persisted in localStorage; later replaced by real auth session.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "tvms.mockPersona";
const listeners = new Set<() => void>();

const getPersonaId = (): PersonaId => {
  try {
    // Personas are a design-preview tool. They only apply while dev mode is
    // ON (?dev=1). Without it every visitor is a plain guest — no fake users.
    if (localStorage.getItem("tvms.dev") !== "1") return "guest";
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && mockPersonas.some((p) => p.id === raw)) return raw as PersonaId;
  } catch {
    // SSR / storage unavailable — fall through to default
  }
  return "guest";
};

export const setMockPersona = (id: PersonaId) => {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const useMockPersona = (): Persona => {
  const personaId = useSyncExternalStore(subscribe, getPersonaId, () => "guest" as PersonaId);
  return mockPersonas.find((p) => p.id === personaId) ?? mockPersonas[0];
};

// ---------------------------------------------------------------------------
// Data hooks — the ONLY way components read domain data.
// Swap the internals for API calls later; signatures stay stable.
// ---------------------------------------------------------------------------

// Live session (real auth via /api/me) wins over the dev persona switcher.
// While /api/me is loading or returns guest, personas keep powering previews.

export const useCurrentUser = (): User | null => {
  const live = useAuthSession();
  const persona = useMockPersona();
  return live.status === "authed" ? live.user : persona.user;
};

/** Composer profile of the current user, if they are a composer (admin previews as cmp_1). */
export const useComposer = (): Composer | null => {
  const user = useCurrentUser();
  if (!user) return null;
  if (user.role === "admin") return mockComposers[0];
  return mockComposers.find((c) => c.userId === user.id) ?? null;
};

export const useSubscription = (): Subscription | null => {
  const live = useAuthSession();
  const persona = useMockPersona();
  return live.status === "authed" ? live.subscription : persona.subscription;
};

export const usePlans = (): PlanConfig[] => mockPlans;

/** Downloads visible to the current user (their own history). */
export const useMyDownloads = (): DownloadLogEntry[] => {
  const live = useAuthSession();
  const user = useCurrentUser();
  const [liveRows, setLiveRows] = useState<DownloadLogEntry[]>([]);

  useEffect(() => {
    if (live.status !== "authed" || !live.user) return;
    let cancelled = false;
    fetch("/api/downloads", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { downloads?: Omit<DownloadLogEntry, "userId">[] };
        if (!cancelled && data.downloads) {
          setLiveRows(
            data.downloads.map((d) => ({ ...d, userId: live.user?.id ?? "" }) as DownloadLogEntry),
          );
        }
      })
      .catch(() => {
        // API unreachable — history simply stays empty
      });
    return () => {
      cancelled = true;
    };
  }, [live.status, live.user]);

  if (live.status === "authed") return liveRows;
  return user
    ? mockDownloadLog
        .filter((d) => d.userId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
};

/** One-time sync license purchase, as shown in Account -> Licenses. */
export interface LicenseEntry {
  id: string;
  trackId: string;
  trackTitle?: string;
  /** Current slug of the track (for download/track links); absent if the track row is gone. */
  trackSlug?: string;
  tier: string;
  price: number;
  hasPdf?: boolean;
  createdAt: string;
}

/** The current user's one-time sync licenses (live sync_orders, mock fallback). */
export const useMyLicenses = (): LicenseEntry[] => {
  const live = useAuthSession();
  const user = useCurrentUser();
  const [liveRows, setLiveRows] = useState<LicenseEntry[]>([]);

  useEffect(() => {
    if (live.status !== "authed" || !live.user) return;
    let cancelled = false;
    fetch("/api/licenses", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { licenses?: LicenseEntry[] };
        if (!cancelled && data.licenses) setLiveRows(data.licenses);
      })
      .catch(() => {
        // API unreachable — list simply stays empty
      });
    return () => {
      cancelled = true;
    };
  }, [live.status, live.user]);

  if (live.status === "authed") return liveRows;
  return user
    ? mockSyncOrders
        .filter((o) => o.userId === user.id)
        .map((o) => ({
          id: o.id,
          trackId: o.trackId,
          tier: o.tier,
          price: o.price,
          createdAt: o.createdAt,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
};

/** Remaining MP3 downloads in the current period, or null if unlimited. */
export const useDownloadsRemaining = (): number | null => {
  const sub = useSubscription();
  const plans = usePlans();
  const getRemaining = useCallback(() => {
    if (!sub) return 0;
    const plan = plans.find((p) => p.id === sub.plan);
    if (!plan || plan.downloadLimit === null) return null;
    return Math.max(0, plan.downloadLimit - sub.downloadsUsedThisPeriod);
  }, [sub, plans]);
  return getRemaining();
};
