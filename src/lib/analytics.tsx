import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Pageview beacon for the self-hosted analytics (Admin -> Analytics).
// Mounted once inside <BrowserRouter>: fires a POST /api/hit on every route
// change. No cookies, nothing stored in the browser — the server keeps only a
// daily-rotating visitor hash (see functions/api/hit.ts). document.referrer is
// sent with the FIRST hit only: on later in-app navigations it would just be
// our own domain, which the server discards anyway.
const RouteBeacon = () => {
  const location = useLocation();
  const first = useRef(true);

  useEffect(() => {
    const path = location.pathname;
    // The admin working on the site is not traffic; the server re-checks too.
    if (/^\/(admin|account|login)(\/|$)/.test(path)) {
      first.current = false;
      return;
    }
    const payload = JSON.stringify({ path, ref: first.current ? document.referrer : "" });
    first.current = false;
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
  }, [location.pathname]);

  return null;
};

export default RouteBeacon;
