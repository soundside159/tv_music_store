import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, Search, ShoppingCart, User, X } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import { useCurrentUser } from "@/hooks/useMockData";
import { logout } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
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
  const { count: cartCount } = useCart();
  const acctRef = useRef<HTMLDivElement>(null);

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

  const navItems = [
    { label: "Music Library", href: "/catalog" },
    { label: "Pricing", href: "/pricing" },
    { label: "Licensing", href: "/licensing" },
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
            <div className="relative" ref={acctRef}>
              <button
                type="button"
                onClick={onAccountClick}
                aria-label="Account"
                aria-haspopup={user ? "menu" : undefined}
                aria-expanded={user ? acctOpen : undefined}
                className={`transition-colors duration-300 hover:text-[#F4C430] ${
                  acctOpen ? "text-[#F4C430]" : "text-muted-foreground"
                }`}
              >
                <User className="h-5 w-5" />
              </button>
              {user && acctOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-3 w-52 overflow-hidden rounded-xl border border-border/70 bg-card/95 py-1.5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.7)] backdrop-blur-xl animate-fade-in"
                >
                  <div className="truncate px-4 pb-2 pt-1 font-body text-xs text-muted-foreground">
                    {user.email}
                  </div>
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
              className="relative text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
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
