/**
 * One plain, straight vertical line along a menu group's indented items —
 * the classic "submenu" mark (owner picked this over curved connectors).
 * Overlay it INSIDE a `relative` items container; give the items enough
 * left padding (pl-8) to clear it.
 */
const MenuTreeLines = ({ className = "" }: { className?: string }) => (
  <span
    aria-hidden
    className={`pointer-events-none absolute bottom-1.5 left-3 top-1.5 w-px rounded-full bg-border ${className}`}
  />
);

export default MenuTreeLines;
