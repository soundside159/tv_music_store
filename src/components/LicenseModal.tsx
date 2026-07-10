import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ShoppingCart, X } from "lucide-react";
import { useLicenseTiers, type LicenseTierId } from "@/lib/licenses";
import { addToCart, type BuyLicenseArgs } from "@/hooks/useCart";

// Global "Buy a license" popup. Any Buy-License button dispatches
// "tvms:buy-license" (see openLicenseModal) and this modal takes over: it shows
// the same one-time license tiers as the solo track page, then adds to cart.

const GOLD = "#F4C430";

const LicenseModal = () => {
  const [args, setArgs] = useState<BuyLicenseArgs | null>(null);
  const [selectedTier, setSelectedTier] = useState<LicenseTierId>("personal");
  // Live tier prices (admin-editable).
  const licenseTiers = useLicenseTiers();

  useEffect(() => {
    const open = (event: Event) => {
      setArgs((event as CustomEvent<BuyLicenseArgs>).detail);
      setSelectedTier("personal");
    };
    window.addEventListener("tvms:buy-license", open);
    return () => window.removeEventListener("tvms:buy-license", open);
  }, []);

  useEffect(() => {
    if (!args) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArgs(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [args]);

  if (!args) return null;

  const tier = licenseTiers.find((t) => t.id === selectedTier) ?? licenseTiers[0];
  const close = () => setArgs(null);

  const add = () => {
    addToCart({
      trackId: args.trackId,
      slug: args.slug,
      title: args.title,
      artist: args.artist,
      tier: selectedTier,
      cover: args.cover,
    });
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Buy a license"
    >
      <div
        className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl text-foreground">License this track</h2>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Own {args.title ? <span className="text-foreground">“{args.title}”</span> : "this track"} forever with a signed PDF certificate — for client work, broadcast and contracts.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {licenseTiers.map((t) => {
            const active = t.id === selectedTier;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTier(t.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-[#F4C430] bg-[#F4C430]/10"
                    : "border-border bg-background/40 hover:border-[#F4C430]/50"
                }`}
              >
                <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.name}
                </p>
                <p className="mt-1.5 font-body text-2xl font-semibold text-foreground">${t.price}</p>
                <p className="mt-1 font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t.formats}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-6 border-t border-border/60 pt-5">
          <p className="font-body text-sm font-semibold text-foreground">Usage Terms</p>
          <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {tier.usageTerms.map((term) => (
              <li key={term} className="flex items-center gap-2.5 font-body text-sm text-muted-foreground">
                <Check className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                {term}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-5">
          <span className="font-body text-3xl font-semibold text-foreground">${tier.price}</span>
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-2 rounded-lg bg-[#F4C430] px-6 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
          >
            <ShoppingCart className="h-4 w-4" />
            Add to Cart
          </button>
        </div>
        <p className="mt-3 font-body text-xs text-muted-foreground">
          Unlimited downloads for subscribers —{" "}
          <Link to="/pricing" onClick={close} className="font-semibold text-[#F4C430] hover:underline">
            see plans
          </Link>
          .
        </p>
      </div>
    </div>
  );
};

export default LicenseModal;
