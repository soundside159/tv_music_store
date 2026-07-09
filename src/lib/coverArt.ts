// Cover-art helpers shared by the admin track page and the composer upload.

/**
 * Stamps the brand into the bottom-left corner of a generated cover — the
 * header logo + "TV MUSIC STORE" in the header's style (Inter semibold,
 * wide tracking). Only the FULL cover gets the stamp; row thumbnails are
 * made from the unbranded original (too small to read anyway).
 */
export const brandCover = async (source: Blob): Promise<Blob> => {
  const img = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Canvas unavailable");
  c.drawImage(img, 0, 0);

  const s = img.width / 1024; // scale everything relative to a 1024px cover
  const pad = 36 * s;

  // Soft dark gradient along the bottom so the mark reads on bright art.
  const gradH = 230 * s;
  const grad = c.createLinearGradient(0, img.height - gradH, 0, img.height);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.58)");
  c.fillStyle = grad;
  c.fillRect(0, img.height - gradH, img.width, gradH);

  const logo = new Image();
  logo.src = "/images/icons/logo-header.png";
  await logo.decode();
  const logoH = 62 * s;
  const logoW = logo.width * (logoH / logo.height);
  const y = img.height - pad - logoH;

  c.save();
  c.shadowColor = "rgba(0,0,0,0.6)";
  c.shadowBlur = 10 * s;
  c.shadowOffsetY = 2 * s;
  c.drawImage(logo, pad, y, logoW, logoH);
  c.font = `600 ${Math.round(33 * s)}px Inter, sans-serif`;
  try {
    // Match the header's tracking where supported (Chromium).
    (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(7 * s)}px`;
  } catch {
    // older browsers just render without the tracking
  }
  c.fillStyle = "#ffffff";
  c.textBaseline = "middle";
  c.fillText("TV MUSIC STORE", pad + logoW + 18 * s, y + logoH / 2 + 1 * s);
  c.restore();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Branding failed"))),
      "image/jpeg",
      0.92,
    ),
  );
};

/** Calls the cover-generation endpoint. Either a trackId (its saved facets
 *  drive the prompt) or explicit facet lists (composer upload flow). */
export const generateCoverApi = async (args: {
  trackId?: string;
  useCase?: string[];
  mood?: string[];
  hint?: string;
}): Promise<string> => {
  const res = await fetch("/api/admin/generate-cover", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; error?: string };
  if (!res.ok || !d.ok || !d.path) throw new Error(d.error ?? "Generation failed");
  return d.path;
};

/** Calls the description-generation endpoint (same OPENAI_API_KEY, text model).
 *  Either a trackId (saved facets) or explicit lists from an upload form. */
export const generateDescriptionApi = async (args: {
  trackId?: string;
  genre?: string[];
  mood?: string[];
  useCase?: string[];
}): Promise<string> => {
  const res = await fetch("/api/admin/generate-description", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const d = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    error?: string;
  };
  if (!res.ok || !d.ok || !d.description) throw new Error(d.error ?? "Generation failed");
  return d.description;
};

/** Uploads an image blob to the covers store; returns the public path. */
export const uploadCoverImage = async (file: Blob, filename: string): Promise<string> => {
  const base = filename.replace(/\.[^.]+$/, "");
  const res = await fetch(`/api/admin/upload?filename=${encodeURIComponent(base)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type || "image/jpeg" },
    body: file,
  });
  const d = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !d.path) throw new Error(d.error ?? "Upload failed");
  return d.path;
};
