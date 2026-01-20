const Footer = () => {
  return (
    <footer id="contact" className="py-16 bg-card border-t border-border/50">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          {/* Brand */}
          <div>
            <h3 className="font-display text-2xl text-gradient-gold mb-4 tracking-wider">
              SCORE VAULT
            </h3>
            <p className="font-body text-sm text-muted-foreground leading-relaxed">
              Premium music licensing for film, television, and media productions worldwide.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display text-sm text-foreground mb-4 tracking-wider uppercase">
              Quick Links
            </h4>
            <div className="flex flex-col gap-3">
              {["Catalog", "Licensing", "Custom Work", "About"].map((link) => (
                <a
                  key={link}
                  href={`#${link.toLowerCase().replace(" ", "-")}`}
                  className="font-body text-sm text-muted-foreground hover:text-primary 
                           transition-colors duration-300"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display text-sm text-foreground mb-4 tracking-wider uppercase">
              Contact
            </h4>
            <div className="flex flex-col gap-3 font-body text-sm text-muted-foreground">
              <a 
                href="mailto:licensing@scorevault.com"
                className="hover:text-primary transition-colors duration-300"
              >
                licensing@scorevault.com
              </a>
              <p>Los Angeles, CA</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 pt-8">
          <p className="font-body text-xs text-muted-foreground text-center">
            © 2026 Score Vault. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
