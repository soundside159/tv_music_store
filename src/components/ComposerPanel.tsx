import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import ComposerUpload, { useComposerTracks } from "@/components/ComposerUpload";
import { useComposer, useCurrentUser } from "@/hooks/useMockData";
import {
  mockBriefs,
  mockClaimRequests,
  mockComposerTracks,
  mockDownloadLog,
  mockPayoutLines,
  mockPayoutPeriods,
} from "@/mocks";

// Composer studio sections, rendered INSIDE the /account page (owner decision:
// no separate /composer panel — the account sidebar has a "Composer" group).
// Upload + My tracks are live (/api/composer/tracks); dashboard / earnings /
// requests / profile still show mock data until stage 5+.

const GOLD = "#F4C430";

export type ComposerSectionId =
  | "dashboard"
  | "tracks"
  | "upload"
  | "earnings"
  | "requests"
  | "profile";

export const COMPOSER_SECTION_IDS: ComposerSectionId[] = [
  "dashboard",
  "tracks",
  "upload",
  "earnings",
  "requests",
  "profile",
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const Card = ({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-card p-6 ${className}`}>
    {title && <h2 className="font-body text-base font-semibold text-foreground">{title}</h2>}
    <div className={title ? "mt-4" : ""}>{children}</div>
  </div>
);

const ComposerPanel = ({ section }: { section: ComposerSectionId }) => {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const mockComposer = useComposer();
  // Composer = has a profile (pseudonym) — role no longer decides; the server
  // answers 403 for non-composers, which just leaves `composer` empty here.
  const live = useComposerTracks(!!user);
  // Live profile first (real pseudonym), mock personas as a dev fallback.
  const composer = live.composer
    ? {
        id: live.composer.id,
        userId: user?.id ?? "",
        slug: "",
        displayName: live.composer.displayName,
        bio: "",
        styles: [] as string[],
        trackCount: live.tracks.length,
        revenueWeight: 1,
      }
    : mockComposer;

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
      <Card title="Composer studio">
        <p className="font-body text-sm text-muted-foreground">
          {user
            ? live.loading
              ? "Loading your composer profile…"
              : live.error ??
                "No composer profile yet — the site owner enables Composer in Admin → Users."
            : "This area is for catalog composers. Sign in with a composer account."}
        </p>
      </Card>
    );
  }

  // Live totals when the real profile is loaded; mock persona numbers otherwise.
  const liveDownloadsTotal = live.tracks.reduce((a, t) => a + t.downloads, 0);
  const publishedCount = live.composer
    ? live.tracks.filter((t) => t.status === "published" && t.moderation_status === "approved").length
    : myTracks.filter((t) => t.published).length;

  return (
    <>
      {section === "dashboard" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">Downloads (all time)</p>
              <p className="mt-1 font-body text-3xl font-semibold text-foreground">
                {live.composer ? liveDownloadsTotal : myDownloads.length}
              </p>
            </Card>
            <Card>
              <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">This month (est.)</p>
              <p className="mt-1 font-body text-3xl font-semibold" style={{ color: GOLD }}>
                ${currentDraft?.amount.toFixed(0) ?? "0"}
              </p>
            </Card>
            <Card>
              <p className="font-body text-xs uppercase tracking-wide text-muted-foreground">Published tracks</p>
              <p className="mt-1 font-body text-3xl font-semibold text-foreground">{publishedCount}</p>
            </Card>
          </div>
          {dailyBars.length > 0 && (
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
          )}
          {topTracks.length > 0 && (
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
          )}
        </>
      )}

      {section === "tracks" &&
        (live.composer ? (
          /* Live rows from /api/composer/tracks — only this composer's tracks. */
          <Card title={`My tracks (${live.tracks.length})`}>
            {live.tracks.length === 0 ? (
              <p className="font-body text-sm text-muted-foreground">
                No tracks yet — upload your first one in the Upload section.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] font-body text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Versions</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Downloads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.tracks.map((t) => {
                      const state =
                        t.moderation_status === "pending"
                          ? "pending review"
                          : t.moderation_status === "rejected"
                            ? "rejected"
                            : t.status === "published"
                              ? "published"
                              : "draft";
                      return (
                        <tr key={t.id} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 pr-4 text-foreground">
                            {state === "published" ? (
                              <Link to={`/track/${t.slug}`} className="hover:text-[#F4C430]">
                                {t.title}
                              </Link>
                            ) : (
                              t.title
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{t.versions}</td>
                          <td className="py-2.5 pr-4">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs ${
                                state === "published"
                                  ? "bg-[#F4C430]/15 text-[#F4C430]"
                                  : state === "pending review"
                                    ? "bg-amber-500/15 text-amber-400"
                                    : state === "rejected"
                                      ? "bg-red-500/15 text-red-400"
                                      : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {state}
                            </span>
                          </td>
                          <td className="py-2.5 text-muted-foreground">{t.downloads}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : (
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
        ))}

      {section === "upload" && (
        <Card title="Add track">
          {live.composer ? (
            <ComposerUpload
              vocabularies={live.vocabularies}
              onCreated={() => {
                live.reload();
                navigate("/account?section=composer-tracks");
              }}
            />
          ) : (
            <p className="font-body text-sm text-muted-foreground">
              {live.loading
                ? "Loading your composer profile…"
                : live.error ??
                  "Uploads need a live composer profile — the site owner sets your pseudonym in Admin → Customers."}
            </p>
          )}
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
                        {b.name} · <span className="font-normal capitalize">{b.type}</span>
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
          <p className="mb-4 font-body text-xs text-muted-foreground">
            Artist name: <span className="font-semibold" style={{ color: GOLD }}>{composer.displayName}</span>
            {" "}— the site owner changes it in Admin → Customers.
          </p>
          <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
            <textarea
              defaultValue={composer.bio}
              placeholder="Bio"
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
    </>
  );
};

export default ComposerPanel;
