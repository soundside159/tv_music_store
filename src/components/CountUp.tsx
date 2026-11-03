import { useEffect, useRef, useState } from "react";

// Money that "runs up" to its value (owner: numbers should count like the
// chart grows). Ease-out over ~0.9 s, same feel as the bar animation; from 0
// on first show, from the previous value on later changes. Honors
// prefers-reduced-motion (jumps straight to the value).

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const useCountUp = (target: number, duration = 900): number => {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = a + (target - a) * easeOutCubic(t);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration]);
  return shown;
};

/** Animated "$1,234.56" from cents. `format` lets callers keep their own style. */
const CountUp = ({
  cents,
  format,
  duration,
}: {
  cents: number;
  format: (cents: number) => string;
  duration?: number;
}) => {
  const v = useCountUp(cents, duration);
  return <>{format(Math.round(v))}</>;
};

export default CountUp;
