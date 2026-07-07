import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogOut } from "lucide-react";
import { logout } from "@/hooks/useAuth";
import { accountNavGroups, adminNavItems } from "@/lib/adminNav";
import MenuGroupHeader from "@/components/MenuGroupHeader";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useCurrentUser } from "@/hooks/useMockData";
import {
  mockAdminStats,
  mockBriefs,
  mockClaimRequests,
  mockComposers,
  mockComposerTracks,
  mockPayoutLines,
  mockPayoutPeriods,
  mockWhitelistChannels,
  PLATFORM_SHARE,
} from "@/mocks";
import AdminContent from "@/components/AdminContent";
import AdminWhitelist from "@/components/AdminWhitelist";
import AdminCampaign from "@/components/AdminCampaign";
import AdminInbox from "@/components/AdminInbox";
import AdminCustomerProfile from "@/components/AdminCustomerProfile";

const GOLD = "#F4C430";

type SectionId =
  | "dashboard"
  | "finance"
  | "tracks"
  | "collections"
  | "playlists"
  | "categories"
  | "vocabulary"
  | "trending"
  | "tracksedit"
  | "customers"
  | "licenses"
  | "whitelist"
  | "campaigns"
  | "mail"
  | "requests";

const SECTION_IDS: SectionId[] = [
  "dashboard",
  "finance",
  "tracks",
  "collections",
  "playlists",
  "categories",
  "vocabulary",
  "trending",
  "tracksedit",
  "customers",
  "licenses",
  "whitelist",
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
  downloads: number;
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
  trackTitle: string;
}

const ROLES = ["customer", "composer", "admin"] as const;

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const [section, setSection] = useState<SectionId>(
    SECTION_IDS.includes(sectionParam as SectionId) ? (sectionParam as SectionId) : "dashboard",
  );
  const [menu, setMenu] = useState<"main" | "admin">("admin");
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const [liveUsers, setLiveUsers] = useState<LiveUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [licenses, setLicenses] = useState<AdminLicense[] | null>(null);
  const [licensesError, setLicensesError] = useState<string | null>(null);
  const [licenseQuery, setLicenseQuery] = useState("");
  const s = mockAdminStats;

  const isAdmin = !!user && user.role === "admin";

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
        const data = (await res.json()) as { licenses?: AdminLicense[]; error?: string };
        if (!res.ok || !data.licenses) throw new Error(data.error ?? "Failed to load licenses");
        setLicenses(data.licenses);
      })
      .catch((e: Error) => setLicensesError(e.message));
  }, [isAdmin, section]);

  const changeRole = async (userId: string, role: string) => {
    if (!liveUsers) return;
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
            <nav className="flex flex-col gap-1">
              <MenuGroupHeader label="Main" open={menu === "main"} onClick={() => setMenu("main")} />
              {menu === "main" && (
                <div className="mb-3 flex flex-col gap-3">
                  {accountNavGroups.map((group) => (
                    <div key={group.label}>
                      <p className="px-3 pb-1 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
                        {group.label}
                      </p>
                      {group.items.map((item) => (
                        <Link
                          key={item.id}
                          to={`/account?section=${item.id}`}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <MenuGroupHeader label="Admin" open={menu === "admin"} onClick={() => setMenu("admin")} />
              {menu === "admin" && (
                <div className="flex gap-1 overflow-x-auto md:flex-col">
                  {adminNavItems.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setSection(sec.id as SectionId)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm transition-colors ${
                        section === sec.id ? "bg-secondary text-[#F4C430]" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <sec.icon className="h-4 w-4" />
                      {sec.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
                className="mt-1 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm text-red-400 transition-colors hover:text-red-300"
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </button>
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
                  <Stat label="MRR" value={`$${s.mrr}`} sub={`+${s.mrrGrowthPct}% vs last month`} />
                  <Stat
                    label="Subscribers"
                    value={`${s.subscribers.pro + s.subscribers.max}`}
                    sub={`Pro ${s.subscribers.pro} · Max ${s.subscribers.max} · Free ${s.subscribers.free}`}
                  />
                  <Stat label="Free → Paid" value={`${s.freeToPaidPct}%`} sub={`churn ${s.churnPct}%/mo`} />
                  <Stat label="Downloads (30d)" value={`${s.downloads30d}`} sub={`${s.signups30d} new signups`} />
                </div>
                <Card title="Revenue streams (this month)">
                  <ul className="flex flex-col gap-3">
                    {s.revenueStreams.map((r) => {
                      const total = s.revenueStreams.reduce((a, b) => a + b.amount, 0);
                      const pct = (r.amount / total) * 100;
                      return (
                        <li key={r.label}>
                          <div className="flex justify-between font-body text-sm">
                            <span className="text-foreground">{r.label}</span>
                            <span className="font-semibold" style={{ color: GOLD }}>${r.amount}</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: GOLD }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
                <Card title="Funnel (30 days)">
                  <div className="grid grid-cols-2 gap-4 font-body text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-2xl font-semibold text-foreground">{s.visitors30d}</p>
                      <p className="text-xs text-muted-foreground">visitors</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-foreground">{s.signups30d}</p>
                      <p className="text-xs text-muted-foreground">free accounts ({((s.signups30d / s.visitors30d) * 100).toFixed(1)}%)</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-foreground">{s.downloads30d}</p>
                      <p className="text-xs text-muted-foreground">downloads</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold" style={{ color: GOLD }}>
                        {Math.round(s.signups30d * (s.freeToPaidPct / 100))}
                      </p>
                      <p className="text-xs text-muted-foreground">new paid subs</p>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {section === "finance" && (
              <>
                <Card title="Payout periods">
                  <div className="flex flex-col gap-3">
                    {mockPayoutPeriods.map((p) => {
                      const lines = mockPayoutLines.filter((l) => l.periodId === p.id);
                      const open = openPeriod === p.id;
                      return (
                        <div key={p.id} className="rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => setOpenPeriod(open ? null : p.id)}
                            className="flex w-full items-center justify-between gap-4 p-4 text-left"
                          >
                            <span className="font-body text-sm font-semibold text-foreground">{p.month}</span>
                            <span className="hidden font-body text-xs text-muted-foreground sm:block">
                              net ${p.netRevenue} · platform ${p.platformShare} · authors ${p.authorPool}
                            </span>
                            <StatusPill text={p.status} active={p.status === "paid"} />
                          </button>
                          {open && (
                            <div className="border-t border-border/60 p-4">
                              <table className="w-full font-body text-sm">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                                    <th className="pb-2 pr-4">Composer</th>
                                    <th className="pb-2 pr-4">Downloads</th>
                                    <th className="pb-2">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lines.map((l) => (
                                    <tr key={l.id} className="border-t border-border/40">
                                      <td className="py-2 pr-4 text-foreground">{composerName(l.composerId)}</td>
                                      <td className="py-2 pr-4 text-muted-foreground">{l.downloadsCount}</td>
                                      <td className="py-2 font-semibold" style={{ color: GOLD }}>
                                        ${l.amount.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {p.status !== "paid" && (
                                <div className="mt-4 flex gap-3">
                                  <button
                                    type="button"
                                    className="rounded-lg border border-border px-4 py-2 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                                  >
                                    Generate statements
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg bg-[#F4C430] px-4 py-2 font-body text-xs font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                                  >
                                    Mark paid
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
                <Card title="Split settings">
                  <div className="grid gap-3 font-body text-sm sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-muted-foreground">
                      Platform share, %
                      <input
                        defaultValue={PLATFORM_SHARE * 100}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-[#F4C430] focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-muted-foreground">
                      Max-download weight
                      <input
                        defaultValue={1}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-[#F4C430] focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-muted-foreground">
                      Payout threshold, $
                      <input
                        defaultValue={50}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-[#F4C430] focus:outline-none"
                      />
                    </label>
                  </div>
                </Card>
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

            {section === "customers" && (
              <Card title={`Customers${liveUsers ? ` (${liveUsers.length})` : ""}`}>
                {usersError && (
                  <p className="mb-3 font-body text-xs text-red-400">{usersError}</p>
                )}
                {!liveUsers && !usersError && (
                  <p className="font-body text-sm text-muted-foreground">Loading users...</p>
                )}
                {liveUsers && liveUsers.length === 0 && (
                  <p className="font-body text-sm text-muted-foreground">No registered users yet.</p>
                )}
                {liveUsers && liveUsers.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] font-body text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-4">User</th>
                          <th className="py-2 pr-4">Role</th>
                          <th className="py-2 pr-4">Plan</th>
                          <th className="py-2 pr-4">Downloads</th>
                          <th className="py-2">Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveUsers.map((u) => (
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
                              <select
                                value={u.role}
                                disabled={savingUserId === u.id}
                                onChange={(e) => void changeRole(u.id, e.target.value)}
                                className="rounded-md border border-border bg-background px-2 py-1 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none disabled:opacity-50"
                              >
                                {ROLES.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 pr-4">
                              <StatusPill text={u.plan ?? "free"} active={!!u.plan && u.plan !== "free"} />
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{u.downloads}</td>
                            <td className="py-2.5 text-muted-foreground">
                              {u.created_at ? u.created_at.slice(0, 10) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {section === "whitelist" && <AdminWhitelist />}

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
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[880px] font-body text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-4">License Code</th>
                            <th className="py-2 pr-4">Kind</th>
                            <th className="py-2 pr-4">Buyer</th>
                            <th className="py-2 pr-4">Track</th>
                            <th className="py-2 pr-4">Tier / Plan</th>
                            <th className="py-2 pr-4">Price</th>
                            <th className="py-2 pr-4">Issued</th>
                            <th className="py-2">Valid until</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((l) => (
                            <tr key={`${l.kind}-${l.id}`} className="border-b border-border/50 last:border-0">
                              <td className="py-2.5 pr-4">
                                <a
                                  href={`/api/license-pdf?${l.kind === "subscription" ? "code" : "order"}=${encodeURIComponent(l.id)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-xs text-[#F4C430] hover:underline"
                                >
                                  {l.id}
                                </a>
                              </td>
                              <td className="py-2.5 pr-4">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs ${
                                    l.kind === "subscription"
                                      ? "bg-[#F4C430]/15 text-[#F4C430]"
                                      : "bg-secondary text-muted-foreground"
                                  }`}
                                >
                                  {l.kind === "subscription" ? "Subscription" : "One-time"}
                                </span>
                              </td>
                              <td className="py-2.5 pr-4">
                                {l.userId ? (
                                  <button
                                    type="button"
                                    onClick={() => setProfileUserId(l.userId)}
                                    className="block text-left text-foreground hover:text-[#F4C430]"
                                  >
                                    {l.userName || l.userEmail.split("@")[0]}
                                  </button>
                                ) : (
                                  <span className="block text-foreground">{l.userName || l.userEmail.split("@")[0]}</span>
                                )}
                                <span className="block text-xs text-muted-foreground">{l.userEmail}</span>
                              </td>
                              <td className="py-2.5 pr-4 text-foreground">{l.trackTitle}</td>
                              <td className="py-2.5 pr-4 capitalize text-muted-foreground">{l.tier}</td>
                              <td className="py-2.5 pr-4 font-semibold" style={{ color: GOLD }}>
                                {l.price === null ? "—" : `$${l.price}`}
                              </td>
                              <td className="py-2.5 pr-4 text-muted-foreground">
                                {l.createdAt ? l.createdAt.slice(0, 10) : "—"}
                              </td>
                              <td className="py-2.5 text-muted-foreground">
                                {l.validUntil ? l.validUntil.slice(0, 10) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </Card>
            )}

            {section === "requests" && (
              <>
                <Card title="Whitelist requests">
                  <ul className="divide-y divide-border/60">
                    {mockWhitelistChannels.map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-4 py-2.5">
                        <span className="truncate font-body text-sm text-foreground">{w.channelUrl}</span>
                        <StatusPill text={w.status} active={w.status === "active"} />
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card title="Claim removals">
                  <ul className="divide-y divide-border/60">
                    {mockClaimRequests.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-4 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate font-body text-sm text-foreground">{c.videoUrl}</span>
                          <span className="block font-body text-xs text-muted-foreground">
                            {composerName(c.composerId)}
                          </span>
                        </span>
                        <StatusPill text={c.status === "done" ? "resolved" : c.status.replace("_", " ")} active={c.status === "done"} />
                      </li>
                    ))}
                  </ul>
                </Card>
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
