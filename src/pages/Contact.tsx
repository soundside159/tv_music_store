import { useState } from "react";
import { Mail, Copy, Check } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

// Public Contact page. The footer "Contact Us" link points here (a mailto: link
// did nothing for visitors without a configured mail app).
const CONTACT_EMAIL = "contact@tvmusicstore.com";

const Contact = () => {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (very old browser / http) — the mailto link below still works.
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-28 sm:px-6 md:pt-32">
        <header>
          <h1 className="text-3xl text-foreground md:text-4xl">Contact Us</h1>
          <p className="mt-3 max-w-xl font-body text-sm leading-relaxed text-muted-foreground">
            Have a question? Write to us.
          </p>
        </header>

        {/* Email card */}
        <div className="mt-10 rounded-xl border border-border/50 bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F4C430]/10">
              <Mail className="h-5 w-5 text-[#F4C430]" />
            </span>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-body text-lg text-foreground transition-colors duration-200 hover:text-[#F4C430] sm:text-xl"
            >
              {CONTACT_EMAIL}
            </a>
            <button
              type="button"
              onClick={copyEmail}
              className="inline-flex items-center gap-2 rounded-md border border-border/60 px-4 py-2 font-body text-sm text-foreground transition-colors duration-200 hover:border-[#F4C430]/60 hover:text-[#F4C430]"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-[#F4C430]" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy
                </>
              )}
            </button>
          </div>
        </div>

        <p className="mt-10 border-t border-border/50 pt-6 font-body text-xs text-muted-foreground">
          © {new Date().getFullYear()} TV Music Store. All rights reserved.
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
