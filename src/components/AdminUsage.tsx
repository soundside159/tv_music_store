import { useCallback, useEffect, useState } from "react";
import { ExternalLink, HardDrive, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Services & credits — rendered at the bottom of Admin → Dashboard.
//
// Only ONE of the three providers can honestly be metered from here:
//
//   YouTube  — no quota endpoint exists, but the cost is fully deterministic
//              (2 units per whitelisted-channel check, 10,000 free units a day),
//              so counting our own calls IS the real number.
//   Resend   — no usage/quota endpoint at all → link to their dashboard.
//   OpenAI   — a real Costs API exists but needs a separate Admin key; until the
//              owner adds one (OPENAI_ADMIN_KEY), we link out rather than show a
//              guess. If the key IS set, the real spend appears instead.
//
// A number that pretends to be a bill is worse than an honest link.

const GOLD = "#F4C430";

const YOUTUBE_DAILY_QUOTA = 10000;

interface Bucket {
  units: number;
  costCents: number;
}

interface Report {
  today: Record<"resend" | "youtube" | "openai", Bucket>;
  month: Record<"resend" | "youtube" | "openai", Bucket>;
  configured: { resend: boolean; youtube: boolean; openai: boolean; openaiAdmin: boolean };
  openaiSpend: { centsThisMonth: number; source: "openai" | "estimate"; note?: string };
}

/** A card that links out, because the provider gives us nothing to read. */
const LinkCard = ({
  title,
  href,
  what,
  configured,
}: {
  title: string;
  href: string;
  what: string;
  configured: boolean;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-colors hover:border-[#F4C430]/60"
  >
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-body text-sm font-semibold text-foreground">{title}</h3>
        {!configured && (
          <span className="rounded-full border border-border px-2 py-0.5 font-body text-[10px] uppercase tracking-wide text-muted-foreground">
            not configured
          </span>
        )}
      </div>
      <p className="mt-2 font-body text-xs leading-5 text-muted-foreground">{what}</p>
    </div>
    <span
      className="mt-5 inline-flex items-center gap-1.5 font-body text-sm font-semibold transition-colors"
      style={{ color: GOLD }}
    >
      Open dashboard
      <ExternalLink className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
    </span>
  </a>
);

const AdminUsage = () => {
  const [report, setReport] = useState<Report | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usage", { credentials: "include" });
      if (!res.ok) return;
      setReport((await res.json()) as Report);
    } catch {
      // offline — the cards still link out, which is the important part
    }
  }, []);

  // Refreshed every time the Dashboard is opened.
  useEffect(() => {
    void load();
  }, [load]);

  const ytToday = report?.today.youtube.units ?? 0;
  const ytPct = Math.min(100, Math.round((ytToday / YOUTUBE_DAILY_QUOTA) * 100));
  const ytDanger = ytPct >= 85;

  const realAi = report?.openaiSpend.source === "openai";
  const aiCents = report?.openaiSpend.centsThisMonth ?? 0;

  // --- Orphaned files in R2 -------------------------------------------------
  // Until 2026-07-13 deleting a track left its audio in the bucket. This scans
  // storage against the database and can delete whatever nothing points at.
  interface StorageGroup {
    files: number;
    bytes: number;
  }
  interface StorageReport {
    total: number;
    totalBytes: number;
    orphans: number;
    orphanBytes: number;
    tracks: number;
    breakdown: { previews: StorageGroup; masters: StorageGroup; covers: StorageGroup };
    sample: { key: string; size: number }[];
  }
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [storageBusy, setStorageBusy] = useState<"scan" | "clean" | "tx" | null>(null);
  const mb = (bytes: number) =>
    bytes >= 1024 ** 3
      ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
      : `${Math.round(bytes / 1024 / 1024)} MB`;

  const scanStorage = async () => {
    setStorageBusy("scan");
    try {
      const res = await fetch("/api/admin/storage", { credentials: "include" });
      const d = (await res.json().catch(() => ({}))) as StorageReport & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Scan failed");
      setStorage(d);
      toast.success(
        d.orphans === 0
          ? "Storage is clean — every file belongs to a track"
          : `${d.orphans} unused file(s) · ${mb(d.orphanBytes)}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setStorageBusy(null);
    }
  };

  // Test transactions: download history, licence codes, one-time orders, booked
  // revenue and payout runs. Subscriptions are NOT touched (see the API note).
  const wipeTransactions = async () => {
    const typed = window.prompt(
      "Delete ALL test transaction records?\n\n• download history (and the Free-tier counters)\n• licence codes and one-time orders\n• booked revenue and composer payout runs\n\nSubscriptions, accounts, tracks and files are KEPT.\nThis cannot be undone.\n\nType DELETE to confirm:",
    );
    if (typed !== "DELETE") return;
    setStorageBusy("tx");
    try {
      const res = await fetch("/api/admin/storage", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, wipeTransactions: true }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Cleanup failed");
      toast.success("Test transaction records cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setStorageBusy(null);
    }
  };

  const cleanStorage = async () => {
    if (!storage || storage.orphans === 0) return;
    if (
      !window.confirm(
        `Delete ${storage.orphans} unused file(s) (${mb(storage.orphanBytes)}) from storage?\n\nOnly files that NO track, version, stem or cover in the database points at are removed. This cannot be undone.`,
      )
    )
      return;
    setStorageBusy("clean");
    try {
      const res = await fetch("/api/admin/storage", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: number;
        bytes?: number;
        error?: string;
      };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Cleanup failed");
      toast.success(`Deleted ${d.deleted ?? 0} file(s) · freed ${mb(d.bytes ?? 0)}`);
      await scanStorage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setStorageBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-body text-sm font-semibold text-foreground">Services &amp; credits</h2>
        <p className="mt-1 font-body text-xs text-muted-foreground">
          YouTube is metered here (its cost is fixed and countable). Resend and OpenAI publish no
          "credits left" figure, so they link straight to their own dashboards — an honest link beats
          an invented number.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* The one real meter. */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-body text-sm font-semibold text-foreground">YouTube API</h3>
            {report && !report.configured.youtube && (
              <span className="rounded-full border border-border px-2 py-0.5 font-body text-[10px] uppercase tracking-wide text-muted-foreground">
                no key
              </span>
            )}
          </div>
          <p className="mt-2 font-body text-xs text-muted-foreground">
            Quota used today · resets midnight PT
          </p>

          <p className="mt-4 font-body text-2xl font-semibold tabular-nums" style={{ color: GOLD }}>
            {ytToday.toLocaleString("en-US")}
            <span className="ml-1 font-body text-sm font-normal text-muted-foreground">
              / {YOUTUBE_DAILY_QUOTA.toLocaleString("en-US")}
            </span>
          </p>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${ytPct}%`, backgroundColor: ytDanger ? "#f87171" : GOLD }}
            />
          </div>
          <p className="mt-2 font-body text-[11px] leading-5 text-muted-foreground/80">
            2 units per whitelisted-channel check — roughly 5,000 checks a day before Google says no.
          </p>
          {ytDanger && (
            <p className="mt-1 font-body text-xs text-red-400">
              Nearly out for today — channel checks will start failing.
            </p>
          )}
        </div>

        <LinkCard
          title="Emails (Resend)"
          href="https://resend.com/emails"
          what="Resend has no usage API, so the balance lives only in their dashboard. Login codes and (soon) receipts go through it."
          configured={!!report?.configured.resend}
        />

        {/* If an Admin key is set we CAN show the real bill; otherwise, a link. */}
        {realAi ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-body text-sm font-semibold text-foreground">AI generation (OpenAI)</h3>
            <p className="mt-2 font-body text-xs text-muted-foreground">
              Spent this month · real figure from OpenAI
            </p>
            <p className="mt-4 font-body text-2xl font-semibold tabular-nums" style={{ color: GOLD }}>
              ${(aiCents / 100).toFixed(2)}
            </p>
            <a
              href="https://platform.openai.com/usage"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 font-body text-sm font-semibold"
              style={{ color: GOLD }}
            >
              Open dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <LinkCard
            title="AI generation (OpenAI)"
            href="https://platform.openai.com/usage"
            what="Cover art and descriptions. Add an OPENAI_ADMIN_KEY in Cloudflare and the real monthly spend appears here instead of this link."
            configured={!!report?.configured.openai}
          />
        )}
      </div>

      {/* ===== Storage: files in R2 that nothing in the database points at ===== */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-body text-sm font-semibold text-foreground">
              <HardDrive className="h-4 w-4" style={{ color: GOLD }} />
              Storage cleanup
            </h3>
            <p className="mt-1 max-w-xl font-body text-xs text-muted-foreground">
              Deleting a track used to leave its audio in storage. This scans the bucket against the
              database and removes only files that no track, version, stem or cover points at.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={storageBusy !== null}
              onClick={() => void scanStorage()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:opacity-50"
            >
              {storageBusy === "scan" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {storageBusy === "scan" ? "Scanning…" : "Scan storage"}
            </button>
            {storage && storage.orphans > 0 && (
              <button
                type="button"
                disabled={storageBusy !== null}
                onClick={() => void cleanStorage()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/50 px-3 py-1.5 font-body text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
              >
                {storageBusy === "clean" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete {storage.orphans} unused file{storage.orphans === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>

        {storage && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <p className="font-body text-xs text-muted-foreground">
              <span className="text-foreground">{storage.total}</span> files in storage ·{" "}
              {mb(storage.totalBytes)} total ·{" "}
              <span style={{ color: storage.orphans > 0 ? GOLD : undefined }}>
                {storage.orphans} unused ({mb(storage.orphanBytes)})
              </span>
            </p>
            {/* What the megabytes actually are. Licence PDFs are NOT stored —
                they are generated per download. */}
            <p className="mt-1 font-body text-[11px] text-muted-foreground">
              {storage.tracks} track(s) ·{" "}
              <span className="text-foreground">masters</span> (WAV + stems){" "}
              {storage.breakdown.masters.files} / {mb(storage.breakdown.masters.bytes)} ·{" "}
              <span className="text-foreground">previews</span> (MP3 320 + 128){" "}
              {storage.breakdown.previews.files} / {mb(storage.breakdown.previews.bytes)} ·{" "}
              <span className="text-foreground">covers</span> {storage.breakdown.covers.files} /{" "}
              {mb(storage.breakdown.covers.bytes)}
            </p>
            {storage.sample.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5">
                {storage.sample.map((o) => (
                  <li
                    key={o.key}
                    className="truncate font-body text-[11px] tabular-nums text-muted-foreground"
                  >
                    {o.key} · {Math.max(1, Math.round(o.size / 1024))} KB
                  </li>
                ))}
                {storage.orphans > storage.sample.length && (
                  <li className="font-body text-[11px] text-muted-foreground/70">
                    …and {storage.orphans - storage.sample.length} more
                  </li>
                )}
              </ul>
            )}

          </div>
        )}

        {/* Test records from the Stripe TEST era: no accounting value, but they
            skew revenue, payouts and the Free-tier counters. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-400/30 bg-red-400/[0.04] p-3">
          <p className="max-w-lg font-body text-[11px] text-muted-foreground">
            <span className="font-semibold text-red-400">Clear test transactions:</span> download
            history, licence codes, one-time orders, booked revenue and payout runs. Subscriptions,
            accounts, tracks and files are kept.
          </p>
          <button
            type="button"
            disabled={storageBusy !== null}
            onClick={() => void wipeTransactions()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/60 px-3 py-1.5 font-body text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
          >
            {storageBusy === "tx" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Clear test transactions
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminUsage;
