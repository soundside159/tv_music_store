import { useId } from "react";

/**
 * Soft converging "light beams" that join a menu group's header to its items —
 * the same visual idea as the TV MUSIC STORE trust block on the homepage
 * (gold bezier beams, no corners, no highlights). Overlay this INSIDE a
 * `relative` items container whose rows are uniform `row` px tall with no
 * gaps between them; give the items enough left padding (pl-8) to clear it.
 */
const MenuTreeLines = ({
  count,
  row = 36,
  className = "",
}: {
  count: number;
  row?: number;
  className?: string;
}) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (count <= 0) return null;
  const h = count * row;
  return (
    <svg
      width="24"
      height={h}
      viewBox={`0 0 24 ${h}`}
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none absolute left-1.5 top-0 ${className}`}
    >
      <defs>
        {/* Brightest at the trunk, melting away toward the item — beam-like. */}
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F4C430" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#F4C430" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      {Array.from({ length: count }, (_, i) => {
        const y = i * row + row / 2;
        return (
          <path
            key={i}
            d={`M6 0 C 6 ${Math.min(y - 8, Math.max(10, y * 0.55))}, 8 ${y}, 20 ${y}`}
            stroke={`url(#${id})`}
            strokeWidth="1.2"
          />
        );
      })}
    </svg>
  );
};

export default MenuTreeLines;
