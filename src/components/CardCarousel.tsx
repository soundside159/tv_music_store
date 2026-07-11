import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontal card rail (playlists themes, and any other card row).
 *
 * - Cards never wrap to a second line; the row scrolls sideways instead.
 * - Widths come from `.card-rail` in index.css (5.5 cards on xl) so the NEXT
 *   card is always half-visible and fades into a shadow on the right edge —
 *   an obvious "there is more" hint.
 * - Prev/next arrows fade in only while the section is hovered AND only on the
 *   side that can actually scroll.
 */
const CardCarousel = ({ children }: { children: ReactNode }) => {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(max <= 2 || el.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [measure, children]);

  const nudge = (dir: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrowBase =
    "absolute top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white opacity-0 shadow-xl backdrop-blur transition-all duration-200 hover:border-[#F4C430]/70 hover:text-[#F4C430] focus-visible:opacity-100 group-hover/rail:opacity-100 sm:flex";

  return (
    <div className="group/rail relative">
      <div ref={railRef} onScroll={measure} className="card-rail">
        {children}
      </div>

      {/* Right shadow: only the outer edge of the half-visible card fades out —
          narrow on purpose, the card must stay clearly readable. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-[7%] bg-gradient-to-l from-background via-background/70 to-transparent transition-opacity duration-300 ${
          atEnd ? "opacity-0" : "opacity-100"
        }`}
      />
      {/* Left shadow: only once the row has been scrolled. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-[5%] bg-gradient-to-r from-background via-background/65 to-transparent transition-opacity duration-300 ${
          atStart ? "opacity-0" : "opacity-100"
        }`}
      />

      {!atStart && (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Scroll left"
          className={`${arrowBase} left-1`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Scroll right"
          className={`${arrowBase} right-1`}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default CardCarousel;
