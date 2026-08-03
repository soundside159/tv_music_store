import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Mail, Menu, Search, ShoppingCart, User, X } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import { useCurrentUser, useSubscription } from "@/hooks/useMockData";
import { logout } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useUnreadMail } from "@/hooks/useUnreadMail";
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
  // Admin-only: unread inbox threads for the header envelope (0 for everyone else).
  const unreadMail = useUnreadMail(user?.role === "admin");
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

  // ---- Mobile drawer plumbing -------------------------------------------
  // The old mobile menu was simply the desktop link list dropped inside the
  // header: the page kept scrolling behind it and it never read as a separate
  // panel. It is a real right-hand drawer now, so it also has to lock the page
  // underneath, answer Escape, and close itself on every navigation.
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

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
    <>
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
              {/* The SFX library is live — this was a dead "Soon" chip. */}
              <Link
                to="/sound-effects"
                className={`whitespace-nowrap font-body text-sm transition-colors duration-300 hover:text-foreground ${
                  location.pathname.startsWith("/sound-effects")
                    ? "text-[#F4C430]"
                    : "text-muted-foreground"
                }`}
              >
                Sound Effects
              </Link>
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
            {/* Admin-only envelope: unread inbox count, click -> admin Inbox. */}
            {user?.role === "admin" && (
              <Link
                to="/admin?section=mail"
                aria-label={`Inbox — ${unreadMail} unread`}
                title={unreadMail > 0 ? `${unreadMail} unread message${unreadMail === 1 ? "" : "s"}` : "Inbox"}
                className="relative flex items-center justify-center text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
              >
                <Mail className="h-5 w-5" />
                {unreadMail > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F4C430] px-1 font-body text-[10px] font-bold leading-none text-background">
                    {unreadMail > 9 ? "9+" : unreadMail}
                  </span>
                )}
              </Link>
            )}
            {/* On /catalog the header search glides away — the catalog page
                has its own (plus AI Search) right below, and two boxes on one
                screen read as a bug. */}
            <form
              onSubmit={submitSearch}
              className={`relative overflow-hidden transition-all duration-500 ease-out ${
                location.pathname === "/catalog"
                  ? "pointer-events-none max-w-0 -translate-y-1 opacity-0"
                  : "max-w-64 translate-y-0 opacity-100"
              }`}
              aria-hidden={location.pathname === "/catalog"}
            >
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                tabIndex={location.pathname === "/catalog" ? -1 : 0}
                className="h-9 w-44 rounded-full border border-border bg-card/60 pl-10 pr-4 font-body text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors duration-300 focus:border-[#F4C430]/70 focus:outline-none lg:w-56"
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
                    <p className="pointer-events-none truncate font-body text-xs text-muted-foreground">{user.email}</p>
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
                        to="/account?section=composer-earnings"
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

      </div>
    </nav>

    {/* ------------------------------------------------------------------
        MOBILE MENU — a real slide-in drawer (right edge), not the desktop
        list rendered inside the header.
        It MUST live outside <nav>: the header uses backdrop-blur, and a
        backdrop-filter turns an element into the containing block for its
        fixed-position children — a drawer rendered inside would be clipped
        to the 64px header. The panel is always mounted so it can animate in
        and out; pointer-events are dropped while it is closed.
    ------------------------------------------------------------------- */}
    <div
      className={`fixed inset-0 z-[100] md:hidden ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        onClick={() => setIsOpen(false)}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto overscroll-contain border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 font-body text-sm font-semibold uppercase tracking-[0.18em] text-foreground"
          >
            <img src="/images/icons/logo-header.png" alt="" className="h-7 w-auto" />
            <span className="truncate">TV Music Store</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={22} />
          </button>
        </div>

        {user && (
          <div className="border-b border-border/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F4C430] font-body text-base font-bold uppercase text-background">
                {(user.name || user.email).charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm font-semibold text-foreground">
                  {user.name || user.email}
                </p>
                <p className="pointer-events-none truncate font-body text-xs text-muted-foreground">{user.email}</p>
              </div>
              <span className="shrink-0 rounded-full border border-[#F4C430]/40 px-2.5 py-1 font-body text-[11px] font-semibold uppercase tracking-wide text-[#F4C430]">
                {planLabel}
              </span>
            </div>
            {!isPaidPlan && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  openPlanModal();
                }}
                className="mt-3 w-full rounded-lg bg-[#F4C430] py-2.5 font-body text-sm font-bold text-background transition-colors hover:bg-[#F4C430]/85"
              >
                Upgrade plan
              </button>
            )}
          </div>
        )}


        {user ? (
          <div className="mt-1 flex flex-col border-t border-border/60 px-3 py-2">
            {user.role === "admin" && (
              <Link
                to="/admin?section=mail"
                tabIndex={isOpen ? 0 : -1}
                className="flex items-center justify-between rounded-lg px-2 py-3 font-body text-base text-foreground transition-colors hover:bg-foreground/[0.04]"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  Inbox
                </span>
                {unreadMail > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F4C430] px-1.5 font-body text-[11px] font-bold text-background">
                    {unreadMail > 9 ? "9+" : unreadMail}
                  </span>
                )}
              </Link>
            )}
            {ACCOUNT_MENU.map((item) => (
              <Link
                key={item.section}
                to={`/account?section=${item.section}`}
                tabIndex={isOpen ? 0 : -1}
                className="rounded-lg px-2 py-3 font-body text-base text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-[#F4C430]"
              >
                {item.label}
              </Link>
            ))}
            {(user.role === "composer" || user.role === "admin") && (
              <Link
                to="/account?section=composer-earnings"
                tabIndex={isOpen ? 0 : -1}
                className="rounded-lg px-2 py-3 font-body text-base text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-[#F4C430]"
              >
                Composer Dashboard
              </Link>
            )}
            {user.role === "admin" && (
              <Link
                to="/admin"
                tabIndex={isOpen ? 0 : -1}
                className="rounded-lg px-2 py-3 font-body text-base text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-[#F4C430]"
              >
                Admin Dashboard
              </Link>
            )}
            <button
              type="button"
              onClick={onLogout}
              tabIndex={isOpen ? 0 : -1}
              className="mt-1 inline-flex items-center gap-2.5 rounded-lg px-2 py-3 text-left font-body text-base text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-[#F4C430]"
            >
              <LogOut className="h-5 w-5" />
              Log out
            </button>
          </div>
        ) : (
          <div className="mt-1 border-t border-border/60 px-5 py-4">
            <button
              type="button"
              onClick={onAccountClick}
              tabIndex={isOpen ? 0 : -1}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#F4C430] py-2.5 font-body text-sm font-bold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background"
            >
              <User className="h-5 w-5" />
              Sign in
            </button>
          </div>
        )}

        <div className="h-6 shrink-0" />
      </aside>
    </div>

    <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
};

export default Navigation;
