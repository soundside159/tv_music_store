import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Cookie } from "lucide-react";
import { getConsent, loadMetaPixel, setConsent } from "@/lib/metaPixel";

// Bottom consent panel for marketing cookies (Meta pixel).
// Covers the bottom of the page until the visitor chooses; Accept and Reject
// are both on the first layer (UK ICO: rejecting must be as easy as accepting).
// Not shown in the admin panel.
const CookieConsent = () => {
  const location = useLocation();
  const [choice, setChoice] = useState(getConsent());

  // Returning visitor who already accepted: load the pixel on first render.
  useEffect(() => {
    if (choice === "granted") loadMetaPixel();
  }, [choice]);

  if (choice !== null) return null;
  if (/^\/admin(\/|$)/.test(location.pathname)) return null;

  const decide = (value: "granted" | "denied") => {
    setConsent(value);
    setChoice(value);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-border bg-card/95 shadow-2xl backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between md:py-8">
        <div className="flex min-w-0 items-start gap-3">
          <Cookie className="mt-0.5 h-6 w-6 shrink-0 text-[#F4C430]" />
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold text-foreground">We use cookies</p>
            <p className="mt-1 max-w-2xl font-body text-sm leading-6 text-muted-foreground">
              We'd like to use cookies to understand which of our ads bring music lovers here, so we
              can find more creators like you. The site works the same either way.{" "}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                Privacy policy
              </Link>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="flex-1 rounded-lg border border-border bg-background px-6 py-3 font-body text-sm font-semibold text-foreground transition-colors hover:border-foreground/40 md:flex-none"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="flex-1 rounded-lg bg-[#F4C430] px-8 py-3 font-body text-sm font-bold text-background transition-colors hover:bg-[#F4C430]/85 md:flex-none"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
