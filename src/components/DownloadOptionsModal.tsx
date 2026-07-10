import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Download, X } from "lucide-react";
import { refreshSession, useAuthSession } from "@/hooks/useAuth";
import {
  cleanVersionLabel,
  downloadTrackVersion,
  fetchMyLicenseFor,
  openAttribution,
  type DownloadArgs,
  type OwnedLicense,
} from "@/lib/downloadTrack";

// Tunetank-style download dialog. Any Download button dispatches
// "tvms:download-options" (see openDownloadOptions) and this modal takes over:
// format choice, plan gating, free-downloads counter, then the actual download.

const GOLD = "#F4C430";

type OptionId = "mp3-128" | "mp3-320" | "wav" | "stems";

interface FormatOption {
  id: OptionId;
  title: string;
  description: string;
  need: "free" | "pro" | "max";
  badge?: "PRO" | "MAX";
  soon?: boolean;
}

const options: FormatOption[] = [
  { id: "mp3-128", title: "MP3 128 Kbps", description: "Light file for rough cuts and previews.", need: "free" },
  { id: "mp3-320", title: "MP3 320 Kbps", description: "Full-quality MP3 for your final edit.", need: "pro", badge: "PRO" },
  { id: "wav", title: "WAV 44.1 kHz", description: "Uncompressed master for the edit suite.", need: "max", badge: "MAX" },
  { id: "stems", title: "STEMS", description: "Separated layers to remix and re-balance.", need: "max", badge: "MAX", soon: true },
];

const planRank: Record<string, number> = { free: 0, pro: 1, max: 2 };

const Badge = ({ label }: { label: string }) => (
  <span
    className="rounded-full px-2 py-0.5 font-body text-[10px] font-bold text-background"
    style={{ backgroundColor: GOLD }}
  >
    {label}
  </span>
);

const DownloadOptionsModal = () => {
  const navigate = useNavigate();
  const { status, subscription, downloadsUsedThisMonth } = useAuthSession();
  const [args, setArgs] = useState<DownloadArgs | null>(null);
  const [selected, setSelected] = useState<OptionId>("mp3-128");
  const [includePdf, setIncludePdf] = useState(false);
  const [busy, setBusy] = useState(false);
  // One-time license the user owns for THIS track (unlocks WAV/320 on any plan).
  const [license, setLicense] = useState<OwnedLicense | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      setArgs((event as CustomEvent<DownloadArgs>).detail);
      setSelected("mp3-128");
      setIncludePdf(false);
      setLicense(null);
    };
    window.addEventListener("tvms:download-options", open);
    return () => window.removeEventListener("tvms:download-options", open);
  }, []);

  useEffect(() => {
    if (!args || status !== "authed") return;
    let cancelled = false;
    void fetchMyLicenseFor(args.slug).then((own) => {
      if (!cancelled) setLicense(own);
    });
    return () => {
      cancelled = true;
    };
  }, [args, status]);

  useEffect(() => {
    if (!args) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArgs(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [args]);

  // When 128 kbps is hidden (Pro/Max/licensed), land on 320 instead.
  const planNow = status === "authed" ? (subscription?.plan ?? "free") : "free";
  useEffect(() => {
    if (selected === "mp3-128" && ((planRank[planNow] ?? 0) >= 1 || license)) {
      setSelected("mp3-320");
    }
  }, [selected, planNow, license]);

  if (!args) return null;

  const plan = status === "authed" ? (subscription?.plan ?? "free") : "free";
  // Pro/Max (and license owners) get full quality anyway — the 128 kbps
  // option would only be clutter, so it disappears for them.
  const hide128 = planRank[plan] >= 1 || !!license;
  // STEMS unlocks per track once a stems zip is uploaded; otherwise stays SOON.
  const availableOptions = options
    .filter((o) => !(o.id === "mp3-128" && hide128))
    .map((o) => (o.id === "stems" ? { ...o, soon: !args.hasStems } : o));
  const option = availableOptions.find((o) => o.id === selected) ?? availableOptions[0];
  // A purchased one-time license unlocks every available format for its track.
  const locked = planRank[plan] < planRank[option.need] && !license;
  const freeLeft = Math.max(0, 3 - downloadsUsedThisMonth);

  const close = () => setArgs(null);

  const act = async () => {
    if (locked) {
      close();
      navigate("/pricing");
      return;
    }
    setBusy(true);
    try {
      const dl: DownloadArgs = {
        ...args,
        format: option.id === "wav" ? "wav" : option.id === "stems" ? "stems" : "mp3",
        quality: option.id === "mp3-128" ? 128 : 320,
      };
      const ok = await downloadTrackVersion(dl);
      // Refresh the session so the free-downloads counter reflects this download.
      if (ok) void refreshSession();
      // Free-plan MP3 downloads require attribution — show the "Say thanks!"
      // popup (skipped when the user bought a license: no credit line needed).
      if (ok && status === "authed" && plan === "free" && !license && option.id === "mp3-128") {
        openAttribution({ title: args.title, slug: args.slug, download: dl });
      }
      if (includePdf && status === "authed" && (plan !== "free" || license)) {
        // Attachment header makes this download the certificate without
        // navigating. License owners get their purchase certificate (?order=),
        // subscribers the plan certificate (?slug=).
        const a = document.createElement("a");
        a.href = license
          ? `/api/license-pdf?order=${encodeURIComponent(license.id)}`
          : `/api/license-pdf?slug=${encodeURIComponent(args.slug)}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } finally {
      setBusy(false);
      close();
    }
  };

  const cta = locked
    ? `Upgrade to ${option.need.toUpperCase()}`
    : busy
      ? "Preparing..."
      : "Download Now";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/90 p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Download options"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-body text-lg font-semibold text-foreground">Download options</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 truncate font-body text-xs text-muted-foreground">
          {args.title}
          {cleanVersionLabel(args.label, args.title) ? ` — ${cleanVersionLabel(args.label, args.title)}` : ""}
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          {availableOptions.map((o) => {
            const isActive = o.id === selected;
            return (
              <button
                key={o.id}
                type="button"
                disabled={o.soon}
                onClick={() => setSelected(o.id)}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  isActive
                    ? "border-[#F4C430] bg-[#F4C430]/10"
                    : "border-border bg-background/40 hover:border-[#F4C430]/50"
                } ${o.soon ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-body text-sm font-semibold text-foreground">{o.title}</span>
                    {o.badge && <Badge label={license && !o.soon ? "LICENSED" : o.badge} />}
                    {o.soon && (
                      <span className="rounded-full border border-border px-2 py-0.5 font-body text-[10px] text-muted-foreground">
                        SOON
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block font-body text-xs text-muted-foreground">{o.description}</span>
                </span>
                {isActive && <Check className="h-5 w-5 shrink-0" style={{ color: GOLD }} />}
              </button>
            );
          })}
        </div>

        {status === "authed" && (plan !== "free" || license) && !option.soon && (
          <button
            type="button"
            onClick={() => setIncludePdf((v) => !v)}
            className="mt-4 flex w-full items-center gap-2.5 rounded-xl border border-border bg-background/40 p-3 text-left transition-colors hover:border-[#F4C430]/50"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                includePdf ? "border-[#F4C430] bg-[#F4C430]" : "border-border"
              }`}
            >
              {includePdf && <Check className="h-3 w-3 text-background" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-body text-xs font-semibold text-foreground">Include PDF License</span>
              <span className="block font-body text-[11px] text-muted-foreground">
                {license
                  ? "The certificate for the license you purchased for this track."
                  : "A license certificate for this track on your current plan."}
              </span>
            </span>
          </button>
        )}

        {license ? (
          <p className="mt-4 text-center font-body text-xs" style={{ color: GOLD }}>
            You own a license for this track — all formats unlocked
          </p>
        ) : (
          (status !== "authed" || plan === "free") && (
            <p className="mt-4 text-center font-body text-xs text-muted-foreground">
              {status === "authed"
                ? `${freeLeft} of 3 free downloads left this month`
                : "Free account includes 3 downloads every month"}
            </p>
          )
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void act()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F4C430] py-3 font-body text-sm font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-60"
        >
          {!locked && <Download className="h-4 w-4" />}
          {cta}
        </button>
      </div>
    </div>
  );
};

export default DownloadOptionsModal;
