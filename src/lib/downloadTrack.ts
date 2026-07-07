import { toast } from "sonner";

// Shared download action for every Download button on the site.
// Talks to /api/download which enforces plan limits and logs the download.
// 401 -> opens the auth modal (Navigation listens for "tvms:open-auth").

const SITE = "tvmusicstore.com";

const sanitizeName = (s: string) =>
  s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();

/**
 * Turns a raw version label into just the part that ISN'T the track title.
 * "Opening Up Space (short version)" + title "Opening Up Space" -> "short version".
 * The main version (label == title, "Main", or empty) returns "".
 */
export const cleanVersionLabel = (label: string, title: string): string => {
  let s = (label ?? "").trim();
  const t = (title ?? "").trim();
  if (t && s.toLowerCase().startsWith(t.toLowerCase())) s = s.slice(t.length);
  s = s.replace(/^[\s\-–—()[\]]+|[\s\-–—()[\]]+$/g, "").trim();
  if (/^(main|full|original|full version)$/i.test(s)) s = "";
  return s;
};

/** Pulls the leading track code out of a slug ("1042-opening-up-space" -> "1042"). */
export const codeFromSlug = (slug: string): string => slug.match(/^(\d+)/)?.[1] ?? "";

/** tunetank-style name: "tvmusicstore.com_1042_Title (version).mp3". */
export const downloadFileName = (title: string, label: string, format: string, code = ""): string => {
  const suffix = cleanVersionLabel(label ?? "", title);
  const base = suffix ? `${title} (${suffix})` : title;
  const prefix = code ? `${SITE}_${code}` : SITE;
  return `${prefix}_${sanitizeName(base)}.${format}`;
};

/** WAV bundle name: "tvmusicstore.com_1042_Title.zip". */
export const wavZipFileName = (title: string, code = ""): string => {
  const prefix = code ? `${SITE}_${code}` : SITE;
  return `${prefix}_${sanitizeName(title)}.zip`;
};

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

export interface AttributionArgs {
  title: string;
  artist?: string;
  slug: string;
  /** The download to (re)run from the "download the audio file" fallback link. */
  download: DownloadArgs;
}

/**
 * Opens the "Say thanks!" attribution popup shown after a free-plan MP3 download
 * (AttributionModal is mounted in App.tsx).
 */
export const openAttribution = (args: AttributionArgs): void => {
  window.dispatchEvent(new CustomEvent("tvms:attribution", { detail: args }));
};

export const downloadTrackVersion = async (args: DownloadArgs): Promise<boolean> => {
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
      const code = codeFromSlug(args.slug);
      a.download =
        format === "wav"
          ? wavZipFileName(args.title, code)
          : downloadFileName(args.title, args.label, format, code);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Download started", { description: `${args.title} — ${args.label}` });
      return true;
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
      return false;
    }
    if (data.code === "limit") {
      toast.error("Free limit reached", {
        description: "You used all 3 downloads this month. Upgrade to Pro for unlimited.",
        action: { label: "See plans", onClick: () => (window.location.href = "/pricing") },
      });
      return false;
    }
    if (data.code === "plan") {
      toast.error("Max plan feature", {
        description: data.error ?? "WAV & stems are included in the Max plan.",
        action: { label: "See plans", onClick: () => (window.location.href = "/pricing") },
      });
      return false;
    }
    toast.error(data.error ?? "Download failed. Try again.");
    return false;
  } catch {
    toast.error("Network error. Try again.");
    return false;
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
