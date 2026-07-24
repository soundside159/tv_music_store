import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, Check, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { accountNavGroups, adminNavGroups, composerNavItems } from "@/lib/adminNav";
import MenuGroupHeader from "@/components/MenuGroupHeader";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useCurrentUser } from "@/hooks/useMockData";
import { mockBriefs, mockComposers, mockComposerTracks } from "@/mocks";
import AdminContent from "@/components/AdminContent";
import AdminBulkUpload from "@/components/AdminBulkUpload";
import AdminSfx from "@/components/AdminSfx";
import AdminImport from "@/components/AdminImport";
import AdminWhitelist from "@/components/AdminWhitelist";
import AdminClaims from "@/components/AdminClaims";
import AdminCampaign from "@/components/AdminCampaign";
import AdminInbox from "@/components/AdminInbox";
import AdminCustomerProfile from "@/components/AdminCustomerProfile";
import AdminGuides from "@/components/AdminGuides";
import AdminFinance from "@/components/AdminFinance";
import AdminUsage from "@/components/AdminUsage";
import AdminAnalytics from "@/components/AdminAnalytics";
import MenuTreeLines from "@/components/MenuTreeLines";

const GOLD = "#F4C430";

type SectionId =
  | "dashboard"
  | "analytics"
  | "finance"
  | "soundeffects"
  | "tracks"
  | "collections"
  | "playlists"
  | "categories"
  | "vocabulary"
  | "trending"
  | "tracksedit"
  | "bulkupload"
  | "sfxedit"
  | "sfxbulk"
  | "import"
  | "articles"
  | "customers"
  | "licenses"
  | "whitelist"
  | "claims"
  | "campaigns"
  | "mail"
  | "requests";

const SECTION_IDS: SectionId[] = [
  "dashboard",
  "analytics",
  "finance",
  "tracks",
  "collections",
  "playlists",
  "categories",
  "vocabulary",
  "trending",
  "tracksedit",
  "bulkupload",
  "sfxedit",
  "sfxbulk",
  "soundeffects",
  "import",
  "articles",
  "customers",
  "licenses",
  "whitelist",
  "claims",
  "campaigns",
  "mail",
  "requests",
];

// Which sidebar sections are handled by the AdminContent component, and the
// internal view each maps to.
type ContentTab = "collections" | "playlists" | "categories" | "vocabulary" | "trending" | "tracks";
const CONTENT_TAB: Partial<Record<SectionId, ContentTab>> = {
  collections: "collections",
  playlists: "playlists",
  categories: "categories",
  vocabulary: "vocabulary",
  trending: "trending",
  tracksedit: "tracks",
};

const composerName = (id: string) =>
  mockComposers.find((c) => c.id === id)?.displayName ?? id;

interface LiveUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  plan: string | null;
  /** Latest subscription status (active | past_due | canceled) — null = never subscribed. */
  plan_status: string | null;
  /** 1 = canceled in the portal; the plan runs to plan_until, then Free. */
  plan_cancels: number | null;
  plan_until: string | null;
  downloads: number;
  /** Composer display pseudonym (composers.display_name), if a profile exists. */
  pseudonym: string | null;
  /** "About the composer" — shown on the public /artist/<slug> page. */
  bio: string | null;
  /** Sync / cue-sheet info printed on license PDFs (composer profiles only) +
   *  the two upload permissions ("1"/"0" — they ride in the same payload). */
  cue: {
    cueName: string | null;
    pro: string | null;
    ipi: string | null;
    publisherName: string | null;
    publisherPro: string | null;
    publisherIpi: string | null;
    canUploadTracks?: string | null;
    canUploadSfx?: string | null;
  } | null;
}

interface AdminLicense {
  id: string;
  kind: "one-time" | "subscription";
  tier: string;
  price: number | null;
  reference: string;
  createdAt: string;
  validUntil: string | null;
  userId: string;
  userEmail: string;
  userName: string;
  /** Buyer's current plan (latest subscriptions row) — shown like in Users. */
  buyerPlan?: string | null;
  trackTitle: string;
  trackSlug?: string | null;
  /** Subscription rows: what the covering payment bills per ("year"/"month"). */
  pricePer?: "year" | "month" | null;
  provider?: "stripe" | "paypal" | null;
  feeCents?: number | null;
  netCents?: number | null;
  paymentIntent?: string | null;
}

/** The owner account — its Admin checkbox is locked so he can't demote himself. */
const OWNER_EMAIL = "soundside159@gmail.com";

type UserTab = "all" | "users" | "composers" | "admins";

/** Composer = has a pseudonym profile (or the legacy composer role). */
const isComposerUser = (u: LiveUser) => !!u.pseudonym || u.role === "composer";

const Card = ({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-card p-6 ${className}`}>
    {title && <h2 className="font-body text-base font-semibold text-foreground">{title}</h2>}
    <div className={title ? "mt-4" : ""}>{children}</div>
  </div>
);

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <Card>
    <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 font-body text-3xl font-semibold text-foreground">{value}</p>
    {sub && <p className="mt-1 font-body text-xs text-muted-foreground">{sub}</p>}
  </Card>
);

const StatusPill = ({ text, active }: { text: string; active: boolean }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 font-body text-xs ${
      active ? "bg-[#F4C430]/15 text-[#F4C430]" : "bg-secondary text-muted-foreground"
    }`}
  >
    {text}
  </span>
);

const Admin = () => {
  const user = useCurrentUser();
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const [section, setSection] = useState<SectionId>(
    SECTION_IDS.includes(sectionParam as SectionId) ? (sectionParam as SectionId) : "dashboard",
  );
  const [menu, setMenu] = useState<"main" | "composer" | "admin">("admin");
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const [liveUsers, setLiveUsers] = useState<LiveUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  // Users section: filter tab, the row whose ⋯ menu is open (+ its screen
  // position — the menu renders position:fixed so the table scrollbox can't
  // clip it), and the row whose Composer checkbox was just ticked (pseudonym
  // not saved yet).
  const [userTab, setUserTab] = useState<UserTab>("all");
  // Dashboard → single-track license prices (site_config, server-priced carts).
  const [licPrices, setLicPrices] = useState<{ personal: string; commercial: string; professional: string } | null>(null);
  const [licBusy, setLicBusy] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [pseudonymDraftFor, setPseudonymDraftFor] = useState<string | null>(null);
  // Cue-sheet form inside the ⋯ menu (loaded when the menu opens).
  const [cueDraft, setCueDraft] = useState<Record<string, string>>({});
  const [cueBusy, setCueBusy] = useState(false);
  // "About the composer" text (composers.bio) — same menu, above the cue block.
  const [bioDraft, setBioDraft] = useState("");
  const [bioBusy, setBioBusy] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [licenses, setLicenses] = useState<AdminLicense[] | null>(null);
  const [licensesError, setLicensesError] = useState<string | null>(null);
  const [licenseQuery, setLicenseQuery] = useState("");
  // true while the site runs on sandbox keys — Stripe links get /test/.
  const [licensesTestMode, setLicensesTestMode] = useState(false);

  // Real dashboard numbers from the live users list (loaded below).
  const custUsers = liveUsers ?? [];
  const proCount = custUsers.filter((u) => u.plan === "pro").length;
  const maxCount = custUsers.filter((u) => u.plan === "max").length;
  const paidCount = proCount + maxCount;
  const freeCount = Math.max(0, custUsers.length - paidCount);
  const totalDownloads = custUsers.reduce((a, u) => a + (u.downloads ?? 0), 0);

  const isAdmin = !!user && user.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/content")
      .then(async (res) => {
        const d = (await res.json()) as { licensePrices?: { personal: number; commercial: number; professional: number } };
        if (d.licensePrices) {
          setLicPrices({
            personal: String(d.licensePrices.personal),
            commercial: String(d.licensePrices.commercial),
            professional: String(d.licensePrices.professional),
          });
        }
      })
      .catch(() => {
        // card just stays hidden
      });
  }, [isAdmin]);

  const saveLicPrices = async () => {
    if (!licPrices) return;
    setLicBusy(true);
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "set_license_prices",
          licensePrices: {
            personal: Number(licPrices.personal),
            commercial: Number(licPrices.commercial),
            professional: Number(licPrices.professional),
          },
        }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Save failed");
      window.alert("License prices saved — the site and checkout use them immediately.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLicBusy(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/users", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as { users?: LiveUser[]; error?: string };
        if (!res.ok || !data.users) throw new Error(data.error ?? "Failed to load users");
        setLiveUsers(data.users);
      })
      .catch((e: Error) => setUsersError(e.message));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || section !== "licenses") return;
    setLicensesError(null);
    fetch("/api/admin/licenses", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as {
          licenses?: AdminLicense[];
          stripeTestMode?: boolean;
          error?: string;
        };
        if (!res.ok || !data.licenses) throw new Error(data.error ?? "Failed to load licenses");
        setLicenses(data.licenses);
        setLicensesTestMode(!!data.stripeTestMode);
      })
      .catch((e: Error) => setLicensesError(e.message));
  }, [isAdmin, section]);

  const changeRole = async (userId: string, role: string) => {
    if (!liveUsers) return;
    const current = liveUsers.find((u) => u.id === userId);
    if (!current || current.role === role) return;
    // Guard rails around the admin role — both directions need a confirm.
    if (current.role === "admin" && role !== "admin") {
      if (
        !window.confirm(
          `Remove ADMIN access from ${current.email}?\nThey immediately lose the admin area and become "${role}".`,
        )
      )
        return;
    } else if (role === "admin") {
      if (
        !window.confirm(
          `Give ${current.email} FULL ADMIN access?\nAdmins can manage tracks, content, customers and billing.`,
        )
      )
        return;
    }
    const prev = liveUsers;
    setSavingUserId(userId);
    setUsersError(null);
    setLiveUsers(prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, role }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed");
    } catch (e) {
      setLiveUsers(prev);
      setUsersError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingUserId(null);
    }
  };

  // Composer pseudonym — shown as the track artist site-wide. Saved on blur/Enter.
  const savePseudonym = async (userId: string, pseudonym: string) => {
    if (!liveUsers) return;
    const current = liveUsers.find((u) => u.id === userId);
    const next = pseudonym.trim();
    if (!current || !next || next === (current.pseudonym ?? "")) return;
    setSavingUserId(userId);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, pseudonym: next }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed");
      setLiveUsers((us) => (us ?? []).map((u) => (u.id === userId ? { ...u, pseudonym: next } : u)));
      setPseudonymDraftFor(null);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingUserId(null);
    }
  };

  // Deletes a user account. Composer profiles get DETACHED server-side —
  // tracks always survive; only manual admin actions can delete tracks.
  const deleteUser = async (userId: string) => {
    const target = liveUsers?.find((u) => u.id === userId);
    if (!target) return;
    if (
      !window.confirm(
        `DELETE the account ${target.email}?\nTheir subscription and settings are removed. Any composer tracks stay on the site. This cannot be undone.`,
      )
    )
      return;
    setSavingUserId(userId);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Delete failed");
      setLiveUsers((us) => (us ?? []).filter((u) => u.id !== userId));
      setOpenMenuId(null);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSavingUserId(null);
    }
  };

  // Change a user's login email (owner account protected server-side too).
  const saveEmail = async (userId: string, raw: string) => {
    const target = liveUsers?.find((u) => u.id === userId);
    const email = raw.trim().toLowerCase();
    if (!target || !email || email === target.email) return;
    setSavingUserId(userId);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed");
      setLiveUsers((us) => (us ?? []).map((u) => (u.id === userId ? { ...u, email } : u)));
      toast.success(`Email changed to ${email}`);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Update failed");
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingUserId(null);
    }
  };

  // Save the composer's "about" text — it heads his public /artist/<slug> page.
  const saveBio = async (userId: string) => {
    setBioBusy(true);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, bio: bioDraft }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      setLiveUsers((us) => (us ?? []).map((u) => (u.id === userId ? { ...u, bio: bioDraft } : u)));
      toast.success("About text saved — it shows on the composer's artist page");
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBioBusy(false);
    }
  };

  // Upload rights: music and sounds are two separate permissions on the composer
  // profile. The tab in his panel appears/disappears with them — and the SERVER
  // refuses the upload either way, so this is a real gate, not a UI courtesy.
  const [permBusy, setPermBusy] = useState(false);
  const setUploadPerm = async (userId: string, key: "tracks" | "sfx", on: boolean) => {
    setPermBusy(true);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, uploads: { [key]: on } }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      setLiveUsers((us) =>
        (us ?? []).map((u) =>
          u.id === userId
            ? {
                ...u,
                cue: {
                  cueName: u.cue?.cueName ?? null,
                  pro: u.cue?.pro ?? null,
                  ipi: u.cue?.ipi ?? null,
                  publisherName: u.cue?.publisherName ?? null,
                  publisherPro: u.cue?.publisherPro ?? null,
                  publisherIpi: u.cue?.publisherIpi ?? null,
                  canUploadTracks:
                    key === "tracks" ? (on ? "1" : "0") : (u.cue?.canUploadTracks ?? "1"),
                  canUploadSfx: key === "sfx" ? (on ? "1" : "0") : (u.cue?.canUploadSfx ?? "0"),
                },
              }
            : u,
        ),
      );
      toast.success(
        `${key === "tracks" ? "Music" : "Sound effects"} uploads ${on ? "enabled" : "disabled"}`,
      );
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPermBusy(false);
    }
  };

  // Save the cue-sheet info (printed on license PDFs for this composer's tracks).
  const saveCue = async (userId: string) => {
    setCueBusy(true);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, cue: cueDraft }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      setLiveUsers((us) =>
        (us ?? []).map((u) =>
          u.id === userId
            ? {
                ...u,
                cue: {
                  cueName: cueDraft.cueName ?? "",
                  pro: cueDraft.pro ?? "",
                  ipi: cueDraft.ipi ?? "",
                  publisherName: cueDraft.publisherName ?? "",
                  publisherPro: cueDraft.publisherPro ?? "",
                  publisherIpi: cueDraft.publisherIpi ?? "",
                },
              }
            : u,
        ),
      );
      toast.success("Cue sheet info saved — it prints on this composer's license PDFs");
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setCueBusy(false);
    }
  };

  // Composer OFF: removes the pseudonym profile (server refuses while the
  // composer still has tracks, so nothing can be orphaned by accident).
  const removeComposer = async (userId: string) => {
    const target = liveUsers?.find((u) => u.id === userId);
    if (!target) return;
    if (
      !window.confirm(
        `Remove the composer profile from ${target.email}?\nThey lose the composer studio. Only possible while they have no tracks.`,
      )
    )
      return;
    setSavingUserId(userId);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, removeComposer: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed");
      setLiveUsers((us) =>
        (us ?? []).map((u) =>
          u.id === userId
            ? { ...u, pseudonym: null, role: u.role === "composer" ? "customer" : u.role }
            : u,
        ),
      );
      setPseudonymDraftFor(null);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingUserId(null);
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
          <h1 className="text-2xl text-foreground">Admin area</h1>
          <p className="mt-3 font-body text-sm text-muted-foreground">
            Owner access only. Sign in with the admin account.
          </p>
          <Link
            to="/login"
            className="mt-6 rounded-lg bg-[#F4C430] px-6 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
          >
            Sign in
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const pendingTracks = mockComposerTracks.filter((t) => t.status === "pending");

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <div className="flex flex-col gap-8 md:flex-row">
          <aside className="shrink-0 md:w-56">
            {/* Same spacing scale as the /account sidebar (groups mb-5, labels
                pb-1.5, items space-y-1) so nothing shifts when navigating
                between the two pages. Margin-based spacing only — no flex gap. */}
            <nav className="flex flex-col">
              <MenuGroupHeader label="Main" open={menu === "main"} onClick={() => setMenu("main")} />
              <div className={`flex-col ${menu === "main" ? "flex" : "hidden"}`}>
                {accountNavGroups.map((group) => (
                  <div key={group.label} className="md:mb-5">
                    <p className="px-3 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                      {group.label}
                    </p>
                    <div className="relative flex flex-col">
                      <MenuTreeLines />
                      {group.items.map((item) => (
                        <Link
                          key={item.id}
                          to={`/account?section=${item.id}`}
                          className="flex ml-8 h-9 items-center gap-2 rounded-lg pl-2 pr-3 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Composer studio — the owner composes too; links open the
                  account page where the composer sections live. */}
              <MenuGroupHeader
                label="Composer"
                open={menu === "composer"}
                onClick={() => setMenu("composer")}
              />
              <div className={`flex-col ${menu === "composer" ? "flex" : "hidden"}`}>
                <div className="md:mb-5">
                  <div className="relative flex flex-col">
                    <MenuTreeLines />
                    {composerNavItems.map((item) => (
                      <Link
                        key={item.id}
                        to={`/account?section=composer-${item.id}`}
                        className="flex ml-8 h-9 items-center gap-2 rounded-lg pl-2 pr-3 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              <MenuGroupHeader label="Admin" open={menu === "admin"} onClick={() => setMenu("admin")} />
              <div className={`flex-col ${menu === "admin" ? "flex" : "hidden"}`}>
                {adminNavGroups.map((group) => (
                  <div key={group.label} className="md:mb-5">
                    <p className="px-3 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                      {group.label}
                    </p>
                    {/* Items sit a step to the RIGHT of the header, joined to
                        it by the soft gold beams from the homepage trust block
                        (owner request) — smooth curves, no corners, nothing
                        lights up on selection. Uniform h-9 rows, no gaps: the
                        beam geometry depends on it. */}
                    <div className="relative flex flex-col">
                      <MenuTreeLines />
                      {group.items.map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => setSection(sec.id as SectionId)}
                          className={`ml-8 flex h-9 items-center gap-2 rounded-lg pl-2 pr-3 font-body text-sm transition-colors ${
                            section === sec.id ? "bg-secondary text-[#F4C430]" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <sec.icon className="h-4 w-4" />
                          {sec.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Log out lives in the header account popup — no sidebar copy. */}
            </nav>
          </aside>

          <div
            className={`flex min-w-0 flex-col gap-6 ${
              section === "licenses"
                ? "w-fit max-w-full xl:mr-[calc((72rem_-_100vw)/2)]"
                : section === "tracksedit"
                  ? "flex-1 xl:mr-[calc((72rem_-_100vw)/2)]"
                  : "flex-1"
            }`}
          >
            {section === "dashboard" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat
                    label="Customers"
                    value={liveUsers ? String(custUsers.length) : "—"}
                    sub={liveUsers ? `${freeCount} on Free` : undefined}
                  />
                  <Stat
                    label="Paid subscribers"
                    value={liveUsers ? String(paidCount) : "—"}
                    sub={liveUsers ? `Pro ${proCount} · Max ${maxCount}` : undefined}
                  />
                  <Stat
                    label="Downloads (all-time)"
                    value={liveUsers ? String(totalDownloads) : "—"}
                  />
                  <Stat
                    label="Paid share"
                    value={liveUsers && custUsers.length ? `${Math.round((paidCount / custUsers.length) * 100)}%` : "—"}
                    sub="of all accounts"
                  />
                </div>
                {usersError && (
                  <Card>
                    <p className="font-body text-sm text-red-400">{usersError}</p>
                  </Card>
                )}
                {!liveUsers && !usersError && (
                  <Card>
                    <p className="font-body text-sm text-muted-foreground">Loading live stats…</p>
                  </Card>
                )}
                {licPrices && (
                  <Card title="Single-track license prices (USD)">
                    <div className="flex flex-wrap items-end gap-4">
                      {(
                        [
                          ["personal", "Personal"],
                          ["commercial", "Commercial"],
                          ["professional", "Professional"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="flex flex-col gap-1 font-body text-xs text-muted-foreground">
                          {label}
                          <input
                            inputMode="decimal"
                            value={licPrices[key]}
                            onChange={(e) =>
                              setLicPrices((p) =>
                                p ? { ...p, [key]: e.target.value.replace(/[^0-9.]/g, "") } : p,
                              )
                            }
                            className="w-28 rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        disabled={licBusy}
                        onClick={() => void saveLicPrices()}
                        className="rounded-lg bg-[#F4C430] px-5 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
                      >
                        {licBusy ? "Saving…" : "Save prices"}
                      </button>
                    </div>
                    <p className="mt-3 font-body text-xs text-muted-foreground">
                      Used on the track page, cart and checkout — carts are always priced
                      server-side from these values.
                    </p>
                  </Card>
                )}
                <Card>
                  <p className="font-body text-sm text-muted-foreground">
                    Revenue &amp; funnel analytics will appear here once subscription billing goes live.
                  </p>
                </Card>

                {/* Everything below the rule is "services & credits" — the
                    dashboard is becoming the owner's single landing screen. */}
                <div className="my-2 h-px bg-border/60" />
                <AdminUsage />
                {/* Straight to the money page (owner request): OpenAI's billing
                    overview, where the balance is topped up. */}
                <a
                  href="https://platform.openai.com/settings/organization/billing/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-border px-4 py-2 font-body text-sm text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                >
                  OpenAI Billing — top up balance
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            )}


            {section === "tracks" && (
              <>
                {pendingTracks.length > 0 && (
                  <Card title={`Moderation queue (${pendingTracks.length})`}>
                    <ul className="divide-y divide-border/60">
                      {pendingTracks.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-4 py-2.5">
                          <span className="font-body text-sm text-foreground">
                            {t.title}
                            <span className="ml-2 text-xs text-muted-foreground">{composerName(t.composerId)}</span>
                          </span>
                          <span className="flex gap-2">
                            <button
                              type="button"
                              className="rounded-lg bg-[#F4C430] px-3 py-1.5 font-body text-xs font-semibold text-background hover:bg-[#F4C430]/85"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                            >
                              Reject
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <Card title={`Catalog (${mockComposerTracks.length})`}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] font-body text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-4">Title</th>
                          <th className="py-2 pr-4">Composer</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mockComposerTracks.map((t) => (
                          <tr key={t.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-4 text-foreground">{t.title}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{composerName(t.composerId)}</td>
                            <td className="py-2.5">
                              <StatusPill text={t.published ? "published" : t.status} active={t.published} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}

            {CONTENT_TAB[section] && <AdminContent tab={CONTENT_TAB[section]!} />}

            {section === "bulkupload" && <AdminBulkUpload />}

            {/* "SFX" = manage (library + categories), "Bulk SFX Upload" = the
                drop zone. The old "soundeffects" id keeps working for old links. */}
            {(section === "sfxedit" || section === "soundeffects") && <AdminSfx view="manage" />}

            {section === "sfxbulk" && <AdminSfx view="upload" />}

            {section === "import" && <AdminImport />}

            {/* Publication calendar for the /guides articles. */}
            {section === "articles" && <AdminGuides />}

            {/* Real money: revenue ledger, the 50/50 split, composer payouts. */}
            {section === "analytics" && <AdminAnalytics />}

            {section === "finance" && <AdminFinance />}


            {section === "customers" && (
              <Card title={`Users${liveUsers ? ` (${liveUsers.length})` : ""}`}>
                {usersError && (
                  <p className="mb-3 font-body text-xs text-red-400">{usersError}</p>
                )}
                {!liveUsers && !usersError && (
                  <p className="font-body text-sm text-muted-foreground">Loading users...</p>
                )}
                {liveUsers && liveUsers.length === 0 && (
                  <p className="font-body text-sm text-muted-foreground">No registered users yet.</p>
                )}
                {liveUsers && liveUsers.length > 0 && (() => {
                  /* Filter tabs + per-row ⋯ menu (owner request). Admin and
                     Composer are independent flags now — the owner is both. */
                  const admins = liveUsers.filter((u) => u.role === "admin");
                  const composers = liveUsers.filter(isComposerUser);
                  const plain = liveUsers.filter((u) => u.role !== "admin" && !isComposerUser(u));
                  const list =
                    userTab === "admins"
                      ? admins
                      : userTab === "composers"
                        ? composers
                        : userTab === "users"
                          ? plain
                          : liveUsers;
                  const tabs: [UserTab, string, number][] = [
                    ["all", "All", liveUsers.length],
                    ["users", "Users", plain.length],
                    ["composers", "Composers", composers.length],
                    ["admins", "Admins", admins.length],
                  ];
                  return (
                    <>
                      <div className="mb-4 flex w-fit gap-1 rounded-lg border border-border/60 bg-background/40 p-1">
                        {tabs.map(([id, label, n]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setUserTab(id)}
                            className={`rounded-md px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
                              userTab === id
                                ? "bg-secondary text-[#F4C430]"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {label} <span className="opacity-60">({n})</span>
                          </button>
                        ))}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] font-body text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="py-2 pr-4">User</th>
                              <th className="py-2 pr-4">Roles</th>
                              <th className="py-2 pr-4">Plan</th>
                              <th className="py-2 pr-4">Downloads</th>
                              <th className="py-2 pr-4">Joined</th>
                              <th className="py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((u) => (
                              <tr key={u.id} className="border-b border-border/50 last:border-0">
                                <td className="py-2.5 pr-4">
                                  <button
                                    type="button"
                                    onClick={() => setProfileUserId(u.id)}
                                    className="block text-left text-foreground hover:text-[#F4C430]"
                                  >
                                    {u.name ?? u.email.split("@")[0]}
                                  </button>
                                  <span className="block text-xs text-muted-foreground">{u.email}</span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    {u.role === "admin" && (
                                      <span className="rounded-full bg-[#F4C430]/15 px-2.5 py-0.5 text-xs font-semibold text-[#F4C430]">
                                        Admin
                                      </span>
                                    )}
                                    {isComposerUser(u) && (
                                      <span className="rounded-full border border-[#F4C430]/40 px-2.5 py-0.5 text-xs text-[#F4C430]/90">
                                        Composer{u.pseudonym ? ` · ${u.pseudonym}` : ""}
                                      </span>
                                    )}
                                    {u.role !== "admin" && !isComposerUser(u) && (
                                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                                        Customer
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <StatusPill text={u.plan ?? "free"} active={!!u.plan && u.plan !== "free"} />
                                    {/* Portal-canceled but still running: same state the
                                        customer sees on Plan & Billing. */}
                                    {!!u.plan && u.plan !== "free" && !!u.plan_cancels && (
                                      <span
                                        title={u.plan_until ? `Active until ${u.plan_until.slice(0, 10)}, then Free` : "Won't renew"}
                                        className="whitespace-nowrap rounded-full bg-[#F4C430]/15 px-2 py-0.5 text-[10px] font-semibold text-[#F4C430]"
                                      >
                                        canceled{u.plan_until ? ` · until ${u.plan_until.slice(0, 10)}` : ""}
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4 text-muted-foreground">{u.downloads}</td>
                                <td className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">
                                  {u.created_at ? u.created_at.slice(0, 10) : "—"}
                                </td>
                                <td className="py-2.5 text-right">
                                  <button
                                    type="button"
                                    aria-label={`Manage ${u.email}`}
                                    onClick={(e) => {
                                      if (openMenuId === u.id) {
                                        setOpenMenuId(null);
                                        return;
                                      }
                                      const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                      setMenuPos({
                                        top: r.bottom + 6,
                                        right: Math.max(8, window.innerWidth - r.right),
                                      });
                                      setOpenMenuId(u.id);
                                      setPseudonymDraftFor(null);
                                      setBioDraft(u.bio ?? "");
                                      setCueDraft({
                                        cueName: u.cue?.cueName ?? "",
                                        pro: u.cue?.pro ?? "",
                                        ipi: u.cue?.ipi ?? "",
                                        publisherName: u.cue?.publisherName ?? "",
                                        publisherPro: u.cue?.publisherPro ?? "",
                                        publisherIpi: u.cue?.publisherIpi ?? "",
                                      });
                                    }}
                                    className={`rounded-md border px-2 py-1 transition-colors ${
                                      openMenuId === u.id
                                        ? "border-[#F4C430] text-[#F4C430]"
                                        : "border-border/60 text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                                    }`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </Card>
            )}

            {/* ⋯ menu — position:fixed so the table's scrollbox can't clip it. */}
            {section === "customers" && openMenuId && menuPos && (() => {
              const u = liveUsers?.find((x) => x.id === openMenuId);
              if (!u) return null;
              const composerOn = isComposerUser(u);
              const showPseudonym = composerOn || pseudonymDraftFor === u.id;
              const ownerLocked = u.email === OWNER_EMAIL;
              return (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                  <div
                    className="fixed z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-2xl"
                    style={{ top: menuPos.top, right: menuPos.right }}
                  >
                    <p className="mb-3 truncate font-body text-xs text-muted-foreground">{u.email}</p>
                    <label
                      className={`flex items-center gap-2.5 font-body text-sm text-foreground ${
                        ownerLocked ? "opacity-50" : "cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#F4C430]"
                        checked={u.role === "admin"}
                        disabled={ownerLocked || savingUserId === u.id}
                        onChange={() => void changeRole(u.id, u.role === "admin" ? "customer" : "admin")}
                      />
                      Admin
                    </label>
                    {ownerLocked && (
                      <p className="mt-1 pl-[26px] font-body text-[11px] text-muted-foreground">
                        The owner account always stays admin.
                      </p>
                    )}
                    {/* Login email (saves on Enter / click away; owner protected). */}
                    {!ownerLocked && (
                      <div className="mt-3">
                        <p className="mb-1 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
                          Login email
                        </p>
                        <input
                          defaultValue={u.email}
                          disabled={savingUserId === u.id}
                          onBlur={(e) => void saveEmail(u.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    )}
                    <label className="mt-3 flex cursor-pointer items-center gap-2.5 font-body text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#F4C430]"
                        checked={composerOn || pseudonymDraftFor === u.id}
                        disabled={savingUserId === u.id}
                        onChange={() => {
                          if (composerOn) void removeComposer(u.id);
                          else setPseudonymDraftFor((p) => (p === u.id ? null : u.id));
                        }}
                      />
                      Composer
                    </label>
                    {showPseudonym && (
                      <div className="mt-2 pl-[26px]">
                        <input
                          defaultValue={u.pseudonym ?? ""}
                          placeholder="Pseudonym (artist name)…"
                          autoFocus={pseudonymDraftFor === u.id}
                          disabled={savingUserId === u.id}
                          onBlur={(e) => void savePseudonym(u.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-body text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none disabled:opacity-50"
                        />
                        <p className="mt-1 font-body text-[11px] text-muted-foreground">
                          Shown as the track artist site-wide. Saves on Enter / click away.
                        </p>
                      </div>
                    )}
                    {/* About the composer — heads his public /artist/<slug> page. */}
                    {composerOn && (
                      <div className="mt-4 border-t border-border/60 pt-3">
                        <p className="mb-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4C430]">
                          About the composer
                        </p>
                        <textarea
                          rows={4}
                          value={bioDraft}
                          placeholder="A few lines about this composer — shown on his artist page…"
                          disabled={bioBusy}
                          onChange={(e) => setBioDraft(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-body text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={bioBusy}
                          onClick={() => void saveBio(u.id)}
                          className="mt-2 w-full rounded-lg bg-[#F4C430] px-3 py-1.5 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
                        >
                          {bioBusy ? "Saving…" : "Save about text"}
                        </button>
                        <p className="mt-1.5 font-body text-[10px] text-muted-foreground">
                          Shown under the pseudonym on the artist page — the page every
                          "by {u.pseudonym ?? "…"}" link under a track title opens.
                        </p>
                      </div>
                    )}
                    {/* What this composer is allowed to upload. */}
                    {composerOn && (
                      <div className="mt-4 border-t border-border/60 pt-3">
                        <p className="mb-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4C430]">
                          Can upload
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {(
                            [
                              ["tracks", "Music (tracks)", u.cue?.canUploadTracks !== "0"],
                              ["sfx", "Sound effects", u.cue?.canUploadSfx === "1"],
                            ] as const
                          ).map(([key, label, on]) => (
                            <button
                              key={key}
                              type="button"
                              disabled={permBusy}
                              onClick={() => void setUploadPerm(u.id, key, !on)}
                              className="flex items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                  on ? "border-[#F4C430] bg-[#F4C430]" : "border-border"
                                }`}
                              >
                                {on && <Check className="h-3 w-3 text-background" />}
                              </span>
                              <span className="font-body text-xs text-foreground">{label}</span>
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 font-body text-[10px] text-muted-foreground">
                          Turns the Upload tab in his panel on and off — and the server refuses the
                          upload either way.
                        </p>
                      </div>
                    )}
                    {/* Sync / cue-sheet info — printed on this composer's license PDFs. */}
                    {composerOn && (
                      <div className="mt-4 border-t border-border/60 pt-3">
                        <p className="mb-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4C430]">
                          Sync / Cue Sheet Info
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {(
                            [
                              ["cueName", "Composer (legal name)"],
                              ["pro", "PRO (BMI, ASCAP…)"],
                              ["ipi", "IPI / CAE"],
                              ["publisherName", "Publisher"],
                              ["publisherPro", "Publisher PRO"],
                              ["publisherIpi", "Publisher IPI / CAE"],
                            ] as const
                          ).map(([key, ph]) => (
                            <input
                              key={key}
                              value={cueDraft[key] ?? ""}
                              placeholder={ph}
                              disabled={cueBusy}
                              onChange={(e) => setCueDraft((d) => ({ ...d, [key]: e.target.value }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-body text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none disabled:opacity-50"
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={cueBusy}
                          onClick={() => void saveCue(u.id)}
                          className="mt-2 w-full rounded-lg bg-[#F4C430] px-3 py-1.5 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
                        >
                          {cueBusy ? "Saving…" : "Save cue sheet info"}
                        </button>
                        <p className="mt-1.5 font-body text-[10px] text-muted-foreground">
                          Printed in the "Sync / Cue Sheet Information" block of every license PDF
                          for this composer's tracks.
                        </p>
                      </div>
                    )}
                    {/* Danger zone: delete the account (owner + yourself are protected). */}
                    {!ownerLocked && u.email !== user.email && (
                      <button
                        type="button"
                        disabled={savingUserId === u.id}
                        onClick={() => void deleteUser(u.id)}
                        className="mt-4 w-full rounded-lg border border-red-400/40 px-3 py-1.5 font-body text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                      >
                        Delete user…
                      </button>
                    )}
                  </div>
                </>
              );
            })()}

            {section === "whitelist" && <AdminWhitelist />}

            {section === "claims" && <AdminClaims onOpenCustomer={setProfileUserId} />}

            {section === "campaigns" && <AdminCampaign />}

            {section === "mail" && <AdminInbox onOpenCustomer={setProfileUserId} />}

            {section === "licenses" && (
              <Card title={`Licenses${licenses ? ` (${licenses.length})` : ""}`}>
                <p className="mb-4 font-body text-xs text-muted-foreground">
                  Every license issued — one-time purchases and subscription (plan) certificates.
                  Search by the License Code printed on a customer's certificate, their email, or the
                  track title, to see who received it, for which track/plan, and when.
                </p>
                <input
                  placeholder="Search by License ID, email or track..."
                  value={licenseQuery}
                  onChange={(e) => setLicenseQuery(e.target.value)}
                  className="mb-4 w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
                />
                {licensesError && <p className="mb-3 font-body text-xs text-red-400">{licensesError}</p>}
                {!licenses && !licensesError && (
                  <p className="font-body text-sm text-muted-foreground">Loading licenses...</p>
                )}
                {licenses && (() => {
                  const q = licenseQuery.trim().toLowerCase();
                  const rows = q
                    ? licenses.filter(
                        (l) =>
                          l.id.toLowerCase().includes(q) ||
                          l.reference.toLowerCase().includes(q) ||
                          l.userEmail.toLowerCase().includes(q) ||
                          l.userName.toLowerCase().includes(q) ||
                          l.trackTitle.toLowerCase().includes(q),
                      )
                    : licenses;
                  if (rows.length === 0) {
                    return <p className="font-body text-sm text-muted-foreground">No matching licenses.</p>;
                  }
                  // Row list instead of a 1040px table: everything fits the box
                  // width (no horizontal scrollbar), long values truncate, and
                  // the columns collapse into a card on small screens.
                  const GRID =
                    "lg:grid-cols-[minmax(0,1.15fr)_6.5rem_minmax(0,0.9fr)_minmax(0,1fr)_4.5rem_minmax(0,1.15fr)_minmax(0,0.75fr)_6.5rem]";
                  return (
                    <div className="font-body text-sm">
                      <div
                        className={`hidden border-b border-border pb-2 text-xs uppercase tracking-wide text-muted-foreground lg:grid lg:gap-4 ${GRID}`}
                      >
                        <span>License</span>
                        <span>Type</span>
                        <span>Payment</span>
                        <span>Buyer</span>
                        <span>Plan</span>
                        <span>Track</span>
                        <span>Amount</span>
                        <span className="text-right">Issued</span>
                      </div>
                      <ul className="divide-y divide-border/50">
                        {rows.map((l) => {
                          const refToken = l.reference.split(":")[0];
                          const isStripe =
                            l.provider === "stripe" ||
                            refToken.startsWith("cs_") ||
                            refToken.startsWith("in_") ||
                            refToken.startsWith("pi_");
                          const isTest = licensesTestMode || l.reference.includes("_test_");
                          const payBase = `https://dashboard.stripe.com/${isTest ? "test/" : ""}`;
                          // pi_… -> the payment, in_… (subscription invoice) -> the
                          // invoice; otherwise a dashboard search with the ref.
                          const payUrl =
                            l.reference && isStripe
                              ? l.paymentIntent
                                ? `${payBase}payments/${l.paymentIntent}`
                                : refToken.startsWith("in_")
                                  ? `${payBase}invoices/${refToken}`
                                  : `${payBase}search?query=${encodeURIComponent(refToken)}`
                              : null;
                          // plan_licenses rows minted for a track the customer
                          // BOUGHT carry plan "license" — spell that out instead
                          // of the confusing "License plan".
                          const tierLabel =
                            l.kind === "subscription"
                              ? l.tier.toLowerCase() === "license plan"
                                ? "Purchased track — download certificate"
                                : l.tier
                              : `${l.tier} license`;
                          return (
                            <li
                              key={`${l.kind}-${l.id}`}
                              className={`grid gap-2 py-3 lg:items-center lg:gap-4 ${GRID} grid-cols-1`}
                            >
                              {/* License code (opens the certificate PDF) */}
                              <div className="min-w-0">
                                <a
                                  href={`/api/license-pdf?${l.kind === "subscription" ? "code" : "order"}=${encodeURIComponent(l.id)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open the certificate PDF"
                                  className="block truncate font-mono text-xs text-[#F4C430] hover:underline"
                                >
                                  {l.id}
                                </a>
                              </div>
                              {/* Type */}
                              <div className="min-w-0">
                                <span
                                  className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    l.kind === "subscription"
                                      ? "bg-[#F4C430]/15 text-[#F4C430]"
                                      : "bg-secondary text-muted-foreground"
                                  }`}
                                >
                                  {l.kind === "subscription" ? "Subscription" : "One-time"}
                                </span>
                              </div>
                              {/* Payment: gold "Open in Stripe" link + the raw ref.
                                  Subscription certificates have no payment of their
                                  own — the plan's payments live in Money -> Finance. */}
                              <div className="min-w-0">
                                {l.reference ? (
                                  <>
                                    {payUrl ? (
                                      <a
                                        href={payUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open this payment in Stripe — refund it there if needed"
                                        className="text-xs font-semibold text-[#F4C430] hover:underline"
                                      >
                                        {isStripe ? "Stripe ↗" : "PayPal"}
                                      </a>
                                    ) : (
                                      <span
                                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                          isStripe ? "bg-indigo-500/20 text-indigo-300" : "bg-sky-500/20 text-sky-300"
                                        }`}
                                      >
                                        {isStripe ? "Stripe" : "PayPal"}
                                      </span>
                                    )}
                                    <span
                                      title={l.reference}
                                      className="mt-0.5 block select-all truncate font-mono text-[10px] text-muted-foreground"
                                    >
                                      {l.reference}
                                    </span>
                                  </>
                                ) : (
                                  <span
                                    className="text-xs text-muted-foreground"
                                    title="Plan certificate — the subscription's payments are in Money → Finance"
                                  >
                                    —
                                  </span>
                                )}
                              </div>
                              {/* Buyer */}
                              <div className="min-w-0">
                                {l.userId ? (
                                  <button
                                    type="button"
                                    onClick={() => setProfileUserId(l.userId)}
                                    title="Open customer profile"
                                    className="block max-w-full truncate text-left text-foreground hover:text-[#F4C430]"
                                  >
                                    {l.userName || l.userEmail.split("@")[0]}
                                  </button>
                                ) : (
                                  <span className="block truncate text-foreground">
                                    {l.userName || l.userEmail.split("@")[0]}
                                  </span>
                                )}
                                <span className="block truncate text-xs text-muted-foreground">{l.userEmail}</span>
                              </div>
                              {/* Buyer's CURRENT plan — same pill as in Users. */}
                              <div className="min-w-0">
                                <StatusPill
                                  text={l.buyerPlan ?? "free"}
                                  active={!!l.buyerPlan && l.buyerPlan !== "free"}
                                />
                              </div>
                              {/* Track (clickable when we know its slug) + tier/plan */}
                              <div className="min-w-0">
                                {l.trackSlug ? (
                                  <a
                                    href={`/track/${l.trackSlug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open the track page"
                                    className="block truncate text-foreground hover:text-[#F4C430]"
                                  >
                                    {l.trackTitle}
                                  </a>
                                ) : (
                                  <span className="block truncate text-foreground">{l.trackTitle}</span>
                                )}
                                <span className="block truncate text-xs capitalize text-muted-foreground">
                                  {tierLabel}
                                </span>
                              </div>
                              {/* Amount: solo = purchase price + fee/net; subscription
                                  certificates = what the covering payment costs. */}
                              <div className="min-w-0">
                                <span className="font-semibold" style={{ color: GOLD }}>
                                  {l.price === null ? "—" : `$${l.price}`}
                                </span>
                                {l.pricePer && (
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    per {l.pricePer}
                                  </span>
                                )}
                                {(l.feeCents != null || l.netCents != null) && (
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {l.feeCents != null && `fee $${(l.feeCents / 100).toFixed(2)}`}
                                    {l.feeCents != null && l.netCents != null && " · "}
                                    {l.netCents != null && `net $${(l.netCents / 100).toFixed(2)}`}
                                  </span>
                                )}
                              </div>
                              {/* Dates */}
                              <div className="text-xs text-muted-foreground lg:text-right">
                                <span className="block">{l.createdAt ? l.createdAt.slice(0, 10) : "—"}</span>
                                {l.validUntil && <span className="block">until {l.validUntil.slice(0, 10)}</span>}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}
              </Card>
            )}

            {section === "requests" && (
              <>
                <Card title="Briefs">
                  <ul className="divide-y divide-border/60">
                    {mockBriefs.map((b) => (
                      <li key={b.id} className="py-3">
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-body text-sm font-semibold text-foreground">
                            {b.name} · <span className="font-normal capitalize">{b.type}</span>
                          </span>
                          <span className="font-body text-xs text-muted-foreground">{b.budget}</span>
                        </div>
                        <p className="mt-1 font-body text-xs text-muted-foreground">{b.description}</p>
                        <p className="mt-1 font-body text-xs">
                          <span className="text-muted-foreground">Assigned: </span>
                          <span style={{ color: GOLD }}>
                            {b.assignedComposerId ? composerName(b.assignedComposerId) : "unassigned"}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
      {profileUserId && (
        <AdminCustomerProfile userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
      <Footer />
    </div>
  );
};

export default Admin;
