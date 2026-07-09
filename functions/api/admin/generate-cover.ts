import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";

// POST /api/admin/generate-cover { trackId, hint? } — admin only.
// Generates cinematic key-art for a track via the OpenAI Images API
// (model gpt-image-1.5, quality medium, 1024x1024). The track's SAVED
// Use Case / Mood checkboxes are substituted into the fixed prompt below;
// `hint` is the optional one-word featured element the owner can type
// (e.g. "violin"). The PNG is stored in R2 under covers/ and the public
// /api/file path is returned — the client then makes the row thumbnail
// and saves both via bulk_update_tracks (same flow as a manual upload).
//
// OWNER SETUP: add the OPENAI_API_KEY secret in Cloudflare Pages
// (Settings → Variables and Secrets). NEVER commit the key.

const MODEL = "gpt-image-1.5";

const PROMPT_TEMPLATE = `Create an original cinematic key art image for a premium royalty-free music library.

The image must tell a completely new visual story every time. Never repeat previous concepts, characters, environments, camera angles, compositions, or subjects.

Choose the most compelling subject based on the provided Use Case and Mood. The subject can be a person, creature, vehicle, architecture, environment, technology, abstract phenomenon, or dramatic event—whatever best represents the emotion of the music.

The scene should feel like a single unforgettable frame captured from a $200 million Hollywood film.

Ultra cinematic. AAA blockbuster concept art. Premium production quality. Strong visual storytelling. One dominant focal subject. Powerful silhouette. Dynamic composition. Dramatic perspective. Low-angle or immersive camera whenever appropriate. Rich foreground, midground and background layers. Atmospheric perspective. Volumetric lighting. Dense cinematic atmosphere. Smoke, dust, rain, snow, fog, sparks, embers, debris or particles whenever appropriate. Subtle motion blur. Deep sense of scale. Realistic materials. Beautiful textures. Extremely high detail. Perfect visual hierarchy.

Use premium blockbuster color grading with rich contrast, deep blacks, glowing highlights and cinematic orange/teal, blue/orange or other film-quality color palettes that best fit the scene.

The environment should feel alive and full of atmosphere rather than empty. Every image should immediately attract attention even as a small thumbnail.

Avoid generic AI art, cheap fantasy illustrations, flat lighting, centered compositions, empty backgrounds, low detail, oversaturation, plastic skin, bad anatomy, duplicate subjects, text, logos, watermarks, frames, UI elements or album covers.

The image should feel expensive, emotional, dramatic and unforgettable.

Square composition.
1024×1024 resolution.

Use Case:
<USE_CASE>

Mood:
<MOOD>`;

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }
  if (!ctx.env.OPENAI_API_KEY) {
    return json(
      { error: "OPENAI_API_KEY is not set — add it in Pages → Settings → Variables and Secrets" },
      503,
    );
  }
  if (!ctx.env.R2) {
    return json({ error: "R2 bucket is not bound" }, 503);
  }

  const body = await readJson<{ trackId?: string; hint?: string }>(ctx.request);
  const trackId = body?.trackId;
  if (!trackId) return json({ error: "trackId required" }, 400);

  const track = await ctx.env.DB.prepare(
    `SELECT slug, title, use_case, mood FROM tracks WHERE id = ?1`,
  )
    .bind(trackId)
    .first<{ slug: string; title: string; use_case: string | null; mood: string | null }>();
  if (!track) return json({ error: "Track not found" }, 404);

  // The SAVED checkboxes drive the prompt (values are stored "A / B / C").
  const split = (v: string | null) =>
    (v ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  const useCase = split(track.use_case);
  const mood = split(track.mood);

  let prompt = PROMPT_TEMPLATE.replace(
    "<USE_CASE>",
    useCase.length ? useCase.join(", ") : "Film & TV",
  ).replace("<MOOD>", mood.length ? mood.join(", ") : "Cinematic, Emotional");

  // Optional featured element ("violin", "guitar", …) typed by the owner.
  const hint = (body?.hint ?? "").trim().slice(0, 60);
  if (hint) {
    prompt += `\n\nFeatured element (make it a natural, prominent part of the scene):\n${hint}`;
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ctx.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: "1024x1024",
      quality: "medium",
      n: 1,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { b64_json?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return json({ error: data.error?.message ?? `Image generation failed (${res.status})` }, 502);
  }
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return json({ error: "The image API returned no image" }, 502);

  // base64 -> bytes -> R2 (public covers/ prefix, served by /api/file/*).
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const base = (track.slug || "track").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40);
  const key = `covers/${base}-ai-${crypto.randomUUID().slice(0, 8)}.png`;
  await ctx.env.R2.put(key, bytes.buffer, { httpMetadata: { contentType: "image/png" } });

  return json({ ok: true, path: `/api/file/${key}` });
};
