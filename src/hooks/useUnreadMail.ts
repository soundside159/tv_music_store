import { useEffect, useSyncExternalStore } from "react";

// Unread-inbox counter for ADMINS: the header envelope badge and the admin
// sidebar "Inbox" chip both read this one module store, so however many
// components mount, there is a single light poll of /api/admin/mail?unread=1
// (every 2 minutes + on tab focus). Call refreshUnreadMail() after anything
// that changes read state (opening a thread, mark read/archive/delete) so the
// badge drops immediately instead of on the next poll.

let unread = 0;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const fetchCount = async (): Promise<void> => {
  try {
    const res = await fetch("/api/admin/mail?unread=1", { credentials: "include" });
    if (!res.ok) return; // signed out / not an admin — keep whatever we had
    const data = (await res.json()) as { unread?: number };
    const next = data.unread ?? 0;
    if (next !== unread) {
      unread = next;
      emit();
    }
  } catch {
    // network hiccup — the next poll will catch up
  }
};

export const refreshUnreadMail = (): void => {
  void fetchCount();
};

const start = () => {
  if (started) return;
  started = true;
  void fetchCount();
  window.setInterval(() => void fetchCount(), 120_000);
  window.addEventListener("focus", () => void fetchCount());
};

/** Unread inbox threads (0 while not an admin). Pass enabled=false for
 *  non-admins — the poll never starts, guests cost nothing. */
export const useUnreadMail = (enabled: boolean): number => {
  const count = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => unread,
    () => 0,
  );
  useEffect(() => {
    if (enabled) start();
  }, [enabled]);
  return enabled ? count : 0;
};
