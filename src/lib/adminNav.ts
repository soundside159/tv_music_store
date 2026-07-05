import {
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Flame,
  Inbox,
  LayoutDashboard,
  Library,
  LifeBuoy,
  ListFilter,
  ListMusic,
  Music2,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  UserRound,
  Users,
  Youtube,
} from "lucide-react";

// Shared sidebar metadata for /account and /admin. Admins see two top-level
// menus — "Main" (the account sections) and "Admin" (the admin sections) —
// on BOTH pages; opening one collapses the other. Cross-page items are links
// with ?section=... so the target page opens on the right section.

export interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export const accountNavGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", icon: UserRound },
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "downloads", label: "Downloads", icon: Download },
    ],
  },
  {
    label: "Plan",
    items: [{ id: "billing", label: "Plan & Billing", icon: CreditCard }],
  },
  {
    label: "Music",
    items: [
      { id: "whitelist", label: "Whitelisting", icon: Youtube },
      { id: "license", label: "Licenses", icon: FileText },
      { id: "claims", label: "Copyright Claims", icon: ShieldCheck },
    ],
  },
  {
    label: "Support",
    items: [{ id: "support", label: "Support", icon: LifeBuoy }],
  },
];

export const adminNavItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "finance", label: "Finance", icon: DollarSign },
  { id: "tracks", label: "Tracks", icon: Music2 },
  { id: "collections", label: "Collections", icon: Library },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "vocabulary", label: "Vocabulary", icon: ListFilter },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "tracksedit", label: "Tracks Edit", icon: SlidersHorizontal },
  { id: "customers", label: "Customers", icon: Users },
  { id: "licenses", label: "Licenses", icon: FileText },
  { id: "requests", label: "Requests", icon: Inbox },
];
