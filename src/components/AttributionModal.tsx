import { useEffect, useMemo, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { downloadTrackVersion, type AttributionArgs } from "@/lib/downloadTrack";
import { openPlanModal } from "@/lib/billing";

// "Say thanks!" popup shown after a free-plan MP3 download. Free downloads
// require attribution; this gives the user ready-to-paste credit text and a
// nudge to upgrade for studio WAV / 320 kbps with no attribution.

const AttributionModal = () => {
  const [args, setArgs] = useState<AttributionArgs | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const open = (event: Event) => {
      setArgs((event as CustomEvent<AttributionArgs>).detail);
      setCopied(false);
    };
    window.addEventListener("tvms:attribution", open);
    return () => window.removeEventListener("tvms:attribution", open);
  }, []);

  useEffect(() => {
    if (!args) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArgs(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [args]);

  const attribution = useMemo(() => {
    if (!args) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "https://tvmusicstore.com";
    const by = args.artist || "TVMUSICSTORE";
    return `Royalty Free Music from tvmusicstore.com\nTrack: ${args.title} by ${by}\n${origin}/track/${args.slug}`;
  }, [args]);

  if (!args) return null;

  const close = () => setArgs(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(attribution);
      setCopied(true);
      toast.success("Attribution copied");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Say thanks"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-foreground">Say thanks!</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-border bg-background/50 p-4 font-body text-sm text-muted-foreground">
          {attribution}
        </pre>

        <button
          type="button"
          onClick={() => void copy()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/40 py-3 font-body text-sm font-semibold text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430]"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy attribution"}
        </button>

        <p className="mt-4 text-center font-body text-xs text-muted-foreground">
          If the download does not start automatically, click here to{" "}
          <button
            type="button"
            onClick={() => void downloadTrackVersion(args.download)}
            className="font-semibold text-foreground underline underline-offset-2 hover:text-[#F4C430]"
          >
            download the audio file
          </button>
          .
        </p>

        <p className="mt-4 border-t border-border/60 pt-4 text-center font-body text-xs text-muted-foreground">
          Want studio WAV, 320 Kbps and no attribution?{" "}
          <button
            type="button"
            onClick={() => {
              close();
              openPlanModal();
            }}
            className="font-semibold text-[#F4C430] underline underline-offset-2 hover:opacity-80"
          >
            See plans
          </button>
          .
        </p>
      </div>
    </div>
  );
};

export default AttributionModal;
