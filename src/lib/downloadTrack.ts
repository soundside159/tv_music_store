import { toast } from "sonner";

// Shared download action for every Download button on the site.
// Talks to /api/download which enforces plan limits and logs the download.
// 401 -> opens the auth modal (Navigation listens for "tvms:open-auth").

const SITE = "tvmusicstore.com";

const sanitizeName = (s: string) =>
  s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();

// "1685_As Light As A Feather" -> "As Light As A Feather" for filenames.
// Leading digits are ONLY a catalog number when a separator follows AND they
// are not a duration marker — "15sec" / "30 sec" version labels keep their 15.
const CATALOG_NUM_RE = /^\s*\d+[\s._-]+(?!(?:sec(?:s|onds?)?|min(?:s|utes?)?)\b)/i;
const tidyTitle = (s: string) => {
  const t = (s ?? "").replace(/_+/g, " ").replace(CATALOG_NUM_RE, "").trim();
  return t || (s ?? "").trim();
};

/**
 * Turns a raw version label into just the part that ISN'T the track title.
 * "Opening Up Space (short version)" + title "Opening Up Space" -> "short version".
 * The main version (label == title, "Main", or empty) returns "".
 */
export const cleanVersionLabel = (label: string, title: string): string => {
  // Underscores/dashes read as spaces; leading catalog numbers ("1685_") drop.
  let s = (label ?? "").replace(/[_]+/g, " ").replace(CATALOG_NUM_RE, "").trim();
  const t = (title ?? "").replace(/[_]+/g, " ").replace(CATALOG_NUM_RE, "").trim();
  if (t) {
    // The title may sit anywhere ("Composer Name_Title_30sec") — keep only
    // what comes AFTER it, so author prefixes fall away with it.
    const idx = s.toLowerCase().indexOf(t.toLowerCase());
    if (idx >= 0) s = s.slice(idx + t.length);
  }
  s = s.replace(/^[\s\-–—()[\]]+|[\s\-–—()[\]]+$/g, "").trim();
  if (/^(main|full|original|full version)$/i.test(s)) s = "";
  return s;
};

/** UI label for a version: cleaned, but never empty — falls back to the raw
 *  label when nothing but the title itself was in it. */
export const displayVersionLabel = (label: string, title: string): string =>
  cleanVersionLabel(label, title) || label;

/** Pulls the leading track code out of a slug ("1042-opening-up-space" -> "1042"). */
export const codeFromSlug = (slug: string): string => slug.match(/^(\d+)/)?.[1] ?? "";

/** tunetank-style name: "tvmusicstore.com_1042_Title (version).mp3". */
export const downloadFileName = (title: string, label: string, format: string, code = ""): string => {
  const suffix = cleanVersionLabel(label ?? "", title);
  const base = suffix ? `${tidyTitle(title)} (${suffix})` : tidyTitle(title);
  const prefix = code ? `${SITE}_${code}` : SITE;
  return `${prefix}_${sanitizeName(base)}.${format}`;
};

/** WAV bundle name: "tvmusicstore.com_1042_Title.zip". */
export const wavZipFileName = (title: string, code = ""): string => {
  const prefix = code ? `${SITE}_${code}` : SITE;
  return `${prefix}_${sanitizeName(tidyTitle(title))}.zip`;
};

export interface DownloadArgs {
  slug: string;
  versionId: string;
  src: string;
  title: string;
  label: string;
  format?: "mp3" | "wav" | "stems";
  quality?: 128 | 320;
  /** Enables the STEMS option in the download dialog (stems zip uploaded). */
  hasStems?: boolean;
  /** "Include PDF License": the server adds the certificate to the download —
   *  an MP3 turns into a zip (mp3 + PDF); WAV/STEMS get the PDF in their zip.
   *  Needs a paid plan or a one-time license for the track. */
  includeLicense?: boolean;
}

// ---------------------------------------------------------------------------
// One-time licenses owned by the signed-in user. A purchased license unlocks
// WAV/320 for that track regardless of plan (the server enforces the same rule
// via sync_orders). Cached briefly so opening the download dialog stays cheap.
// ---------------------------------------------------------------------------

export interface OwnedLicense {
  /** sync_orders id — also the ?order= key for the license certificate PDF. */
  id: string;
  tier: string;
}

let licenseCache: { at: number; map: Map<string, OwnedLicense> } | null = null;

/** The user's one-time license for a track (by slug), or null. */
export const fetchMyLicenseFor = async (slug: string): Promise<OwnedLicense | null> => {
  const now = Date.now();
  if (!licenseCache || now - licenseCache.at > 30_000) {
    try {
      const res = await fetch("/api/licenses", { credentials: "include" });
      if (!res.ok) return null; // guest / API down — don't cache, retry next open
      const data = (await res.json()) as {
        licenses?: { id: string; tier: string; trackId: string; trackSlug?: string }[];
      };
      const map = new Map<string, OwnedLicense>();
      for (const l of data.licenses ?? []) {
        const own = { id: l.id, tier: l.tier };
        if (l.trackSlug) map.set(l.trackSlug, own);
        // PayPal capture stores the slug as track_id when the track row was
        // missing at purchase time — cover that fallback too.
        map.set(l.trackId, own);
      }
      licenseCache = { at: now, map };
    } catch {
      return null;
    }
  }
  return licenseCache.map.get(slug) ?? null;
};

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
      // WAV downloads arrive as a zip of every version; an MP3 with the
      // license included arrives as a zip too (check the response type).
      const gotZip = (res.headers.get("content-type") ?? "").includes("zip");
      const code = codeFromSlug(args.slug);
      a.download =
        format === "stems"
          ? wavZipFileName(`${args.title} STEMS`, code)
          : format === "wav" || gotZip
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
      toast.error("Not included in your plan", {
        description:
          data.error ?? "WAV files come with the Max plan or a one-time license for this track.",
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
