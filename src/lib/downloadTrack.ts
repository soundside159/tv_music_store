import { toast } from "sonner";

// Shared download action for every Download button on the site.
// Talks to /api/download which enforces plan limits and logs the download.
// 401 -> opens the auth modal (Navigation listens for "tvms:open-auth").

export interface DownloadArgs {
  slug: string;
  versionId: string;
  src: string;
  title: string;
  label: string;
  format?: "mp3" | "wav";
  quality?: 128 | 320;
}

/**
 * Opens the "Download options" dialog (format picker, plan gates, free
 * counter). DownloadOptionsModal is mounted globally in App.tsx.
 */
export const openDownloadOptions = (args: DownloadArgs): void => {
  window.dispatchEvent(new CustomEvent("tvms:download-options", { detail: args }));
};

export const downloadTrackVersion = async (args: DownloadArgs): Promise<void> => {
  const format = args.format ?? "mp3";
  try {
    const res = await fetch("/api/download", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...args, format }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // WAV downloads arrive as a zip of every version.
      a.download =
        format === "wav"
          ? `${args.title} (WAV 44.1-16).zip`
          : `${args.title} (${args.label}).${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Download started", { description: `${args.title} — ${args.label}` });
      return;
    }

    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (res.status === 401 || data.code === "auth") {
      // Remember what the user wanted; resumed automatically right after sign-in.
      try {
        sessionStorage.setItem("tvms.pendingDownload", JSON.stringify({ ...args, format }));
      } catch {
        // storage unavailable — user will just click Download again
      }
      window.dispatchEvent(new Event("tvms:open-auth"));
      toast("Sign in to download tracks", {
        description: "Free account includes 3 downloads every month.",
      });
      return;
    }
    if (data.code === "limit") {
      toast.error("Free limit reached", {
        description: "You used all 3 downloads this month. Upgrade to Pro for unlimited.",
        action: { label: "See plans", onClick: () => (window.location.href = "/pricing") },
      });
      return;
    }
    if (data.code === "plan") {
      toast.error("Max plan feature", {
        description: data.error ?? "WAV & stems are included in the Max plan.",
        action: { label: "See plans", onClick: () => (window.location.href = "/pricing") },
      });
      return;
    }
    toast.error(data.error ?? "Download failed. Try again.");
  } catch {
    toast.error("Network error. Try again.");
  }
};

/**
 * After sign-in, bring the user back to the Download options popup for the track
 * they were on (instead of auto-downloading), so they pick the format and press
 * Download themselves.
 */
export const resumePendingDownload = (): void => {
  let pending: DownloadArgs | null = null;
  try {
    const raw = sessionStorage.getItem("tvms.pendingDownload");
    if (!raw) return;
    sessionStorage.removeItem("tvms.pendingDownload");
    pending = JSON.parse(raw) as DownloadArgs;
  } catch {
    return;
  }
  if (pending?.slug && pending.versionId) {
    openDownloadOptions(pending);
  }
};
