import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Top-level sidebar group header ("Main" / "Admin") used on /account and
 * /admin — opening one group collapses the other.
 */
const MenuGroupHeader = ({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 font-body text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
      open ? "text-[#F4C430]" : "text-muted-foreground/70 hover:text-foreground"
    }`}
  >
    {label}
    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
  </button>
);

export default MenuGroupHeader;
