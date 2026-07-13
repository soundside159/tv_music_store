import type { ReactNode } from "react";

// ONE heading for every card in the account area (owner: he liked how the
// Notifications groups read — a small gold bar, then the name). Two pieces so
// every section looks the same wherever it lives:
//
//   <SectionPanel title="Add a channel" right={<Badge/>}>…</SectionPanel>
//   …or <SectionHeading> alone when the card draws its own body.
//
// Page titles (the big "Favourites", "Support" h1s) are NOT this — they name the
// page; this names a block inside it.

const GOLD = "#F4C430";

export const SectionHeading = ({ title, right }: { title: string; right?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
    <p className="flex min-w-0 items-center gap-2 font-body text-sm font-semibold text-foreground">
      <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ backgroundColor: GOLD }} />
      <span className="truncate">{title}</span>
    </p>
    {right}
  </div>
);

/** A card with that heading on top and its content below. */
export const SectionPanel = ({
  title,
  right,
  children,
  bodyClassName = "p-5",
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) => (
  <div className="rounded-xl border border-border bg-card">
    <SectionHeading title={title} right={right} />
    <div className={bodyClassName}>{children}</div>
  </div>
);

export default SectionPanel;
