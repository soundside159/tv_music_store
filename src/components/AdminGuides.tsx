import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { guides, isPublished } from "@/content/guides";
import { refreshContent } from "@/hooks/useContent";

// Admin -> Articles: the publication calendar for /guides.
//
// The TEXT of each article lives in the code (src/content/guides.ts) — it is
// written, reviewed and deployed. Only the DATE each one goes live is editable
// here, stored in site_config (`guide_schedule`), so the owner can drip-feed the
// library without a deploy. An article dated in the future does not exist on the
// site: not in the list, not on its own URL, not in the sitemap, not for
// crawlers. On its day it simply appears.

const GOLD = "#F4C430";

const today = () => new Date().toISOString().slice(0, 10);

const AdminGuides = () => {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Start from whatever the app currently believes (the built-in schedule with
  // any saved override already applied by /api/content).
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const guide of guides) initial[guide.slug] = guide.updated;
    setDates(initial);
  }, []);

  const rows = useMemo(
    () =>
      [...guides]
        .map((guide) => ({ guide, date: dates[guide.slug] ?? guide.updated }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [dates],
  );

  const liveCount = rows.filter((r) => r.date <= today()).length;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_guide_schedule", values: dates }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      // Apply the new dates to the running app straight away.
      await refreshContent();
      toast.success("Schedule saved — future articles appear on their day, no deploy needed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-body text-base font-semibold text-foreground">Articles</h2>
          <p className="mt-1 font-body text-xs text-muted-foreground">
            {liveCount} of {rows.length} live · the rest appear by themselves on their date.
            The text of an article is part of the site build — only its publication date is set here.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-[#F4C430] px-4 py-2 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save schedule"}
        </button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse font-body text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left">
              <th className="py-2 pr-4 font-semibold text-muted-foreground">Article</th>
              <th className="py-2 pr-4 font-semibold text-muted-foreground">Status</th>
              <th className="py-2 pr-4 font-semibold text-muted-foreground">Publishes</th>
              <th className="py-2 font-semibold text-muted-foreground">Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ guide, date }) => {
              const live = isPublished({ ...guide, updated: date });
              return (
                <tr key={guide.slug} className="border-b border-border/40 last:border-b-0">
                  <td className="py-2.5 pr-4">
                    <span className="block font-medium text-foreground">{guide.h1}</span>
                    <span className="block font-body text-xs text-muted-foreground">
                      /guides/{guide.slug}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-body text-[10px] font-semibold ${
                        live
                          ? "border-[#F4C430]/50 bg-[#F4C430]/10 text-[#F4C430]"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {live ? "Live" : "Scheduled"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) =>
                        setDates((prev) => ({ ...prev, [guide.slug]: e.target.value }))
                      }
                      className="rounded-md border border-border bg-background px-2 py-1 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
                    />
                  </td>
                  <td className="py-2.5">
                    {live ? (
                      <a
                        href={`/guides/${guide.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-body text-xs transition-colors hover:underline"
                        style={{ color: GOLD }}
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="font-body text-xs text-muted-foreground/60">
                        Not public yet
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 font-body text-[11px] leading-5 text-muted-foreground">
        Want a NEW article? Send me the topic — the text is written and shipped with the site, then
        it shows up here and you pick the day it goes live. Dates are never back-dated: search
        engines penalise that, and a date that contradicts when the page appeared costs trust.
      </p>
    </div>
  );
};

export default AdminGuides;
