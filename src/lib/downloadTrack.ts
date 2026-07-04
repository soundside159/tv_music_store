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
}

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
      a.download = `${args.title} (${args.label}).${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Download started", { description: `${args.title} — ${args.label}` });
      return;
    }

    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (res.status === 401 || data.code === "auth") {
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
