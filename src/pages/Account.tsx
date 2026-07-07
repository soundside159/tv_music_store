import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, LogOut } from "lucide-react";
import { accountNavGroups, adminNavItems } from "@/lib/adminNav";
import MenuGroupHeader from "@/components/MenuGroupHeader";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { catalogTracks } from "@/data/catalogTracks";
import {
  useCurrentUser,
  useMyDownloads,
  useMyLicenses,
  usePlans,
  useSubscription,
} from "@/hooks/useMockData";
import { mockClaimRequests } from "@/mocks";
import MyChannels from "@/components/MyChannels";
import NotificationsSettings from "@/components/NotificationsSettings";
import { logout, updateProfile } from "@/hooks/useAuth";
import { BILLING_ENABLED, openBillingPortal, openPlanModal } from "@/lib/billing";
import { downloadTrackVersion } from "@/lib/downloadTrack";

const GOLD = "#F4C430";

type SectionId =
  | "profile"
  | "notifications"
  | "downloads"
  | "license"
  | "whitelist"
  | "claims"
  | "billing"
  | "support";

const SECTION_IDS: SectionId[] = [
  "profile",
  "notifications",
  "downloads",
  "license",
  "whitelist",
  "claims",
  "billing",
  "support",
];

const trackTitle = (trackId: string) =>
  catalogTracks.find((t) => t.id === trackId)?.title ?? `Track ${trackId.replace("trk_", "#")}`;

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border bg-card p-6">
    <h2 className="font-body text-base font-semibold text-foreground">{title}</h2>
    <div className="mt-4">{children}</div>
  </div>
);

const EmptyNote = ({ text }: { text: string }) => (
  <p className="font-body text-sm text-muted-foreground">{text}</p>
);

const Account = () => {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const subscription = useSubscription();
  const plans = usePlans();
  const downloads = useMyDownloads();
  const syncOrders = useMyLicenses();
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const [section, setSection] = useState<SectionId>(
    SECTION_IDS.includes(sectionParam as SectionId) ? (sectionParam as SectionId) : "profile",
  );
  const [menu, setMenu] = useState<"main" | "admin">("main");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const plan = plans.find((p) => p.id === subscription?.plan);
  const claims = user ? mockClaimRequests.filter((c) => c.userId === user.id) : [];
  const planSubtitle =
    plan?.id === "max"
      ? "Full access — unlimited downloads, WAV, stems & commercial license"
      : plan?.id === "pro"
        ? "Unlimited downloads — upgrade to Max for WAV, stems & commercial license"
        : "Upgrade to unlock unlimited downloads & WAV";

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
          <h1 className="text-2xl text-foreground">Your account</h1>
          <p className="mt-3 font-body text-sm text-muted-foreground">
            Sign in to see your downloads, licenses, whitelisted channels and billing.
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

  const isCanceled = subscription?.status === "canceled";

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <div className="flex flex-col gap-8 md:flex-row">
          {/* Sidebar */}
          <aside className="shrink-0 md:w-56">
            <nav className="flex gap-4 overflow-x-auto md:flex-col md:gap-0">
              {user.role === "admin" && (
                <MenuGroupHeader label="Main" open={menu === "main"} onClick={() => setMenu("main")} />
              )}
              {(user.role !== "admin" || menu === "main") &&
                accountNavGroups.map((group) => (
                  <div key={group.label} className="shrink-0 md:mb-5">
                    <p className="px-3 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                      {group.label}
                    </p>
                    <div className="flex gap-1 md:flex-col">
                      {group.items.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSection(s.id as SectionId)}
                          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm transition-colors ${
                            section === s.id
                              ? "bg-secondary text-[#F4C430]"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <s.icon className="h-4 w-4" />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              {user.role === "admin" && (
                <div className="shrink-0 md:mb-5">
                  <MenuGroupHeader
                    label="Admin"
                    open={menu === "admin"}
                    onClick={() => setMenu("admin")}
                  />
                  {menu === "admin" && (
                    <div className="flex gap-1 md:flex-col">
                      {adminNavItems.map((item) => (
                        <Link
                          key={item.id}
                          to={`/admin?section=${item.id}`}
                          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm text-red-400 transition-colors hover:text-red-300"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </nav>
          </aside>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {isCanceled && (
              <div className="rounded-xl border border-[#F4C430]/50 bg-[#F4C430]/10 p-4 font-body text-sm text-foreground">
                Your {plan?.name} plan is canceled and stays active until{" "}
                {subscription ? fmtDate(subscription.currentPeriodEnd) : ""}.{" "}
                <Link to="/pricing" className="font-semibold text-[#F4C430] hover:underline">
                  Resubscribe
                </Link>
              </div>
            )}

            {section === "profile" && (
              <SectionCard title="Personal Profile">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-full font-body text-xl font-bold text-background"
                      style={{ backgroundColor: GOLD }}
                    >
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-body text-base font-semibold text-foreground">
                        {user.name || user.email.split("@")[0]}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  {!editingName && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName(user.name ?? "");
                        setProfileError(null);
                        setEditingName(true);
                      }}
                      className="rounded-lg border border-border px-4 py-2 font-body text-sm text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                    >
                      Edit profile
                    </button>
                  )}
                </div>

                {editingName && (
                  <form
                    className="mt-5 flex flex-wrap gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setProfileBusy(true);
                      setProfileError(null);
                      const res = await updateProfile(draftName.trim());
                      setProfileBusy(false);
                      if (res.ok) setEditingName(false);
                      else setProfileError(res.error ?? "Update failed");
                    }}
                  >
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={60}
                      required
                      autoFocus
                      placeholder="Display name"
                      className="h-10 flex-1 min-w-[200px] rounded-lg border border-border bg-background px-3 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={profileBusy || draftName.trim().length === 0}
                      className="rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
                    >
                      {profileBusy ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingName(false);
                        setProfileError(null);
                      }}
                      className="rounded-lg border border-border px-4 py-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </form>
                )}
                {profileError && (
                  <p className="mt-3 font-body text-xs text-red-400">{profileError}</p>
                )}

                <div className="mt-6 overflow-hidden rounded-lg border border-border">
                  <div className="flex items-center gap-4 border-b border-border px-4 py-3.5">
                    <span className="w-32 shrink-0 font-body text-xs uppercase tracking-wide text-muted-foreground">
                      Display name
                    </span>
                    <span className="font-body text-sm text-foreground">
                      {user.name || user.email.split("@")[0]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 px-4 py-3.5">
                    <span className="w-32 shrink-0 font-body text-xs uppercase tracking-wide text-muted-foreground">
                      Email
                    </span>
                    <span className="font-body text-sm text-foreground">{user.email}</span>
                  </div>
                </div>
                <p className="mt-3 font-body text-xs text-muted-foreground">
                  Need to change your email? Contact us at contact@tvmusicstore.com.
                </p>
              </SectionCard>
            )}

            {section === "notifications" && <NotificationsSettings />}

            {section === "downloads" && (
              <SectionCard title="Download history">
                {downloads.length === 0 ? (
                  <EmptyNote text="Nothing here yet — your downloaded tracks will appear with re-download links." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] font-body text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-4">Track</th>
                          <th className="py-2 pr-4">Format</th>
                          <th className="py-2 pr-4">Plan</th>
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {downloads.map((d) => (
                          <tr key={d.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-4 text-foreground">{d.trackTitle ?? trackTitle(d.trackId)}</td>
                            <td className="py-2.5 pr-4 uppercase text-muted-foreground">{d.format}</td>
                            <td className="py-2.5 pr-4 capitalize text-muted-foreground">{d.planAtDownload}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{fmtDate(d.createdAt)}</td>
                            <td className="py-2.5 text-right">
                              <span className="flex items-center justify-end gap-3">
                                <a
                                  href={`/api/license-pdf?track=${encodeURIComponent(d.trackId)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-body text-xs font-semibold text-[#F4C430] hover:underline"
                                >
                                  Download License
                                </a>
                                {d.trackSlug && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void downloadTrackVersion({
                                          slug: d.trackSlug!,
                                          versionId: "main",
                                          src: "",
                                          title: d.trackTitle ?? trackTitle(d.trackId),
                                          label: "Main",
                                          format: "mp3",
                                          quality: 320,
                                        })
                                      }
                                      className="font-body text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
                                    >
                                      MP3 320
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void downloadTrackVersion({
                                          slug: d.trackSlug!,
                                          versionId: "main",
                                          src: "",
                                          title: d.trackTitle ?? trackTitle(d.trackId),
                                          label: "Main",
                                          format: "wav",
                                        })
                                      }
                                      className="font-body text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
                                    >
                                      WAV 44/16 zip
                                    </button>
                                  </>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}

            {section === "license" && (
              <>
                <SectionCard title="What your plan covers">
                  {plan ? (
                    <ul className="flex flex-col gap-2">
                      {plan.highlights.map((h) => (
                        <li key={h} className="font-body text-sm text-foreground/90">• {h}</li>
                      ))}
                      {!plan.commercialLicense && (
                        <li className="mt-2 font-body text-xs text-muted-foreground">
                          Paid ads and client work need the Max plan or a one-time sync license.
                        </li>
                      )}
                    </ul>
                  ) : (
                    <EmptyNote text="No active plan." />
                  )}
                </SectionCard>
                <SectionCard title="One-time sync licenses">
                  {syncOrders.length === 0 ? (
                    <EmptyNote text="No sync licenses yet. They appear here with PDF certificates." />
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {syncOrders.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-4 py-2.5">
                          <span className="min-w-0">
                            <span className="block truncate font-body text-sm text-foreground">
                              {o.trackTitle ?? trackTitle(o.trackId)}
                              {" · "}
                              <span className="capitalize text-muted-foreground">{o.tier}</span>
                            </span>
                            <span className="block font-body text-xs text-muted-foreground">
                              {fmtDate(o.createdAt)}
                              {o.price ? ` · $${o.price}` : ""}
                            </span>
                          </span>
                          <a
                            href={`/api/license-pdf?order=${encodeURIComponent(o.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 font-body text-xs font-semibold text-[#F4C430] hover:underline"
                          >
                            License PDF
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </>
            )}

            {section === "whitelist" && <MyChannels />}

            {section === "claims" && (
              <SectionCard title="Content ID claims">
                <p className="font-body text-sm text-muted-foreground">
                  Got a claim on a video using our music? Paste the video link — the composer removes
                  it within 24 hours.
                </p>
                <form className="mt-4 flex gap-2" onSubmit={(e) => e.preventDefault()}>
                  <input
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                  >
                    Submit
                  </button>
                </form>
                {claims.length > 0 && (
                  <ul className="mt-5 divide-y divide-border/60">
                    {claims.map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-2.5">
                        <span className="truncate font-body text-sm text-foreground">{c.videoUrl}</span>
                        <span
                          className={`ml-4 shrink-0 rounded-full px-2.5 py-0.5 font-body text-xs ${
                            c.status === "done"
                              ? "bg-[#F4C430]/15 text-[#F4C430]"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {c.status === "done" ? "resolved" : c.status.replace("_", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            )}

            {section === "billing" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Plan &amp; Billing</h1>
                  <p className="mt-1 font-body text-sm text-muted-foreground">Manage your subscription</p>
                </div>

                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Subscription
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-body text-xl font-semibold text-foreground">
                        {plan?.name ?? "Free"} Plan
                      </p>
                      <p className="mt-1 font-body text-sm text-muted-foreground">{planSubtitle}</p>
                    </div>
                    <div className="flex gap-2">
                      {BILLING_ENABLED && plan && plan.id !== "free" && (
                        <button
                          type="button"
                          onClick={() => void openBillingPortal()}
                          className="rounded-lg border border-border px-4 py-2 font-body text-sm font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                        >
                          Manage billing
                        </button>
                      )}
                      {plan?.id !== "max" && (
                        <button
                          type="button"
                          onClick={() => openPlanModal()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4C430] px-5 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                        >
                          <ArrowUpRight className="h-4 w-4" /> Upgrade plan
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Billing Information
                  </p>
                  <p className="mt-4 font-body text-base font-semibold text-foreground">{user.name || "—"}</p>
                  <p className="font-body text-sm text-muted-foreground">{user.email}</p>
                </div>

                {!BILLING_ENABLED && (
                  <p className="font-body text-xs text-muted-foreground">
                    Subscription billing is moving to a new provider and will be available again soon.
                    One-time track licenses are available now.
                  </p>
                )}
              </div>
            )}

            {section === "support" && (
              <SectionCard title="Support">
                <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
                  <input
                    placeholder="Subject"
                    className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
                  />
                  <textarea
                    placeholder="How can we help?"
                    rows={5}
                    className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="self-start rounded-lg bg-[#F4C430] px-5 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                  >
                    Send message
                  </button>
                </form>
              </SectionCard>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Account;
