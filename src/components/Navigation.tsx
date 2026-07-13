import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, Search, ShoppingCart, User, X } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import { useCurrentUser, useSubscription } from "@/hooks/useMockData";
import { logout } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { openPlanModal } from "@/lib/billing";
import { resumePendingDownload } from "@/lib/downloadTrack";

const ACCOUNT_MENU = [
  { label: "Profile", section: "profile" },
  { label: "Plan & Billing", section: "billing" },
  { label: "Downloads", section: "downloads" },
  { label: "Favourites", section: "favourites" },
  { label: "Licenses", section: "license" },
  { label: "Support", section: "support" },
];

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const subscription = useSubscription();
  const { count: cartCount } = useCart();
  const acctRef = useRef<HTMLDivElement>(null);

  // Account popup header: plan chip (+ "Upgrade" when the user is still free).
  const plan = subscription?.plan ?? "free";
  const isPaidPlan = plan !== "free";
  const planLabel = plan.replace(/^\w/, (c) => c.toUpperCase());

  const onAccountClick = () => {
    // Logged in: toggle the dropdown. Guest: open the sign-in dialog.
    if (user) {
      setAcctOpen((v) => !v);
    } else {
      setIsOpen(false);
      setAuthOpen(true);
    }
  };

  const onLogout = async () => {
    setAcctOpen(false);
    setIsOpen(false);
    await logout();
    navigate("/");
  };

  // Close the account dropdown on outside-click or route change.
  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [acctOpen]);

  useEffect(() => {
    setAcctOpen(false);
  }, [location.pathname, location.search]);

  // Any part of the app can request the sign-in dialog (e.g. Download as guest).
  useEffect(() => {
    const open = () => setAuthOpen(true);
    window.addEventListener("tvms:open-auth", open);
    return () => window.removeEventListener("tvms:open-auth", open);
  }, []);

  // After sign-in (code, password or Google redirect) finish the download
  // the user originally clicked.
  useEffect(() => {
    if (user) resumePendingDownload();
  }, [user]);

  // Owner's order: Music Library · Sound Effects (placeholder, rendered below)
  // · Pricing · Licensing · Guides.
  const navItems = [
    { label: "Pricing", href: "/pricing" },
    { label: "Licensing", href: "/licensing" },
    { label: "Guides", href: "/guides" },
  ];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(query.trim() ? `/catalog?search=${encodeURIComponent(query.trim())}` : "/catalog");
    setQuery("");
    setIsOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Left: logo + nav links */}
          <div className="flex min-w-0 items-center gap-8">
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2.5 font-body text-sm font-semibold uppercase tracking-[0.22em] text-foreground md:text-base"
            >
              <img src="/images/icons/logo-header.png" alt="" className="h-8 w-auto md:h-9" />
              TV Music Store
            </Link>
            <div className="hidden items-center gap-7 md:flex">
              <Link
                to="/catalog"
                className={`whitespace-nowrap font-body text-sm transition-colors duration-300 hover:text-foreground ${
                  location.pathname === "/catalog" ? "text-[#F4C430]" : "text-muted-foreground"
                }`}
              >
                Music Library
              </Link>
              {/* Sound Effects — placeholder until the SFX library ships. */}
              <span
                title="Sound effects library — coming soon"
                className="flex cursor-default items-center gap-1.5 whitespace-nowrap font-body text-sm text-muted-foreground/50"
              >
                Sound Effects
                <span className="rounded-full border border-[#F4C430]/40 px-1.5 py-px font-body text-[9px] font-bold uppercase tracking-[0.12em] text-[#F4C430]/80">
                  Soon
                </span>
              </span>
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`whitespace-nowrap font-body text-sm transition-colors duration-300 hover:text-foreground ${
                    location.pathname === item.href ? "text-[#F4C430]" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right: search + account + cart */}
          <div className="hidden items-center gap-5 md:flex">
            <form onSubmit={submitSearch} className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-9 w-44 rounded-full border border-border bg-card/60 pl-10 pr-4 font-body text-sm text-foreground placeholder:text-muted-foreground/70 transition-all duration-300 focus:w-64 focus:border-[#F4C430]/70 focus:outline-none lg:w-56"
              />
            </form>
            <div className="relative flex items-center" ref={acctRef}>
              <button
                type="button"
                onClick={onAccountClick}
                aria-label="Account"
                aria-haspopup={user ? "menu" : undefined}
                aria-expanded={user ? acctOpen : undefined}
                className={`flex items-center justify-center transition-colors duration-300 hover:text-[#F4C430] ${
                  acctOpen ? "text-[#F4C430]" : "text-muted-foreground"
                }`}
              >
                {user ? (
                  /* Signed in: gold initial avatar instead of the generic icon. */
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full bg-[#F4C430] font-body text-xs font-bold text-background ring-2 transition-shadow ${
                      acctOpen ? "ring-[#F4C430]/50" : "ring-transparent hover:ring-[#F4C430]/40"
                    }`}
                  >
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <User className="h-5 w-5" />
                )}
              </button>
              {user && acctOpen && (
                <div
                  role="menu"
                  // Solid card background — the menu sits over track rows and text was
                  // showing through the translucent panel.
                  className="absolute right-0 top-full z-50 mt-3 w-60 overflow-hidden rounded-xl border border-border/70 bg-card py-1.5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.7)] animate-fade-in"
                >
                  {/* Identity block: email on top, plan chip + Upgrade on one row,
                      separated from the menu items by a rule. */}
                  <div className="px-4 pb-2.5 pt-1.5">
                    <p className="truncate font-body text-xs text-muted-foreground">{user.email}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-body text-[10px] font-semibold ${
                          isPaidPlan
                            ? "border-[#F4C430]/50 bg-[#F4C430]/10 text-[#F4C430]"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {planLabel} plan
                      </span>
                      {/* Free → "Upgrade", Pro → "Upgrade to Max", Max → nothing
                          left to sell. */}
                      {plan !== "max" && (
                        <button
                          type="button"
                          onClick={() => {
                            setAcctOpen(false);
                            openPlanModal();
                          }}
                          className="shrink-0 rounded-full bg-[#F4C430] px-2.5 py-0.5 font-body text-[10px] font-bold text-background transition-colors hover:bg-[#F4C430]/85"
                        >
                          {isPaidPlan ? "Upgrade to Max" : "Upgrade"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mb-1 h-px bg-border/60" />
                  {ACCOUNT_MENU.map((item) => (
                    <Link
                      key={item.section}
                      to={`/account?section=${item.section}`}
                      role="menuitem"
                      onClick={() => setAcctOpen(false)}
                      className="block px-4 py-2 font-body text-sm text-foreground/90 transition-colors hover:bg-white/5 hover:text-[#F4C430]"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {/* Role dashboards: quick jumps for composers and the admin. */}
                  {(user.role === "composer" || user.role === "admin") && (
                    <>
                      <div className="my-1.5 h-px bg-border/60" />
                      <Link
                        to="/account?section=composer-dashboard"
                        role="menuitem"
                        onClick={() => setAcctOpen(false)}
                        className="block px-4 py-2 font-body text-sm text-foreground/90 transition-colors hover:bg-white/5 hover:text-[#F4C430]"
                      >
                        Composer Dashboard
                      </Link>
                      {user.role === "admin" && (
                        <Link
                          to="/admin"
                          role="menuitem"
                          onClick={() => setAcctOpen(false)}
                          className="block px-4 py-2 font-body text-sm text-foreground/90 transition-colors hover:bg-white/5 hover:text-[#F4C430]"
                        >
                          Admin Dashboard
                        </Link>
                      )}
                    </>
                  )}
                  <div className="my-1.5 h-px bg-border/60" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left font-body text-sm text-foreground/90 transition-colors hover:bg-white/5 hover:text-[#F4C430]"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              )}
            </div>
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative flex items-center text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F4C430] px-1 font-body text-[10px] font-bold text-background">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-foreground p-2"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <div className="md:hidden pb-6 animate-fade-in">
            <div className="flex flex-col gap-4">
              <form onSubmit={submitSearch} className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tracks"
                  className="h-10 w-full rounded-full border border-border bg-card/60 pl-10 pr-4 font-body text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-[#F4C430]/70 focus:outline-none"
                />
              </form>
              <Link
                to="/catalog"
                onClick={() => setIsOpen(false)}
                className={`py-2 font-body text-base transition-colors duration-300 hover:text-foreground ${
                  location.pathname === "/catalog" ? "text-[#F4C430]" : "text-muted-foreground"
                }`}
              >
                Music Library
              </Link>
              <span className="flex items-center gap-2 py-2 font-body text-base text-muted-foreground/50">
                Sound Effects
                <span className="rounded-full border border-[#F4C430]/40 px-1.5 py-px font-body text-[9px] font-bold uppercase tracking-[0.12em] text-[#F4C430]/80">
                  Soon
                </span>
              </span>
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`py-2 font-body text-base transition-colors duration-300 hover:text-foreground ${
                    location.pathname === item.href ? "text-[#F4C430]" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {user ? (
                <div className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-3">
                  {ACCOUNT_MENU.map((item) => (
                    <Link
                      key={item.section}
                      to={`/account?section=${item.section}`}
                      onClick={() => setIsOpen(false)}
                      className="py-2 font-body text-base text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {(user.role === "composer" || user.role === "admin") && (
                    <Link
                      to="/account?section=composer-dashboard"
                      onClick={() => setIsOpen(false)}
                      className="py-2 font-body text-base text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
                    >
                      Composer Dashboard
                    </Link>
                  )}
                  {user.role === "admin" && (
                    <Link
                      to="/admin"
                      onClick={() => setIsOpen(false)}
                      className="py-2 font-body text-base text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
                    >
                      Admin Dashboard
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="mt-1 inline-flex items-center gap-2 py-2 text-left font-body text-base text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
                  >
                    <LogOut className="h-5 w-5" />
                    Log out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onAccountClick}
                  className="mt-2 inline-flex items-center gap-2 py-2 font-body text-base text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
                >
                  <User className="h-5 w-5" />
                  Account
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </nav>
  );
};

export default Navigation;
