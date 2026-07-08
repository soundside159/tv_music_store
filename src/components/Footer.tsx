import { Link } from "react-router-dom";
import { Youtube, Instagram, Facebook } from "lucide-react";
import NewsletterSignup from "@/components/NewsletterSignup";

// lucide has no X (formerly Twitter) brand glyph — inline the official X mark.
const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>
);

// Multi-column site footer (tunetank-style, built from TV Music Store content).
// Internal links use react-router; external/contact use <a>.

type FooterLink = { label: string; to: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Music",
    links: [
      { label: "Music Library", to: "/catalog" },
      { label: "Collections", to: "/collections" },
      { label: "Playlists", to: "/playlists" },
    ],
  },
  {
    title: "Licensing",
    links: [
      { label: "Pricing & Plans", to: "/pricing" },
      { label: "How Licensing Works", to: "/licensing" },
      { label: "Sync Licensing", to: "/sync" },
      { label: "Custom Music", to: "/custom" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact Us", to: "mailto:contact@tvmusicstore.com", external: true },
      { label: "License Terms", to: "/license-terms" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Refund Policy", to: "/refunds" },
    ],
  },
];

// TODO(owner): set real social URLs (or remove any you don't use).
const SOCIALS = [
  { label: "YouTube", href: "#", Icon: Youtube },
  { label: "Instagram", href: "#", Icon: Instagram },
  { label: "X", href: "#", Icon: XIcon },
  { label: "Facebook", href: "#", Icon: Facebook },
];

const linkClass =
  "font-body text-sm text-muted-foreground hover:text-[#F4C430] transition-colors duration-200";

const Footer = () => {
  return (
    <footer id="contact" className="bg-card border-t border-border/50">
      <div className="container mx-auto px-6 py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4 lg:gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/images/icons/logo-header.png"
                alt="TV Music Store"
                className="h-8 w-8"
              />
              <span className="font-display text-lg text-foreground">TV Music Store</span>
            </Link>
            <p className="mt-4 max-w-[15rem] font-body text-sm text-muted-foreground">
              Cinematic and production music for film, TV, and creators.
            </p>
            <div className="mt-5">
              <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-foreground/70">
                New tracks in your inbox
              </p>
              <NewsletterSignup source="footer" />
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 font-body text-xs font-semibold uppercase tracking-wider text-foreground/70">
                {col.title}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.to} className={linkClass}>
                        {l.label}
                      </a>
                    ) : (
                      <Link to={l.to} className={linkClass}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-6 sm:flex-row">
          <p className="font-body text-xs text-muted-foreground">
            © {new Date().getFullYear()} TV Music Store. All rights reserved. See our{" "}
            <Link to="/license-terms" className="hover:text-[#F4C430]">
              License Terms
            </Link>
            .
          </p>
          <div className="flex items-center gap-4">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors duration-200 hover:text-[#F4C430]"
              >
                <Icon className="h-[18px] w-[18px]" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
