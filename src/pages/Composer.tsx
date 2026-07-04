import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  DollarSign,
  Inbox,
  LayoutDashboard,
  Music2,
  Upload,
  UserRound,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useComposer, useCurrentUser } from "@/hooks/useMockData";
import {
  mockBriefs,
  mockClaimRequests,
  mockComposerTracks,
  mockDownloadLog,
  mockPayoutLines,
  mockPayoutPeriods,
} from "@/mocks";

const GOLD = "#F4C430";

type SectionId = "dashboard" | "tracks" | "upload" | "earnings" | "requests" | "profile";

const sections: { id: SectionId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tracks", label: "My tracks", icon: Music2 },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "earnings", label: "Earnings", icon: DollarSign },
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "profile", label: "Profile", icon: UserRound },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const Card = ({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-card p-6 ${className}`}>
    {title && <h2 className="font-body text-base font-semibold text-foreground">{title}</h2>}
    <div className={title ? "mt-4" : ""}>{children}</div>
  </div>
);

const Composer = () => {
  const user = useCurrentUser();
  const composer = useComposer();
  const [section, setSection] = useState<SectionId>("dashboard");

  const myDownloads = useMemo(
    () => (composer ? mockDownloadLog.filter((d) => d.composerId === composer.id) : []),
    [composer],
  );

  // Downloads per day, last 30 days of mock data
  const dailyBars = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const d of myDownloads) byDay.set(d.createdAt.slice(0, 10), (byDay.get(d.createdAt.slice(0, 10)) ?? 0) + 1);
    const days = [...byDay.keys()].sort().slice(-30);
    const max = Math.max(1, ...days.map((day) => byDay.get(day) ?? 0));
    return days.map((day) => ({ day, count: byDay.get(day) ?? 0, pct: ((byDay.get(day) ?? 0) / max) * 100 }));
  }, [myDownloads]);

  const topTracks = useMemo(() => {
    const byTrack = new Map<string, number>();
    for (const d of myDownloads) byTrack.set(d.trackId, (byTrack.get(d.trackId) ?? 0) + 1);
    return [...byTrack.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([trackId, count]) => ({
        title: mockComposerTracks.find((t) => t.id === trackId)?.title ?? `Track ${trackId.replace("trk_", "#")}`,
        count,
      }));
  }, [myDownloads]);

  const myLines = composer ? mockPayoutLines.filter((l) => l.composerId === composer.id) : [];
  const currentDraft = myLines.find(
    (l) => mockPayoutPeriods.find((p) => p.id === l.periodId)?.status === "draft",
  );
  const myTracks = composer ? mockComposerTracks.filter((t) => t.composerId === composer.id) : [];
  const myClaims = composer ? mockClaimRequests.filter((c) => c.composerId === composer.id) : [];
  const myBriefs = composer
    ? mockBriefs.filter((b) => b.assignedComposerId === composer.id || b.assignedComposerId === null)
    : [];

  if (!user || !composer) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
          <h1 className="text-2xl text-foreground">Composer area</h1>
          <p className="mt-3 font-body text-sm text-muted-foreground">
            This dashboard is for catalog composers. Sign in with a composer account.
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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <div className="flex flex-col gap-8 md:flex-row">
          <aside className="shrink-0 md:w-56">
            <p className="px-3 font-body text-sm font-semibold text-foreground">{composer.displayName}</p>
            <p className="px-3 font-body text-xs" style={{ color: GOLD }}>
              {composer.styles.join(" · ")}
            </p>
            <nav className="mt-4 flex gap-1 overflow-x-auto md:flex-col">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm transition-colors ${
                    section === s.id ? "bg-secondary text-[#F4C430]" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <s.icon className="h-4 w-4" />
                  {s.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {section === "dashboard" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">Downloads (all time)</p>
                    <p className="mt-1 font-body text-3xl font-semibold text-foreground">{myDownloads.length}</p>
                  </Card>
                  <Card>
                    <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">This month (est.)</p>
                    <p className="mt-1 font-body text-3xl font-semibold" style={{ color: GOLD }}>
                      ${currentDraft?.amount.toFixed(0) ?? "0"}
                    </p>
                  </Card>
                  <Card>
                    <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">Published tracks</p>
                    <p className="mt-1 font-body text-3xl font-semibold text-foreground">
                      {myTracks.filter((t) => t.published).length}
                    </p>
                  </Card>
                </div>
                <Card title="Downloads — last 30 days">
                  <div className="flex h-32 items-end gap-1">
                    {dailyBars.map((b) => (
                      <div
                        key={b.day}
                        title={`${fmtDate(b.day)}: ${b.count}`}
                        className="flex-1 rounded-t-sm"
                        style={{ height: `${Math.max(4, b.pct)}%`, backgroundColor: GOLD, opacity: 0.85 }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between font-body text-[10px] text-muted-foreground">
                    <span>{dailyBars[0] ? fmtDate(dailyBars[0].day) : ""}</span>
                    <span>{dailyBars.at(-1) ? fmtDate(dailyBars.at(-1)!.day) : ""}</span>
                  </div>
                </Card>
                <Card title="Top tracks">
                  <ul className="divide-y divide-border/60">
                    {topTracks.map((t, i) => (
                      <li key={t.title} className="flex items-center justify-between py-2.5">
                        <span className="font-body text-sm text-foreground">
                          <span className="mr-3 text-muted-foreground">{i + 1}</span>
                          {t.title}
                        </span>
                        <span className="font-body text-xs text-muted-foreground">{t.count} downloads</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}

            {section === "tracks" && (
              <Card title={`My tracks (${myTracks.length})`}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] font-body text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4">Title</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2">Downloads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myTracks.map((t) => (
                        <tr key={t.id} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 pr-4 text-foreground">{t.title}</td>
                          <td className="py-2.5 pr-4">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs ${
                                t.status === "approved"
                                  ? "bg-[#F4C430]/15 text-[#F4C430]"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {t.status === "approved" ? "published" : t.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-muted-foreground">
                            {myDownloads.filter((d) => d.trackId === t.id).length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {section === "upload" && (
              <Card title="Upload tracks">
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-body text-sm text-foreground">Drag &amp; drop WAV files here</p>
                  <p className="mt-1 font-body text-xs text-muted-foreground">or</p>
                  <button
                    type="button"
                    className="mt-3 rounded-lg border border-[#F4C430]/70 px-4 py-2 font-body text-sm font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background"
                  >
                    Choose files
                  </button>
                </div>
                <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      placeholder="Track title"
                      className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
                    />
                    <input
                      placeholder="BPM"
                      className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
                    />
                  </div>
                  <input
                    placeholder="Genres, moods, use-cases (comma separated)"
                    className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
                  />
                  <label className="flex items-center gap-2 font-body text-sm text-muted-foreground">
                    <input type="checkbox" className="accent-[#F4C430]" /> Stems available
                  </label>
                  <button
                    type="submit"
                    className="self-start rounded-lg bg-[#F4C430] px-5 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                  >
                    Submit for review
                  </button>
                  <p className="font-body text-xs text-muted-foreground">
                    Tracks go live after admin review. Make sure the track is registered in Content ID first.
                  </p>
                </form>
              </Card>
            )}

            {section === "earnings" && (
              <Card title="Earnings by month">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] font-body text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4">Month</th>
                        <th className="py-2 pr-4">Downloads</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {myLines.map((l) => {
                        const period = mockPayoutPeriods.find((p) => p.id === l.periodId);
                        return (
                          <tr key={l.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-4 text-foreground">{period?.month}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{l.downloadsCount}</td>
                            <td className="py-2.5 pr-4 font-semibold" style={{ color: GOLD }}>
                              ${l.amount.toFixed(2)}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs ${
                                  period?.status === "paid"
                                    ? "bg-[#F4C430]/15 text-[#F4C430]"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                {period?.status === "draft" ? "accruing" : period?.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              {period?.status === "paid" && (
                                <button type="button" className="font-body text-xs font-semibold text-[#F4C430] hover:underline">
                                  Statement PDF
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 font-body text-xs text-muted-foreground">
                  Author pool = 50% of net revenue, split by downloads. Payouts by the 15th, minimum $50.
                </p>
              </Card>
            )}

            {section === "requests" && (
              <>
                <Card title="Claim removals for my tracks">
                  {myClaims.length === 0 ? (
                    <p className="font-body text-sm text-muted-foreground">No open claims. Nice and quiet.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {myClaims.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-4 py-2.5">
                          <span className="truncate font-body text-sm text-foreground">{c.videoUrl}</span>
                          {c.status === "done" ? (
                            <span className="shrink-0 rounded-full bg-[#F4C430]/15 px-2.5 py-0.5 font-body text-xs text-[#F4C430]">
                              resolved
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="shrink-0 rounded-lg border border-[#F4C430]/70 px-3 py-1.5 font-body text-xs font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background"
                            >
                              Mark done
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="Custom briefs">
                  {myBriefs.length === 0 ? (
                    <p className="font-body text-sm text-muted-foreground">No briefs assigned.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {myBriefs.map((b) => (
                        <li key={b.id} className="py-3">
                          <div className="flex items-center justify-between">
                            <span className="font-body text-sm font-semibold text-foreground">
                              {b.name} · <span className="capitalize font-normal">{b.type}</span>
                            </span>
                            <span className="font-body text-xs text-muted-foreground">{b.budget}</span>
                          </div>
                          <p className="mt-1 font-body text-xs text-muted-foreground">{b.description}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}

            {section === "profile" && (
              <Card title="Public profile & payouts">
                <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
                  <input
                    defaultValue={composer.displayName}
                    className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
                  />
                  <textarea
                    defaultValue={composer.bio}
                    rows={4}
                    className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
                  />
                  <input
                    placeholder="Payout details (Wise email / IBAN)"
                    className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="self-start rounded-lg bg-[#F4C430] px-5 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                  >
                    Save
                  </button>
                </form>
              </Card>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Composer;
