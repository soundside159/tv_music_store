import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadCoverImage } from "@/lib/coverArt";

// Admin -> Users -> composer: the photo that sits BEHIND his public artist page
// (/artist/<slug>), blurred full-width glow + the sharp photo on the right.
// The file is scaled down in the browser first (a phone photo is 5-10 MB; the
// page only needs ~1800 px), then stored like a cover (R2 -> /api/file/...).

const MAX_SIDE = 1800;

const downscale = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the image"))), "image/jpeg", 0.86);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the image"));
    };
    img.src = url;
  });

const ComposerPhotoField = ({
  userId,
  slugHint,
  photo,
  onSaved,
}: {
  userId: string;
  slugHint: string;
  photo: string | null;
  onSaved: (photo: string | null) => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const save = async (value: string) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId, photo: value }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
    onSaved(value || null);
  };

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const blob = await downscale(file);
      const path = await uploadCoverImage(blob, `artist-${slugHint || userId}-${Date.now()}.jpg`);
      await save(path);
      toast.success("Photo saved — it shows behind the artist page");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <p className="mb-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4C430]">Artist page photo</p>
      <div className="flex items-center gap-3">
        {photo ? (
          <img src={photo} alt="" className="h-16 w-12 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border font-body text-[10px] text-muted-foreground">
            none
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="rounded-lg bg-[#F4C430] px-3 py-1.5 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
          >
            {busy ? "Uploading…" : photo ? "Replace photo" : "Upload photo"}
          </button>
          {photo && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void save("")
                  .then(() => toast.success("Photo removed"))
                  .catch((e: Error) => toast.error(e.message))
                  .finally(() => setBusy(false));
              }}
              className="font-body text-[11px] text-muted-foreground hover:text-red-400"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 font-body text-[10px] text-muted-foreground">
        A portrait works best (person on the right or centre). It sits behind the page as a soft background.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />
    </div>
  );
};

export default ComposerPhotoField;
