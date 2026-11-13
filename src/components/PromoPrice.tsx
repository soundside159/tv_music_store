import { PROMO, licensePayPrice, money, promoActive } from "@/lib/promo";

// A license price: during the promo the old price is struck through, the new
// one is shown and (optionally) a small "Black Friday -20%" badge (13.11.2026).
const PromoPrice = ({
  base,
  className = "",
  badge = false,
}: {
  base: number;
  className?: string;
  badge?: boolean;
}) => {
  if (!promoActive()) return <span className={className}>${money(base)}</span>;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="font-body text-sm font-normal text-muted-foreground line-through">${money(base)}</span>
      <span className={className}>${money(licensePayPrice(base))}</span>
      {badge && (
        <span className="rounded-full bg-[#e5484d] px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-white">
          {PROMO.ribbon}
        </span>
      )}
    </span>
  );
};

export default PromoPrice;
