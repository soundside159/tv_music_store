import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

// ---------------------------------------------------------------------------
// SECTION DRAWER (mobile) — wraps the /admin and /account section tree.
//
// That tree is a left sidebar on desktop. On a phone it used to be stacked
// ABOVE the page content: you picked something in the header drawer, landed on
// the page, and were met by a SECOND full-screen menu before any content — the
// owner rightly asked what the point of the slide-in menu was then.
//
// Here the very same tree is rendered twice: as the plain sidebar from `md` up,
// and inside a right-hand slide-in panel below `md`, behind one compact button.
// The drawer copy is only mounted while it is open, so nothing is duplicated in
// the tab order. Phones now have exactly one kind of navigation: panels that
// slide in from the right and close the moment you pick anything.
// ---------------------------------------------------------------------------

const SectionDrawer = ({ children, label = "Menu" }: { children: ReactNode; label?: string }) => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Any navigation closes it — including links that carry no onClick.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 font-body text-sm font-semibold text-foreground transition-colors hover:border-[#F4C430]/60 md:hidden"
      >
        {label}
        <Menu className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Desktop: the sidebar exactly as it always was. */}
      <div className="hidden md:block">{children}</div>

      {/* Mobile: the same tree, in a drawer. */}
      <div
        className={`fixed inset-0 z-[100] md:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto overscroll-contain border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <span className="font-body text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
              {label}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={22} />
            </button>
          </div>
          <div className="px-3 py-4">{open ? children : null}</div>
          <div className="h-6 shrink-0" />
        </div>
      </div>
    </>
  );
};

export default SectionDrawer;
