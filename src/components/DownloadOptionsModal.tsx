import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, X } from "lucide-react";
import { useAuthSession } from "@/hooks/useAuth";
import { downloadTrackVersion, type DownloadArgs } from "@/lib/downloadTrack";

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
  { id: "mp3-128", title: "MP3 128 Kbps", description: "Standard quality for quick playback.", need: "free" },
  { id: "mp3-320", title: "MP3 320 Kbps", description: "High-quality audio clarity.", need: "pro", badge: "PRO" },
  { id: "wav", title: "WAV 44.1 kHz", description: "Studio-grade, professional quality.", need: "max", badge: "MAX" },
  { id: "stems", title: "STEMS", description: "Individual tracks for full control.", need: "max", badge: "MAX", soon: true },
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const open = (event: Event) => {
      setArgs((event as CustomEvent<DownloadArgs>).detail);
      setSelected("mp3-128");
    };
    window.addEventListener("tvms:download-options", open);
    return () => window.removeEventListener("tvms:download-options", open);
  }, []);

  useEffect(() => {
    if (!args) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArgs(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [args]);

  if (!args) return null;

  const plan = status === "authed" ? (subscription?.plan ?? "free") : "free";
  const option = options.find((o) => o.id === selected) ?? options[0];
  const locked = planRank[plan] < planRank[option.need];
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
      await downloadTrackVersion({ ...args, format: option.id === "wav" ? "wav" : "mp3" });
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
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
          {args.title} — {args.label}
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          {options.map((o) => {
            const isActive = o.id === selected;
            return (
              <button
                key={o.id}
                type="button"
                disabled={o.soon}
                onClick={() => setSelected(o.id)}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  isActive
                    ? "border-[#F4C430] bg-[#F4C430]/10"
                    : "border-border bg-background/40 hover:border-[#F4C430]/50"
                } ${o.soon ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    isActive ? "border-[#F4C430]" : "border-border"
                  }`}
                >
                  {isActive && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GOLD }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-body text-sm font-semibold text-foreground">{o.title}</span>
                    {o.badge && <Badge label={o.badge} />}
                    {o.soon && (
                      <span className="rounded-full border border-border px-2 py-0.5 font-body text-[10px] text-muted-foreground">
                        SOON
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block font-body text-xs text-muted-foreground">{o.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-center font-body text-xs text-muted-foreground">
          {status === "authed" && plan === "free" && `${freeLeft} of 3 free downloads left this month`}
          {status === "authed" && plan !== "free" && "Unlimited downloads on your plan"}
          {status !== "authed" && "Free account includes 3 downloads every month"}
        </p>

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
