import {
  AudioLines,
  Bell,
  CreditCard,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Heart,
  Inbox,
  LayoutDashboard,
  Library,
  LifeBuoy,
  ListFilter,
  ListMusic,
  Mail,
  Music2,
  Newspaper,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  UploadCloud,
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
      { id: "downloads", label: "Downloads", icon: Download },
      { id: "favourites", label: "Favourites", icon: Heart },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Plan",
    items: [{ id: "billing", label: "Plan & Billing", icon: CreditCard }],
  },
  {
    label: "Music",
    items: [
      { id: "whitelist", label: "YouTube Whitelisting", icon: Youtube },
      { id: "license", label: "Licenses", icon: FileText },
      { id: "claims", label: "Copyright Claims", icon: ShieldCheck },
    ],
  },
  {
    label: "Support",
    items: [{ id: "support", label: "Support", icon: LifeBuoy }],
  },
];

// Grouped admin sidebar (headers always shown, not collapsible). Dead/mock
// sections removed: Finance, the old mock Tracks, Trending (now a per-track flag
// in the Tracks manager), and the mock Whitelist-requests.
export const adminNavGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Catalog",
    items: [
      { id: "tracksedit", label: "Tracks", icon: SlidersHorizontal },
      { id: "bulkupload", label: "Bulk Upload", icon: UploadCloud },
      { id: "import", label: "Import (CSV)", icon: FileSpreadsheet },
      { id: "collections", label: "Collections", icon: Library },
      { id: "playlists", label: "Playlists", icon: ListMusic },
      { id: "categories", label: "Categories", icon: Tags },
      { id: "vocabulary", label: "Vocabulary", icon: ListFilter },
    ],
  },
  {
    label: "Sound Effects",
    items: [{ id: "soundeffects", label: "Sound Effects", icon: AudioLines }],
  },
  {
    label: "Content",
    items: [{ id: "articles", label: "Articles", icon: Newspaper }],
  },
  {
    label: "Money",
    items: [{ id: "finance", label: "Finance", icon: DollarSign }],
  },
  {
    label: "Customers",
    items: [
      { id: "customers", label: "Users", icon: Users },
      { id: "mail", label: "Inbox", icon: Mail },
      { id: "licenses", label: "Licenses", icon: FileText },
      { id: "campaigns", label: "Campaigns", icon: Send },
      { id: "whitelist", label: "Whitelisting", icon: Youtube },
    ],
  },
  {
    label: "Requests",
    items: [{ id: "requests", label: "Briefs", icon: Inbox }],
  },
];

// Flat list (used by the secondary "Admin" menu on the account page).
export const adminNavItems: NavItem[] = adminNavGroups.flatMap((g) => g.items);

// Composer studio sections — rendered INSIDE /account (sidebar "Composer"
// group; account section ids are prefixed: composer-<id>). Shown for
// role=composer AND admins (the owner is a composer too).
export const composerNavItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tracks", label: "My tracks", icon: Music2 },
  { id: "upload", label: "Upload", icon: UploadCloud },
  { id: "earnings", label: "Earnings", icon: DollarSign },
  { id: "requests", label: "Requests", icon: Inbox },
  // No "Profile" here — the composer's account profile lives in the Account
  // menu; a second one would just be the same fields twice.
];
