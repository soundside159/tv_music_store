import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CreditCard, Music, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { licenseTierById, useLicenseTiers, type LicenseTierId } from "@/lib/licenses";
import { clearCart, removeFromCart, setCartItemTier, useCart } from "@/hooks/useCart";

const GOLD = "#F4C430";

// PayPal JS SDK global (loaded on demand).
interface PayPalButtonsConfig {
  style?: Record<string, string | number>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError?: (err: unknown) => void;
}
declare global {
  interface Window {
    paypal?: { Buttons: (config: PayPalButtonsConfig) => { render: (el: HTMLElement) => void } };
  }
}

const post = async (path: string, body: unknown) => {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    id?: string;
    url?: string;
    error?: string;
    code?: string;
  };
  return { ...data, status: res.status };
};

/** Reads the cart at click time (it may have changed since render). */
const cartItemsNow = (): { slug: string; tier: string }[] => {
  const raw = localStorage.getItem("tvms_cart_v1");
  return (raw ? (JSON.parse(raw) as { slug: string; tier: string }[]) : []).map((i) => ({
    slug: i.slug,
    tier: i.tier,
  }));
};

/** "Pay with card" — redirects to a Stripe Checkout page for the cart. */
const CardCheckout = ({ disabled }: { disabled: boolean }) => {
  const [busy, setBusy] = useState(false);

  const payWithCard = async () => {
    setBusy(true);
    try {
      const res = await post("/api/stripe/checkout-licenses", { items: cartItemsNow() });
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("tvms:open-auth"));
        return;
      }
      if (!res.url) {
        toast.error(res.error ?? "Card checkout is not available right now — try PayPal below.");
        return;
      }
      window.location.href = res.url;
    } catch {
      toast.error("Could not start card checkout. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={payWithCard}
      disabled={disabled || busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F4C430] px-6 py-3 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:pointer-events-none disabled:opacity-50"
    >
      <CreditCard className="h-4 w-4" />
      {busy ? "Opening secure checkout..." : "Pay with card"}
    </button>
  );
};

/** PayPal buttons; renders a notice while payments are not configured. */
const PayPalCheckout = ({ disabled }: { disabled: boolean }) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "unavailable" | "ready">("loading");
  const renderedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/paypal/config", { credentials: "include" })
      .then(async (res) => {
        const cfg = (await res.json()) as { configured?: boolean; clientId?: string };
        if (cancelled) return;
        if (!cfg.configured || !cfg.clientId) {
          setState("unavailable");
          return;
        }
        if (window.paypal) {
          setState("ready");
          return;
        }
        const script = document.createElement("script");
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&currency=USD&intent=capture`;
        script.onload = () => !cancelled && setState("ready");
        script.onerror = () => !cancelled && setState("unavailable");
        document.head.appendChild(script);
      })
      .catch(() => !cancelled && setState("unavailable"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== "ready" || disabled || !window.paypal || !containerRef.current) return;
    if (renderedRef.current) return;
    renderedRef.current = true;

    window.paypal
      .Buttons({
        style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },
        createOrder: async () => {
          const res = await post("/api/paypal/order", { items: cartItemsNow() });
          if (res.status === 401) {
            window.dispatchEvent(new CustomEvent("tvms:open-auth"));
            throw new Error("Sign in to buy licenses");
          }
          if (!res.id) throw new Error(res.error ?? "Could not start checkout");
          return res.id;
        },
        onApprove: async (data) => {
          const res = await post("/api/paypal/capture", { orderId: data.orderID });
          if (!res.ok) {
            toast.error(res.error ?? "Payment failed — you were not charged twice, contact us");
            return;
          }
          clearCart();
          toast.success("Payment complete! Your licenses are in your account.");
          navigate("/account?purchase=success");
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Checkout error. Try again.";
          toast.error(msg);
        },
      })
      .render(containerRef.current);
  }, [state, disabled, navigate]);

  if (state === "unavailable") {
    return (
      <div className="rounded-lg border border-border/70 bg-background/60 p-4 font-body text-xs text-muted-foreground">
        Checkout is being set up and will be enabled shortly. In the meantime you can preview every
        track and download with a{" "}
        <Link to="/login" className="font-semibold text-[#F4C430] hover:underline">
          free account
        </Link>
        . Need this license now? Email{" "}
        <a href="mailto:contact@tvmusicstore.com" className="font-semibold text-[#F4C430] hover:underline">
          contact@tvmusicstore.com
        </a>
        .
      </div>
    );
  }

  return (
    <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      {state === "loading" && (
        <p className="py-2 text-center font-body text-xs text-muted-foreground">Loading checkout...</p>
      )}
      <div ref={containerRef} />
    </div>
  );
};

const Cart = () => {
  const { items, count, total } = useCart();
  // Live tier prices (admin-editable) — re-renders when they hydrate/change.
  const liveTiers = useLicenseTiers();
  const navigate = useNavigate();

  // Back from Stripe Checkout: ?checkout=success (paid — webhook is recording
  // the licenses) or ?checkout=canceled (nothing charged, cart untouched).
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("checkout");
    if (outcome === "success") {
      clearCart();
      toast.success("Payment complete! Your licenses are in your account.");
      navigate("/account?purchase=success", { replace: true });
    } else if (outcome === "canceled") {
      toast("Checkout canceled — your cart is unchanged.");
      navigate("/cart", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <h1 className="text-3xl text-foreground md:text-4xl">Cart</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          {count === 0 ? "Your cart is empty" : `${count} item${count > 1 ? "s" : ""} ready for checkout`}
        </p>

        {count === 0 ? (
          <div className="mt-10 rounded-xl border border-border bg-card p-10 text-center">
            <Music className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-4 font-body text-sm text-muted-foreground">
              Find a track in the catalog and pick a license — it will appear here.
            </p>
            <Link
              to="/catalog"
              className="mt-6 inline-block rounded-lg bg-[#F4C430] px-6 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
            >
              Browse catalog
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            {/* Items */}
            <div className="flex flex-col gap-4">
              {items.map((item) => {
                const tier = licenseTierById(item.tier);
                return (
                  <div
                    key={item.slug}
                    className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4"
                  >
                    <Link
                      to={`/track/${item.slug}`}
                      className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br from-secondary to-background"
                      aria-label={item.title}
                    >
                      {item.cover ? (
                        <img src={item.cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Music className="h-6 w-6 text-[#F4C430]/70" />
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/track/${item.slug}`}
                        className="block truncate font-body text-sm font-semibold text-foreground transition-colors hover:text-[#F4C430]"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-0.5 truncate font-body text-xs text-muted-foreground">
                        by {item.artist}
                      </p>
                      <select
                        value={item.tier}
                        onChange={(e) => setCartItemTier(item.slug, e.target.value as LicenseTierId)}
                        className="mt-2 rounded-lg border border-border bg-background px-2.5 py-1.5 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
                        aria-label="License tier"
                      >
                        {liveTiers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} license — ${t.price}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="font-body text-base font-semibold text-foreground">
                        ${tier?.price ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.slug)}
                        className="inline-flex items-center gap-1 font-body text-xs text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <aside className="h-fit rounded-xl border border-border bg-card p-6">
              <h2 className="font-body text-lg font-semibold text-foreground">Order summary</h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {items.map((item) => (
                  <li key={item.slug} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-body text-sm text-foreground">
                        {item.title}
                      </span>
                      <span className="block font-body text-xs capitalize text-muted-foreground">
                        {item.tier} license
                      </span>
                    </span>
                    <span className="shrink-0 font-body text-sm text-foreground">
                      ${licenseTierById(item.tier)?.price ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
                <span className="font-body text-sm text-muted-foreground">Subtotal</span>
                <span className="font-body text-sm text-foreground">${total}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-body text-base font-semibold text-foreground">Total</span>
                <span className="font-body text-xl font-semibold" style={{ color: GOLD }}>
                  ${total}
                </span>
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                Licenses are delivered to your account instantly after payment.
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <CardCheckout disabled={count === 0} />
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-border/70" />
                  <span className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                    or
                  </span>
                  <span className="h-px flex-1 bg-border/70" />
                </div>
                <PayPalCheckout disabled={count === 0} />
              </div>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Cart;
