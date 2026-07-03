import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, ShoppingCart, User, X } from "lucide-react";

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";

  const scrollToTop = (e: React.MouseEvent) => {
    if (isHome) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const navItems = [
    { label: "Music Library", href: "/catalog" },
    { label: "Pricing", href: "/pricing" },
    { label: "Licensing", href: "/#licensing", onClick: scrollToTop },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="font-body text-sm font-semibold uppercase tracking-[0.22em] text-foreground md:text-base">
            TV Music Store
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={item.onClick}
                className={`font-body text-sm transition-colors duration-300 hover:text-foreground ${
                  location.pathname === item.href ? "text-[#F4C430]" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </a>
            ))}
            <div className="flex items-center gap-5">
              <Link
                to="/login"
                aria-label="Account"
                className="text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
              >
                <User className="h-5 w-5" />
              </Link>
              <button
                type="button"
                aria-label="Cart"
                className="text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
              >
                <ShoppingCart className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-foreground p-2"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden pb-6 animate-fade-in">
            <div className="flex flex-col gap-4">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => {
                    if (item.onClick) item.onClick(e);
                    setIsOpen(false);
                  }}
                  className={`py-2 font-body text-base transition-colors duration-300 hover:text-foreground ${
                    location.pathname === item.href ? "text-[#F4C430]" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </a>
              ))}
              <Link
                to="/login"
                onClick={() => setIsOpen(false)}
                className="mt-2 inline-flex items-center gap-2 py-2 font-body text-base text-muted-foreground transition-colors duration-300 hover:text-[#F4C430]"
              >
                <User className="h-5 w-5" />
                Account
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
