import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

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

  const scrollToContact = (e: React.MouseEvent) => {
    if (isHome) {
      e.preventDefault();
      document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const navItems = [
    { label: "Music Catalog", href: "/catalog" },
    { label: "Licensing", href: "/#licensing", onClick: scrollToTop },
    { label: "Contact", href: "/#contact", onClick: scrollToContact },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="font-display text-xl md:text-2xl text-gradient-gold tracking-wider">
            TVMUSICSTORE
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={item.onClick}
                className="font-body text-sm tracking-wide text-muted-foreground 
                         hover:text-primary transition-colors duration-300"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#contact"
              className="font-body text-sm tracking-wide px-5 py-2.5 
                       border border-primary/50 text-primary
                       hover:bg-primary hover:text-primary-foreground
                       transition-all duration-300"
            >
              Get Started
            </a>
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
                  className="font-body text-base tracking-wide text-muted-foreground 
                           hover:text-primary transition-colors duration-300 py-2"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#contact"
                onClick={() => setIsOpen(false)}
                className="font-body text-sm tracking-wide px-5 py-3 mt-2
                         border border-primary/50 text-primary text-center
                         hover:bg-primary hover:text-primary-foreground
                         transition-all duration-300"
              >
                Get Started
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
