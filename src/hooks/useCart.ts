import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { LicenseTierId } from "@/lib/licenses";
import { licenseTierById } from "@/lib/licenses";

// Client-side cart for one-time track licenses, persisted in localStorage.
// One line per track: adding the same track again replaces its license tier.

export interface CartItem {
  trackId: string;
  slug: string;
  title: string;
  artist: string;
  tier: LicenseTierId;
  cover?: string;
}

const STORAGE_KEY = "tvms_cart_v1";

const load = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i?.slug && licenseTierById(i.tier)) : [];
  } catch {
    return [];
  }
};

let items: CartItem[] = load();
const listeners = new Set<() => void>();

const commit = (next: CartItem[]) => {
  items = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable (private mode) — cart still works in memory
  }
  listeners.forEach((l) => l());
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Track info the global "Buy a license" popup needs. */
export interface BuyLicenseArgs {
  trackId: string;
  slug: string;
  title: string;
  artist: string;
  cover?: string;
}

/** Opens the global license picker (LicenseModal is mounted in App.tsx). */
export const openLicenseModal = (args: BuyLicenseArgs): void => {
  window.dispatchEvent(new CustomEvent("tvms:buy-license", { detail: args }));
};

export const addToCart = (item: CartItem): void => {
  const existing = items.find((i) => i.slug === item.slug);
  if (existing && existing.tier === item.tier) {
    toast(`"${item.title}" is already in your cart`);
    return;
  }
  commit([...items.filter((i) => i.slug !== item.slug), item]);
  toast.success(
    existing ? `License updated to ${item.tier}` : `"${item.title}" added to cart`,
  );
};

export const removeFromCart = (slug: string): void => {
  commit(items.filter((i) => i.slug !== slug));
};

export const setCartItemTier = (slug: string, tier: LicenseTierId): void => {
  commit(items.map((i) => (i.slug === slug ? { ...i, tier } : i)));
};

export const clearCart = (): void => {
  commit([]);
};

export const cartTotal = (list: CartItem[]): number =>
  list.reduce((sum, i) => sum + (licenseTierById(i.tier)?.price ?? 0), 0);

export const useCart = (): { items: CartItem[]; count: number; total: number } => {
  const snap = useSyncExternalStore(subscribe, () => items, () => items);
  return { items: snap, count: snap.length, total: cartTotal(snap) };
};
