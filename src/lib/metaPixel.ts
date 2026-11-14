// Meta (Facebook/Instagram) pixel, loaded ONLY after the visitor accepts
// marketing cookies in the CookieConsent banner (UK GDPR / PECR).
// - getConsent()/setConsent(): the visitor's choice, kept in localStorage.
// - loadMetaPixel(): injects fbevents.js once, init + PageView. SPA route
//   changes are tracked by fbevents itself (history API).
// - metaTrack(): standard events (AddToCart, InitiateCheckout, Purchase...),
//   a no-op until the pixel is loaded.
// - flushSignupEvent(): the auth endpoints set a short-lived "tvms_signup"
//   cookie when a NEW account is created; we turn it into one
//   CompleteRegistration event, then clear it.

export const META_PIXEL_ID = "1337211998527581";
const CONSENT_KEY = "tvms_cookie_consent"; // "granted" | "denied"
const SIGNUP_COOKIE = "tvms_signup";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export type Consent = "granted" | "denied" | null;

export const getConsent = (): Consent => {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
};

let loaded = false;

export const loadMetaPixel = () => {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    if (!window.fbq) {
      const q: unknown[] = [];
      const f = function (...args: unknown[]) {
        if (f.callMethod) f.callMethod(...args);
        else q.push(args);
      } as Fbq;
      f.queue = q;
      f.push = f;
      f.loaded = true;
      f.version = "2.0";
      window.fbq = f;
      window._fbq = f;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
    }
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  } catch {
    // tracking must never break the page
  }
};

export const setConsent = (value: "granted" | "denied") => {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // private mode etc. - banner will just show again next visit
  }
  if (value === "granted") {
    loadMetaPixel();
    flushSignupEvent();
  } else {
    clearSignupCookie();
  }
};

export const metaTrack = (event: string, params?: Record<string, unknown>) => {
  if (!loaded || !window.fbq) return;
  try {
    if (params) window.fbq("track", event, params);
    else window.fbq("track", event);
  } catch {
    // ignore
  }
};

const clearSignupCookie = () => {
  document.cookie = `${SIGNUP_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
};

export const flushSignupEvent = () => {
  try {
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${SIGNUP_COOKIE}=`))) return;
    const consent = getConsent();
    if (consent === null) return; // wait for the banner choice (cookie lives 10 min)
    if (consent === "granted") {
      loadMetaPixel();
      metaTrack("CompleteRegistration");
    }
    clearSignupCookie();
  } catch {
    // ignore
  }
};
