import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Check, Download as DownloadIcon, Pause, Play, Plus, X } from "lucide-react";
import { accountNavGroups, adminNavGroups, composerNavItems } from "@/lib/adminNav";
import MenuGroupHeader from "@/components/MenuGroupHeader";
import MenuTreeLines from "@/components/MenuTreeLines";
import ComposerPanel, { type ComposerSectionId } from "@/components/ComposerPanel";
import { useComposerTracks } from "@/components/ComposerUpload";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { catalogTracks } from "@/data/catalogTracks";
import { TrackRowList } from "@/components/TrackRowPlayer";
import { useTracks } from "@/hooks/useTracks";
import type { CatalogTrack } from "@/data/catalogTracks";
import {
  useCurrentUser,
  useMyDownloads,
  useMyLicenses,
  usePlans,
  useSubscription,
} from "@/hooks/useMockData";
import { toast } from "sonner";
import { SectionPanel } from "@/components/SectionHeading";
import NotificationsSettings from "@/components/NotificationsSettings";
import SupportSection from "@/components/SupportSection";
import FavouritesSection from "@/components/FavouritesSection";
import LicensesSection from "@/components/LicensesSection";
import { logout, refreshSession, updateProfile } from "@/hooks/useAuth";
import { usePlayer } from "@/components/playerContext";
import WaveformPreview from "@/components/WaveformPreview";
import { BILLING_ENABLED, openBillingPortal, openPlanModal } from "@/lib/billing";
import { downloadTrackVersion } from "@/lib/downloadTrack";

const GOLD = "#F4C430";

type SectionId =
  | "profile"
  | "notifications"
  | "downloads"
  | "favourites"
  | "license"
  | "claims"
  | "billing"
  | "receipts"
  | "support"
  // Composer studio sections (sidebar "Composer" group; content = ComposerPanel).
  | "composer-tracks"
  | "composer-upload"
  | "composer-earnings"
  | "composer-requests"
  | "composer-profile";

const SECTION_IDS: SectionId[] = [
  "profile",
  "notifications",
  "downloads",
  "favourites",
  "license",
  "claims",
  "billing",
  "receipts",
  "support",
  "composer-tracks",
  "composer-upload",
  "composer-earnings",
  "composer-requests",
  "composer-profile",
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

/** "Aug 13, 2026" — used in the plan status line (renews / active until). */
const fmtDateUS = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/** Every block in the account area gets the SAME heading (gold bar + name) —
 *  the one from Notifications, which the owner liked. See SectionHeading.tsx. */
const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <SectionPanel title={title}>{children}</SectionPanel>
);

// ---------------------------------------------------------------------------
// Receipts & Invoices — every payment with a button to its Stripe document, so
// nobody has to dig through email. The list comes from the revenue ledger; the
// PDF link resolves fresh via /api/my-receipts?open=<id> (302 to Stripe).
// ---------------------------------------------------------------------------
interface ReceiptRow {
  id: string;
  source: string;
  provider: string | null;
  gross_cents: number;
  currency: string | null;
  status: string | null;
  created_at: string;
  track_title: string | null;
}

const receiptMoney = (r: ReceiptRow) => {
  const v = (r.gross_cents / 100).toFixed(2);
  const cur = (r.currency ?? "usd").toUpperCase();
  return cur === "USD" ? `$${v}` : `${v} ${cur}`;
};

const ReceiptsSection = () => {
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);
  useEffect(() => {
    fetch("/api/my-receipts", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { receipts?: ReceiptRow[] };
        setRows(data.receipts ?? []);
      })
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Receipts &amp; Invoices</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Every payment you've made, with its receipt / invoice document.
        </p>
      </div>
      <SectionCard title="Your payments">
        {rows === null ? (
          <p className="font-body text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">
            No payments yet — receipts appear here after your first purchase or subscription.
          </p>
        ) : (
          <ul className="divide-y divide-border/50 font-body text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-foreground">
                    {r.source === "subscription"
                      ? "Subscription payment"
                      : `Track license${r.track_title ? ` — ${r.track_title}` : ""}`}
                    {r.status === "refunded" && (
                      <span className="ml-2 rounded-full border border-red-400/40 px-1.5 py-px text-[10px] font-semibold uppercase text-red-400">
                        refunded
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-foreground">{receiptMoney(r)}</span>
                  {r.provider === "stripe" ? (
                    <a
                      href={`/api/my-receipts?open=${encodeURIComponent(r.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                    >
                      Receipt / invoice (PDF)
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground" title="Paid outside Stripe">
                      —
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};

const EmptyNote = ({ text }: { text: string }) => (
  <p className="font-body text-sm text-muted-foreground">{text}</p>
);

/** One row of the claim form's "pick from downloads" list: play/pause + title
 *  + the same waveform as everywhere + a Select button. Light on purpose —
 *  the full TrackRow (covers, tags, versions, download) is overkill here. */
const ClaimPickRow = ({ track, onSelect }: { track: CatalogTrack; onSelect: () => void }) => {
  const engine = usePlayer();
  const version = track.audioVersions[0];
  const isActive =
    !!version &&
    engine.activePlayer?.trackId === track.id &&
    engine.activePlayer.versionId === version.id;
  const isPlaying = isActive && engine.isPlaying;
  const progress = version
    ? isActive
      ? engine.progress
      : (engine.playedProgress[`${track.id}:${version.id}`] ?? 0)
    : 0;

  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0">
      <button
        type="button"
        disabled={!version}
        onClick={() => version && engine.playVersion(track, version)}
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
          isPlaying
            ? "border-[#F4C430] text-[#F4C430]"
            : "border-border text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
        }`}
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <span
        className={`w-36 shrink-0 truncate font-body text-sm ${isPlaying ? "text-[#F4C430]" : "text-foreground"}`}
        title={track.title}
      >
        {track.title}
      </span>
      {version && (
        <WaveformPreview
          active={isPlaying}
          durationRatio={1}
          onSeek={(p) => engine.playVersion(track, version, p)}
          progress={progress}
          src={version.src}
          className="hidden h-8 min-w-0 flex-1 sm:block"
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        className="ml-auto shrink-0 rounded-md border border-border px-3 py-1.5 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
      >
        Select
      </button>
    </div>
  );
};

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
  const [menu, setMenu] = useState<"main" | "composer" | "admin">(
    sectionParam?.startsWith("composer-") ? "composer" : "main",
  );
  // Composer = has a profile (independent flag). Roles admin/composer always
  // see the menu; plain customers get it once their profile is confirmed.
  const composerProbe = useComposerTracks(
    !!user && user.role !== "admin" && user.role !== "composer",
  );
  const showComposerMenu =
    !!user && (user.role === "admin" || user.role === "composer" || !!composerProbe.composer);

  // Header account dropdown links to /account?section=... — keep the active
  // section in sync when the query param changes while already mounted.
  useEffect(() => {
    if (sectionParam && SECTION_IDS.includes(sectionParam as SectionId)) {
      setSection(sectionParam as SectionId);
      setMenu(sectionParam.startsWith("composer-") ? "composer" : "main");
    }
  }, [sectionParam]);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Self-delete (customers only — the button is hidden for admins/composers
  // and the server refuses them too). Composer tracks can never be lost here.
  const deleteOwnAccount = async () => {
    if (
      !window.confirm(
        "Delete your account permanently?\nYour subscription and settings are removed. This cannot be undone.",
      )
    )
      return;
    setDeletingAccount(true);
    setProfileError(null);
    try {
      const res = await fetch("/api/me", { method: "DELETE", credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (data.code === "subscription") {
        // Active paid plan — offer to open the billing portal to cancel first.
        if (
          window.confirm(
            "You have an active subscription — cancel it first so you are not charged again.\nOpen subscription management now?",
          )
        ) {
          await openBillingPortal();
        }
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Delete failed");
      await logout();
      navigate("/");
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingAccount(false);
    }
  };

  const plan = plans.find((p) => p.id === subscription?.plan);

  // Download history = the customer's LIBRARY: one row per track, newest first,
  // rendered with the same player rows as the catalogue. The server already
  // de-duplicates re-downloads; here we just resolve each id to a real track.
  const DOWNLOADS_PER_PAGE = 20;
  const [dlPage, setDlPage] = useState(1);
  const { tracks: liveTracks } = useTracks();

  const downloadedTracks = useMemo(() => {
    const byId = new Map(liveTracks.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const list: CatalogTrack[] = [];
    for (const d of downloads) {
      const track = byId.get(d.trackId);
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      list.push(track);
    }
    return list;
  }, [downloads, liveTracks]);
  const downloadPages = Math.max(1, Math.ceil(downloadedTracks.length / DOWNLOADS_PER_PAGE));
  const safeDlPage = Math.min(dlPage, downloadPages);
  const pagedDownloadTracks = downloadedTracks.slice(
    (safeDlPage - 1) * DOWNLOADS_PER_PAGE,
    safeDlPage * DOWNLOADS_PER_PAGE,
  );

  // Content ID claim requests — LIVE (/api/claims). The server checks the video
  // is actually visible on YouTube before accepting it: a private video cannot
  // have its claim released by anyone, so promising it would be a lie.
  const [claims, setClaims] = useState<
    {
      id: number;
      videoUrl: string;
      videoTitle: string | null;
      status: string;
      createdAt: string;
      trackTitles: string[];
    }[]
  >([]);
  const [claimUrl, setClaimUrl] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);

  // Which tracks are in the video (at least ONE is required — a claim without
  // a track tells us nothing). The customer just TYPES names into rows — no
  // Add button, no search-as-you-type. A white "+" below the rows adds another
  // row, as many as they like. "Downloads" opens a playable list (waveform +
  // Select), 10 per page, which fills the first empty row. Duplicates (same
  // track or same typed name) are refused. Submit is always clickable — with
  // no track it shakes the rows red instead of being greyed out.
  const [trackRows, setTrackRows] = useState<
    { rid: number; text: string; slug: string | null }[]
  >([{ rid: 1, text: "", slug: null }]);
  const nextRid = useRef(2);
  const [trackError, setTrackError] = useState(false);
  const [trackShake, setTrackShake] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [dlPickPage, setDlPickPage] = useState(1);
  const trackInputRef = useRef<HTMLInputElement>(null);

  const rowTitles = useMemo(
    () => new Set(trackRows.map((r) => r.text.trim().toLowerCase()).filter(Boolean)),
    [trackRows],
  );

  const shakeTracks = () => {
    setTrackError(true);
    setTrackShake(true);
    window.setTimeout(() => setTrackShake(false), 450);
    trackInputRef.current?.focus();
  };

  // "Downloads" list under the rows: the customer's library minus tracks
  // already in a row, 10 per page with numbered pages.
  const DL_PICK_PER_PAGE = 10;
  const dlPickTracks = useMemo(
    () => downloadedTracks.filter((t) => !rowTitles.has(t.title.trim().toLowerCase())),
    [downloadedTracks, rowTitles],
  );
  const dlPickPages = Math.max(1, Math.ceil(dlPickTracks.length / DL_PICK_PER_PAGE));
  const safeDlPickPage = Math.min(dlPickPage, dlPickPages);
  const dlPickPageTracks = dlPickTracks.slice(
    (safeDlPickPage - 1) * DL_PICK_PER_PAGE,
    safeDlPickPage * DL_PICK_PER_PAGE,
  );

  /** Downloads "Select": fill the first empty row, else append a new one. */
  const pickTrack = (t: CatalogTrack) => {
    if (rowTitles.has(t.title.trim().toLowerCase())) {
      toast("Already added");
      return;
    }
    setTrackError(false);
    setTrackRows((rows) => {
      const empty = rows.findIndex((r) => !r.text.trim());
      if (empty >= 0) {
        const next = [...rows];
        next[empty] = { ...next[empty], text: t.title, slug: t.slug };
        return next;
      }
      return [...rows, { rid: nextRid.current++, text: t.title, slug: t.slug }];
    });
  };

  const setRowText = (rid: number, text: string) => {
    setTrackError(false);
    setTrackRows((rows) =>
      rows.map((r) => (r.rid === rid ? { ...r, text, slug: null } : r)),
    );
  };

  /** Same track twice (or the same typed name) does not go in. */
  const dedupeRowOnBlur = (rid: number) => {
    setTrackRows((rows) => {
      const row = rows.find((r) => r.rid === rid);
      const value = row?.text.trim().toLowerCase();
      if (!row || !value) return rows;
      const dup = rows.some((r) => r.rid !== rid && r.text.trim().toLowerCase() === value);
      if (!dup) return rows;
      toast("Already added");
      return rows.map((r) => (r.rid === rid ? { ...r, text: "", slug: null } : r));
    });
  };

  const addTrackRow = () => {
    setTrackRows((rows) => [...rows, { rid: nextRid.current++, text: "", slug: null }]);
  };

  const removeTrackRow = (rid: number) => {
    setTrackRows((rows) =>
      rows.length > 1
        ? rows.filter((r) => r.rid !== rid)
        : rows.map((r) => (r.rid === rid ? { ...r, text: "", slug: null } : r)),
    );
  };

  /** Rows -> what the API wants. A pasted /track/<slug> link or an exact
   *  catalogue title resolves to the real track (the owner then sees its
   *  composer); anything else is sent as plain text. Deduped. */
  const collectTracks = () => {
    const slugs: string[] = [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const r of trackRows) {
      const value = r.text.trim();
      if (!value || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      const slugMatch = /\/track\/([a-z0-9-]+)/i.exec(value);
      const byLink = slugMatch
        ? liveTracks.find((x) => x.slug.toLowerCase() === slugMatch[1].toLowerCase())
        : undefined;
      const byTitle = liveTracks.find((x) => x.title.toLowerCase() === value.toLowerCase());
      const track = byLink ?? byTitle;
      if (r.slug) slugs.push(r.slug);
      else if (track) slugs.push(track.slug);
      else names.push(value);
    }
    return { slugs: [...new Set(slugs)], names };
  };

  const loadClaims = useCallback(async () => {
    try {
      const res = await fetch("/api/claims", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        claims?: {
          id: number;
          video_url: string;
          video_title?: string | null;
          status: string;
          created_at: string;
          tracks?: { id: string; title: string }[];
          track_names?: string[];
          track_title?: string | null;
        }[];
      };
      setClaims(
        (data.claims ?? []).map((c) => ({
          id: c.id,
          videoUrl: c.video_url,
          videoTitle: c.video_title ?? null,
          status: c.status,
          createdAt: c.created_at,
          trackTitles: [...(c.tracks ?? []).map((t) => t.title), ...(c.track_names ?? [])],
        })),
      );
    } catch {
      // offline — the list just stays as it is
    }
  }, []);

  useEffect(() => {
    if (user) void loadClaims();
  }, [user, loadClaims]);

  const submitClaim = async () => {
    // Submit is never greyed out — missing bits shake red instead.
    if (!claimUrl.trim()) {
      setUrlError(true);
      return;
    }
    const { slugs, names } = collectTracks();
    if (slugs.length === 0 && names.length === 0) {
      shakeTracks();
      return;
    }
    setClaimBusy(true);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: claimUrl.trim(),
          trackSlugs: slugs,
          trackNames: names,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not send the request");
      setClaimUrl("");
      setTrackRows([{ rid: nextRid.current++, text: "", slug: null }]);
      setTrackError(false);
      setDlOpen(false);
      await loadClaims();
      toast.success("Sent — we forward it for release within one business day");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the request");
    } finally {
      setClaimBusy(false);
    }
  };
  // Admins get Max-level access by role, not by paying (see hooks/useAuth.ts) —
  // no upgrade button, nothing to cancel, no billing period to show.
  const adminAccess = user?.role === "admin";
  const isPaidPlan = !adminAccess && !!plan && plan.id !== "free";
  const benefitsUntil = fmtDateUS(subscription?.currentPeriodEnd);
  // Canceled in the Stripe portal but still running to the end of the paid
  // period (cancel_at_period_end mirrored from the webhook).
  const endsAtPeriodEnd =
    isPaidPlan && (!!subscription?.cancelAtPeriodEnd || subscription?.status === "canceled");

  // Plan & Billing self-heal: when the section opens, re-read the subscription
  // straight from Stripe (missed webhook, or a cancel made before the
  // cancel_at_period_end column existed) and refresh the session so the card
  // shows the truth. Once per page mount.
  const billingSyncedRef = useRef(false);
  useEffect(() => {
    if (section !== "billing" || billingSyncedRef.current || !user || adminAccess) return;
    billingSyncedRef.current = true;
    void fetch("/api/stripe/sync-subscription", { method: "POST", credentials: "include" })
      .then(() => refreshSession())
      .catch(() => {});
  }, [section, user, adminAccess]);

  // Plan & Billing card copy (per the owner's mockup): a status row with a
  // check bubble + the renewal line, and — below a divider — the upgrade hint
  // sitting right next to the Upgrade button.
  const upgradeHint =
    plan?.id === "pro"
      ? "Upgrade to Max for WAV, stems & commercial license."
      : "Upgrade to unlock unlimited downloads & WAV.";

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 pt-20 text-center">
          <h1 className="text-2xl text-foreground">Your account</h1>
          <p className="mt-3 font-body text-sm text-muted-foreground">
            Sign in to see your downloads, licenses and billing.
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

  const isCanceled = endsAtPeriodEnd;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <div className="flex flex-col gap-8 md:flex-row">
          {/* Sidebar */}
          <aside className="hidden shrink-0 md:block md:w-56">
            {/* NO flex `gap` anywhere in this sidebar and ONE spacing scale
                (groups md:mb-5, items md:space-y-1) — flex gaps hit Chromium's
                "gap not recalculated until reflow" bug when blocks toggle, and
                mixed margins made the rhythm shift on the first click. */}
            <nav className="flex space-x-4 overflow-x-auto md:flex-col md:space-x-0">
              {user.role === "admin" && (
                <MenuGroupHeader label="Main" open={menu === "main"} onClick={() => setMenu("main")} />
              )}
              {/* Both menu blocks are ALWAYS rendered and toggled with hidden/
                  flex — conditional mounting hit the "no paint until reflow" bug. */}
              <div
                className={`${
                  user.role !== "admin" || menu === "main" ? "flex" : "hidden"
                } space-x-4 md:flex-col md:space-x-0`}
              >
                {accountNavGroups.map((group) => (
                  <div key={group.label} className="shrink-0 md:mb-5">
                    <p className="px-3 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                      {group.label}
                    </p>
                    <div className="relative flex space-x-1 md:flex-col md:space-x-0 md:pl-8">
                      <MenuTreeLines className="hidden md:block" />
                      {group.items.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSection(s.id as SectionId)}
                          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm transition-colors md:h-9 md:py-0 md:pl-2 md:pr-3 ${
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
              </div>
              {showComposerMenu && (
                /* Composer studio — sections render INSIDE this page. Composers
                   see it as a plain group under a separator; admins get a
                   Main/Composer/Admin toggle header like the other menus. */
                <div className="shrink-0">
                  {user.role === "admin" ? (
                    <MenuGroupHeader
                      label="Composer"
                      open={menu === "composer"}
                      onClick={() => setMenu("composer")}
                    />
                  ) : (
                    <div className="mb-4 border-t border-border/60 md:mx-3" />
                  )}
                  <div
                    className={`${
                      user.role !== "admin" || menu === "composer" ? "flex" : "hidden"
                    } space-x-4 md:flex-col md:space-x-0`}
                  >
                    <div className="shrink-0 md:mb-5">
                      {user.role !== "admin" && (
                        <p className="px-3 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                          Composer
                        </p>
                      )}
                      {(() => {
                        // Upload is only there when the admin allowed it. The
                        // server refuses the upload anyway — this just stops
                        // the UI from offering a door that is locked.
                        const items = composerNavItems.filter(
                          (item) =>
                            item.id !== "upload" ||
                            user.role === "admin" ||
                            composerProbe.composer?.canUploadTracks !== false,
                        );
                        return (
                          <div className="relative flex space-x-1 md:flex-col md:space-x-0 md:pl-8">
                            <MenuTreeLines className="hidden md:block" />
                            {items.map((item) => {
                              const id = `composer-${item.id}` as SectionId;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setSection(id)}
                                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm transition-colors md:h-9 md:py-0 md:pl-2 md:pr-3 ${
                                    section === id
                                      ? "bg-secondary text-[#F4C430]"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  <item.icon className="h-4 w-4" />
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
              {user.role === "admin" && (
                <div className="shrink-0">
                  <MenuGroupHeader
                    label="Admin"
                    open={menu === "admin"}
                    onClick={() => setMenu("admin")}
                  />
                  {/* Grouped like the /admin sidebar (Overview/Catalog/…), always rendered. */}
                  <div className={`${menu === "admin" ? "flex" : "hidden"} space-x-4 md:flex-col md:space-x-0`}>
                    {adminNavGroups.map((group) => (
                      <div key={group.label} className="shrink-0 md:mb-5">
                        <p className="px-3 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                          {group.label}
                        </p>
                        {/* Same soft beams as the /admin sidebar — desktop
                            only: on mobile this row is horizontal. */}
                        <div className="relative flex space-x-1 md:flex-col md:space-x-0 md:pl-8">
                          <MenuTreeLines className="hidden md:block" />
                          {group.items.map((item) => (
                            <Link
                              key={item.id}
                              to={`/admin?section=${item.id}`}
                              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground md:h-9 md:py-0 md:pl-2 md:pr-3"
                            >
                              <item.icon className="h-4 w-4" />
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Log out lives in the header account popup — no sidebar copy. */}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {isCanceled && (
              <div className="rounded-xl border border-[#F4C430]/50 bg-[#F4C430]/10 p-4 font-body text-sm text-foreground">
                Your {plan?.name} plan is canceled and stays active until{" "}
                {benefitsUntil ?? "the end of your current billing period"}.{" "}
                <Link to="/pricing" className="font-semibold text-[#F4C430] hover:underline">
                  Resubscribe
                </Link>
              </div>
            )}

            {/* Composer studio sections (sidebar "Composer" group). */}
            {section.startsWith("composer-") && (
              <ComposerPanel section={section.slice("composer-".length) as ComposerSectionId} />
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
                      {/* Current plan at a glance (minimal gold chip). */}
                      <span
                        className={`mt-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 font-body text-[11px] font-semibold ${
                          subscription?.plan && subscription.plan !== "free"
                            ? "border-[#F4C430]/50 bg-[#F4C430]/10 text-[#F4C430]"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {(plan?.name ?? "Free") + " plan"}
                      </span>
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

                {/* Self-delete — customers only. Admin and composer accounts
                    are removed by the owner (composer tracks must never be
                    endangered by a one-click self-delete). */}
                {user.role === "customer" && !composerProbe.loading && !composerProbe.composer && (
                  <div className="mt-6 border-t border-border/60 pt-4">
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={() => void deleteOwnAccount()}
                      className="rounded-lg border border-red-400/40 px-4 py-2 font-body text-sm font-semibold text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                    >
                      {deletingAccount ? "Deleting…" : "Delete account"}
                    </button>
                    <p className="mt-2 font-body text-xs text-muted-foreground">
                      Permanently removes your account, subscription and settings.
                    </p>
                  </div>
                )}
              </SectionCard>
            )}

            {section === "notifications" && <NotificationsSettings />}

            {section === "favourites" && <FavouritesSection />}

            {section === "downloads" && (
              <SectionCard title="Download history">
                {downloads.length === 0 ? (
                  <EmptyNote text="Nothing here yet — the tracks you download will appear here." />
                ) : (
                  <div>
                    {/* The customer's library: the same rows as the catalogue —
                        play, waveform, and the download button on each one. One
                        row per track (re-downloads don't duplicate it), newest
                        first. No per-track licence link here: a subscriber has a
                        single library-wide licence in the Licenses tab. */}
                    {/* No tag pills here: the card is half the catalogue's width
                        and the row spilled out of it. */}
                    <TrackRowList tracks={pagedDownloadTracks} hideTags />

                    {/* 20 per page — the history of a heavy user gets long fast. */}
                    {downloadPages > 1 && (
                      <div className="mt-4 flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={safeDlPage === 1}
                          onClick={() => setDlPage((p) => Math.max(1, p - 1))}
                          className="h-8 rounded-lg border border-border px-3 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:pointer-events-none disabled:opacity-40"
                        >
                          Prev
                        </button>
                        <span className="px-2 font-body text-xs text-muted-foreground">
                          {safeDlPage} / {downloadPages}
                        </span>
                        <button
                          type="button"
                          disabled={safeDlPage === downloadPages}
                          onClick={() => setDlPage((p) => Math.min(downloadPages, p + 1))}
                          className="h-8 rounded-lg border border-border px-3 font-body text-xs text-muted-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:pointer-events-none disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
            )}

            {/* Licenses: subscription-covered tracks + purchased ones, each
                with audio, its PDF certificate and the Edit-certificate form. */}
            {section === "license" && <LicensesSection />}

            {section === "receipts" && <ReceiptsSection />}

            {/* Customer channel whitelisting is PAUSED (owner decision
                2026-07-18) — the MyChannels section is unmounted, claims are
                handled per-video below. Admin tooling and data stay intact. */}

            {section === "claims" && (
              <div className="flex flex-col gap-6">
                {/* Card 1: the submission form. Card 2 (below): sent requests. */}
                <SectionCard title="Copyright Claims">
                  <form
                    className="flex max-w-xl flex-col gap-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitClaim();
                    }}
                  >
                    <div>
                      <label
                        htmlFor="claim-video-url"
                        className="mb-1.5 block font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Got a Content ID claim? Send your video link for release.
                      </label>
                      <input
                        id="claim-video-url"
                        value={claimUrl}
                        onChange={(e) => {
                          setClaimUrl(e.target.value);
                          setUrlError(false);
                        }}
                        placeholder="https://youtube.com/watch?v=..."
                        className={`h-9 w-full rounded-lg border bg-background px-3 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none ${
                          urlError
                            ? "claim-shake border-red-500 focus:border-red-500"
                            : "border-border focus:border-[#F4C430]"
                        }`}
                      />
                      {urlError && (
                        <p className="mt-1.5 font-body text-xs text-red-400">
                          Paste the YouTube link first.
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="claim-track-0"
                        className="mb-1.5 block font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Add the track used in the video
                      </label>

                      {/* One row per track — type anything. The white + below
                          adds another row; duplicates refuse to go in. */}
                      <div className={`flex flex-col gap-2 ${trackShake ? "claim-shake" : ""}`}>
                        {trackRows.map((row, i) => (
                          <div key={row.rid} className="flex flex-wrap items-center gap-2">
                            <input
                              id={i === 0 ? "claim-track-0" : undefined}
                              ref={i === 0 ? trackInputRef : undefined}
                              value={row.text}
                              onChange={(e) => setRowText(row.rid, e.target.value)}
                              onBlur={() => dedupeRowOnBlur(row.rid)}
                              placeholder="Track name…"
                              className={`h-9 w-full max-w-[240px] rounded-lg border bg-background px-3 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none ${
                                trackError && !row.text.trim()
                                  ? "border-red-500 focus:border-red-500"
                                  : "border-border focus:border-[#F4C430]"
                              }`}
                            />
                            {trackRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTrackRow(row.rid)}
                                aria-label="Remove this track"
                                className="text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {i === 0 && (
                              <>
                                <span className="font-body text-xs text-muted-foreground">or</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDlOpen((v) => !v);
                                    setDlPickPage(1);
                                  }}
                                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 font-body text-xs font-semibold transition-colors ${
                                    dlOpen
                                      ? "border-[#F4C430] bg-[#F4C430]/10 text-[#F4C430]"
                                      : "border-border text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                                  }`}
                                >
                                  <DownloadIcon className="h-3.5 w-3.5" />
                                  Downloads
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>

                      {trackError && (
                        <p className="mt-1.5 font-body text-xs text-red-400">
                          Enter the track name — we need to know what to release.
                        </p>
                      )}

                      {/* Always-there white + : one more track row. */}
                      <button
                        type="button"
                        onClick={addTrackRow}
                        aria-label="Add another track"
                        title="Add another track"
                        className="mt-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                      >
                        <Plus className="h-4 w-4" />
                      </button>

                      {/* The playable downloads list: play + waveform + Select,
                          10 per page with numbered pages. */}
                      {dlOpen && (
                        <div className="mt-3">
                          {dlPickTracks.length === 0 ? (
                            <p className="font-body text-xs text-muted-foreground">
                              {downloadedTracks.length === 0
                                ? "No downloads yet — type the track name instead."
                                : "All your downloaded tracks are already added."}
                            </p>
                          ) : (
                            <>
                              <div className="rounded-lg border border-border/60 bg-background/40">
                                {dlPickPageTracks.map((t) => (
                                  <ClaimPickRow key={t.id} track={t} onSelect={() => pickTrack(t)} />
                                ))}
                              </div>
                              {dlPickPages > 1 && (
                                <div className="mt-2 flex items-center gap-1">
                                  {Array.from({ length: dlPickPages }, (_, i) => i + 1).map((p) => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => setDlPickPage(p)}
                                      className={`h-7 min-w-7 rounded-md border px-2 font-body text-xs transition-colors ${
                                        p === safeDlPickPage
                                          ? "border-[#F4C430] text-[#F4C430]"
                                          : "border-border text-muted-foreground hover:border-[#F4C430] hover:text-[#F4C430]"
                                      }`}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={claimBusy}
                      className="self-start rounded-lg bg-[#F4C430] px-5 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
                    >
                      {claimBusy ? "Sending…" : "Submit"}
                    </button>
                  </form>
                </SectionCard>

                {/* Card 2: what was sent — three columns: the video (link +
                    its YouTube title), the music named for it, and the date. */}
                {claims.length > 0 && (
                  <SectionCard title="Sent requests">
                    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-x-4">
                      <span className="border-b border-border pb-2 font-body text-xs uppercase tracking-wide text-muted-foreground">
                        YouTube link
                      </span>
                      <span className="border-b border-border pb-2 font-body text-xs uppercase tracking-wide text-muted-foreground">
                        Used Music
                      </span>
                      <span className="border-b border-border pb-2 text-right font-body text-xs uppercase tracking-wide text-muted-foreground">
                        Date
                      </span>
                      {claims.map((c) => (
                        <Fragment key={c.id}>
                          <span className="min-w-0 border-b border-border/50 py-3 pr-2 font-body text-sm">
                            <a
                              href={c.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-[#F4C430] hover:underline"
                            >
                              {c.videoUrl.replace("https://www.", "")}
                            </a>
                            {c.videoTitle && (
                              <span className="mt-0.5 block truncate font-body text-xs text-muted-foreground">
                                {c.videoTitle}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 border-b border-border/50 py-3 pr-2 font-body text-sm text-foreground">
                            {c.trackTitles.length > 0 ? (
                              <span className="block truncate" title={c.trackTitles.join(", ")}>
                                {c.trackTitles.join(", ")}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </span>
                          <span className="whitespace-nowrap border-b border-border/50 py-3 text-right font-body text-xs text-muted-foreground">
                            {fmtDate(c.createdAt)}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  </SectionCard>
                )}
              </div>
            )}

            {section === "billing" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Plan &amp; Billing</h1>
                  <p className="mt-1 font-body text-sm text-muted-foreground">Manage your subscription</p>
                </div>

                <SectionPanel
                  title={adminAccess ? "Admin Access" : `${(plan?.name ?? "Free").toUpperCase()} Plan`}
                >
                  {/* Status row: check bubble + headline/renewal, Manage billing on the right. */}
                  <div className="flex flex-wrap items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          endsAtPeriodEnd
                            ? "bg-[#F4C430]"
                            : adminAccess || isPaidPlan
                              ? "bg-emerald-500"
                              : "bg-secondary"
                        }`}
                      >
                        {endsAtPeriodEnd ? (
                          // Won't auto-renew — an exclamation mark, not a happy check.
                          <span className="font-body text-lg font-extrabold leading-none text-background">
                            !
                          </span>
                        ) : (
                          <Check
                            strokeWidth={3}
                            className={`h-5 w-5 ${
                              adminAccess || isPaidPlan ? "text-white" : "text-muted-foreground"
                            }`}
                          />
                        )}
                      </div>
                      <div>
                        <p className="font-body text-[15px] font-semibold text-foreground">
                          {adminAccess
                            ? "Full access by role."
                            : endsAtPeriodEnd
                              ? `Your ${plan?.name} Plan is canceled.`
                              : isPaidPlan
                                ? `Great! You have access to the ${plan?.name} Plan.`
                                : "You're on the Free plan."}
                        </p>
                        <p className="mt-0.5 font-body text-sm text-muted-foreground">
                          {adminAccess
                            ? "Every format and unlimited downloads — no subscription needed."
                            : endsAtPeriodEnd
                              ? `Active until ${benefitsUntil ?? "the end of the paid period"} — then you switch to Free.`
                              : isPaidPlan
                                ? benefitsUntil
                                  ? `Your plan will renew on ${benefitsUntil}.`
                                  : "Renews automatically."
                                : "3 MP3 track downloads per month."}
                        </p>
                      </div>
                    </div>
                    {!adminAccess && BILLING_ENABLED && isPaidPlan && (
                      <button
                        type="button"
                        onClick={() => void openBillingPortal()}
                        className="rounded-lg border border-border px-4 py-2 font-body text-sm font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
                      >
                        Manage billing
                      </button>
                    )}
                  </div>

                  {/* Upgrade row (hidden on Max and for admins). */}
                  {!adminAccess && plan?.id !== "max" && (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-5">
                      <p className="font-body text-sm text-muted-foreground">{upgradeHint}</p>
                      <button
                        type="button"
                        onClick={() => openPlanModal()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4C430] px-5 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85"
                      >
                        <ArrowUpRight className="h-4 w-4" /> Upgrade plan
                      </button>
                    </div>
                  )}
                </SectionPanel>

                {/* The separate "Cancel Subscription" card is gone (owner's call):
                    cancellation lives in the Stripe portal behind Manage billing,
                    and the "active until" line above says everything else. */}

                {/* No "Account details" card here — name and email already live
                    in Profile; two places to read the same thing is one too many. */}
                {!BILLING_ENABLED && (
                  <p className="font-body text-xs text-muted-foreground">
                    Subscription billing is moving to a new provider and will be available again soon.
                    One-time track licenses are available now.
                  </p>
                )}
              </div>
            )}

            {section === "support" && <SupportSection />}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Account;
