import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { sendHit, takeSourceTag } from "@/lib/trackEvent";

// Pageview beacon for the self-hosted analytics (Admin -> Analytics).
// Mounted once inside <BrowserRouter>: fires a POST /api/hit on every route
// change. No cookies, nothing stored in the browser — the server keeps only a
// daily-rotating visitor hash (see functions/api/hit.ts). document.referrer and
// the link tag ("?s=yt", see takeSourceTag) are sent with the FIRST hit only:
// that is the landing hit, so the tag tells which post/link brought the visit.
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
    const isFirst = first.current;
    first.current = false;
    sendHit({
      path,
      ref: isFirst ? document.referrer : "",
      src: isFirst ? takeSourceTag() : "",
    });
  }, [location.pathname]);

  return null;
};

export default RouteBeacon;
