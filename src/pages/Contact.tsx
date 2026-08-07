import { useState } from "react";
import { Mail, Copy, Check, Clock } from "lucide-react";
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
          <p className="font-body text-xs uppercase tracking-widest text-[#F4C430]">Get in touch</p>
          <h1 className="mt-2 text-3xl text-foreground md:text-4xl">Contact Us</h1>
          <p className="mt-3 max-w-xl font-body text-sm leading-relaxed text-muted-foreground">
            Questions about licensing, your order, Content ID, or anything else — write to us and
            we&apos;ll get back to you.
          </p>
        </header>

        {/* Email card */}
        <div className="mt-10 rounded-xl border border-border/50 bg-card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F4C430]/10">
              <Mail className="h-5 w-5 text-[#F4C430]" />
            </span>
            <div>
              <p className="font-body text-xs uppercase tracking-wider text-foreground/70">Email</p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-body text-lg text-foreground transition-colors duration-200 hover:text-[#F4C430] sm:text-xl"
              >
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
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
                  <Copy className="h-4 w-4" /> Copy address
                </>
              )}
            </button>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-md bg-[#F4C430] px-4 py-2 font-body text-sm font-medium text-black transition-opacity duration-200 hover:opacity-90"
            >
              <Mail className="h-4 w-4" /> Open in mail app
            </a>
          </div>

          <p className="mt-6 flex items-start gap-2 font-body text-xs leading-relaxed text-muted-foreground">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F4C430]" />
            We usually reply within a few business days. For order issues, please email from the
            address on your account and include your order or license number.
          </p>
        </div>

        {/* What to include */}
        <h2 className="mt-10 text-xl text-foreground">What helps us help you faster</h2>
        <ul className="mt-3 space-y-1.5">
          {[
            "Licensing questions — the track title and where you plan to use it.",
            "Order or download issues — your order or license number.",
            "YouTube Content ID — the video link and the channel it was uploaded to.",
          ].map((it, i) => (
            <li
              key={i}
              className="flex gap-2 font-body text-sm leading-relaxed text-muted-foreground"
            >
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#F4C430]" />
              <span>{it}</span>
            </li>
          ))}
        </ul>

        <p className="mt-10 border-t border-border/50 pt-6 font-body text-xs text-muted-foreground">
          © {new Date().getFullYear()} TV Music Store. All rights reserved.
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
