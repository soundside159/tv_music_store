import { useSyncExternalStore } from "react";
import { toast } from "sonner";

// Client store for the user's favourite tracks, backed by /api/favourites.
// Optimistic toggles; a 401 (guest) reverts and opens the auth modal.

let ids = new Set<string>();
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const load = () => {
  fetch("/api/favourites", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { trackIds: [] }))
    .then((d: { trackIds?: string[] }) => {
      ids = new Set(d.trackIds ?? []);
      loaded = true;
      emit();
    })
    .catch(() => {
      loaded = true;
    });
};

export const refreshFavourites = () => load();

export const toggleFavourite = async (trackId: string): Promise<void> => {
  const had = ids.has(trackId);
  const next = new Set(ids);
  if (had) next.delete(trackId);
  else next.add(trackId);
  ids = next;
  emit();

  const revert = () => {
    const r = new Set(ids);
    if (had) r.add(trackId);
    else r.delete(trackId);
    ids = r;
    emit();
  };

  try {
    const res = had
      ? await fetch(`/api/favourites?trackId=${encodeURIComponent(trackId)}`, {
          method: "DELETE",
          credentials: "include",
        })
      : await fetch("/api/favourites", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trackId }),
        });
    if (res.status === 401) {
      revert();
      window.dispatchEvent(new Event("tvms:open-auth"));
      toast("Sign in to save favourites");
      return;
    }
    if (!res.ok) throw new Error();
  } catch {
    revert();
    toast.error("Couldn't update favourites — try again");
  }
};

const subscribe = (cb: () => void) => {
  if (!loaded && listeners.size === 0) load();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Reactive Set of the user's favourite track ids. */
export const useFavourites = (): Set<string> =>
  useSyncExternalStore(subscribe, () => ids, () => ids);
