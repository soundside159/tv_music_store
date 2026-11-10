import { useEffect } from "react";
import { Link } from "react-router-dom";
import { PROMO, promoActive } from "@/lib/promo";

// Thin gold strip above the main navigation while a promo runs.
// The strip sits inside the fixed nav, so the page body is pushed down by
// the same height to keep page content from hiding under it.
const PromoStrip = () => {
  const active = promoActive();
  useEffect(() => {
    if (!active) return;
    document.body.style.paddingTop = "2rem";
    return () => {
      document.body.style.paddingTop = "";
    };
  }, [active]);
  if (!active) return null;
  return (
    <Link
      to="/pricing"
      className="block h-8 bg-[#F4C430] px-3 text-center font-body text-xs leading-8 text-[#111] transition-opacity hover:opacity-90 sm:text-[13px]"
    >
      <span className="font-semibold">{PROMO.label}</span>
      <span className="hidden sm:inline"> · {PROMO.percent}% off annual plans with promo code </span>
      <span className="sm:hidden"> · {PROMO.percent}% off annual · </span>
      <span className="font-semibold">{PROMO.code}</span>
      <span className="hidden sm:inline"> · ends {PROMO.endsLabel} →</span>
    </Link>
  );
};

export default PromoStrip;
