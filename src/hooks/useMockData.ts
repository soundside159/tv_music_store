import { useCallback, useSyncExternalStore } from "react";
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
} from "@/mocks";

// ---------------------------------------------------------------------------
// Persona switching (design-first): the owner can preview the site as any
// user state. Persisted in localStorage; later replaced by real auth session.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "tvms.mockPersona";
const listeners = new Set<() => void>();

const getPersonaId = (): PersonaId => {
  try {
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

export const useCurrentUser = (): User | null => useMockPersona().user;

/** Composer profile of the current user, if they are a composer (admin previews as cmp_1). */
export const useComposer = (): Composer | null => {
  const user = useCurrentUser();
  if (!user) return null;
  if (user.role === "admin") return mockComposers[0];
  return mockComposers.find((c) => c.userId === user.id) ?? null;
};

export const useSubscription = (): Subscription | null => useMockPersona().subscription;

export const usePlans = (): PlanConfig[] => mockPlans;

/** Downloads visible to the current user (their own history). */
export const useMyDownloads = (): DownloadLogEntry[] => {
  const user = useCurrentUser();
  return user
    ? mockDownloadLog
        .filter((d) => d.userId === user.id)
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
