import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, Search, ShoppingCart, User, X } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import { useCurrentUser } from "@/hooks/useMockData";

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const onAccountClick = () => {
    setIsOpen(false);
    if (user) navigate("/account");
    else setAuthOpen(true);
  };

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
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Left: logo + nav links */}
          <div className="flex min-w-0 items-center gap-8">
            <Link
              to="/"
              className="shrink-0 font-body text-sm font-semibold uppercase tracking-[0.22em] text-foreground md:text-base"
            >
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
            <button
              type="button"
              onClick={onAccountClick}
              aria-label="Account"
              className="text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
            >
              <User className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Cart"
              className="text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
            >
              <ShoppingCart className="h-5 w-5" />
            </button>
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
              <button
                type="button"
                onClick={onAccountClick}
                className="mt-2 inline-flex items-center gap-2 py-2 font-body text-base text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
              >
                <User className="h-5 w-5" />
                Account
              </button>
            </div>
          </div>
        )}
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </nav>
  );
};

export default Navigation;
