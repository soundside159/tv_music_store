// Tiny client for the self-hosted analytics beacon (/api/hit).
// - sendHit(): low-level POST that survives page navigation (sendBeacon).
// - trackEvent(): funnel steps (download, add_to_cart, checkout, purchase).
// - takeSourceTag(): reads the "?s=yt" style link tag from the landing URL once,
//   then removes it from the address bar so it is not copied along when the
//   visitor shares the page.

export type FunnelEvent = "download" | "add_to_cart" | "checkout" | "purchase";

export const sendHit = (body: Record<string, string>) => {
  const payload = JSON.stringify(body);
  try {
    if (!navigator.sendBeacon?.("/api/hit", new Blob([payload], { type: "application/json" }))) {
      void fetch("/api/hit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
        credentials: "include",
      });
    }
  } catch {
    // analytics must never break the page
  }
};

export const trackEvent = (event: FunnelEvent) => {
  sendHit({ path: window.location.pathname, event });
};

const TAG_PARAMS = ["s", "src", "ref", "utm_source", "utm_campaign", "utm_medium", "utm_content"];

/** "?s=yt" / "?ref=ig-reel-12" / utm_source(+utm_campaign) -> "yt", "ig-reel-12", "facebook-spring". */
export const takeSourceTag = (): string => {
  try {
    const url = new URL(window.location.href);
    const p = url.searchParams;
    let tag = p.get("s") || p.get("src") || p.get("ref") || "";
    if (!tag && p.get("utm_source")) {
      tag = [p.get("utm_source"), p.get("utm_campaign")].filter(Boolean).join("-");
    }
    let changed = false;
    for (const k of TAG_PARAMS) {
      if (p.has(k)) {
        p.delete(k);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    return tag
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  } catch {
    return "";
  }
};
