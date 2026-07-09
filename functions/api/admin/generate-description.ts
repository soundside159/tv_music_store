import { getSessionUser, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";

// POST /api/admin/generate-description — admins AND composers.
//   { trackId }                                — saved Genre/Mood/Use Case drive the prompt
//   { genre: [], mood: [], useCase: [] }       — upload forms (before the track exists)
// Returns { ok, description } — one short SEO paragraph (60-90 words) written
// with the owner's fixed prompt below. Uses the same OPENAI_API_KEY as the
// cover generation, just the text endpoint.

// Bump here if OpenAI retires the model (the error toast will say so).
const MODEL = "gpt-4o-mini";

const PROMPT_TEMPLATE = `You are writing SEO-friendly music descriptions for a premium music library. Generate ONE short, natural English paragraph of AT MOST 360 characters (roughly 45–55 words) — never exceed 360 characters. Base the description ONLY on the provided Genre, Mood and Use Case. The description should: • immediately describe the feeling and atmosphere of the music • naturally mention suitable projects and use cases • sound like it was written by a professional music publisher • use clear, modern English • avoid exaggerated marketing language • avoid repeating the same adjective twice • never mention instruments unless they are strongly implied by the Genre • never invent a story or scene that contradicts the tags • never mention track names • never mention BPM, key or technical details • never use bullet points • never use quotation marks • never mention licensing terms such as "royalty-free", "license" or "copyright" Include 3–6 natural use examples whenever appropriate, such as: film trailers movies TV documentaries commercials advertising sports technology video games cinematic intros YouTube podcasts presentations background music social media corporate videos The result should sound similar to premium music libraries such as Artlist, PremiumBeat or Musicbed. Genre: <GENRE> Mood: <MOOD> Use Case: <USE_CASE>`;

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  let allowed = user.role === "admin" || user.email === OWNER_EMAIL || user.role === "composer";
  if (!allowed) {
    const cmp = await ctx.env.DB.prepare(`SELECT id FROM composers WHERE user_id = ?1 LIMIT 1`)
      .bind(user.id)
      .first();
    allowed = !!cmp;
  }
  if (!allowed) return json({ error: "Composer or admin account required" }, 403);
  if (!ctx.env.OPENAI_API_KEY) {
    return json(
      { error: "OPENAI_API_KEY is not set — add it in Pages → Settings → Variables and Secrets" },
      503,
    );
  }

  const body = await readJson<{
    trackId?: string;
    genre?: string[];
    mood?: string[];
    useCase?: string[];
  }>(ctx.request);

  const split = (v: string | null) =>
    (v ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  const asList = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 8) : [];

  let genre = asList(body?.genre);
  let mood = asList(body?.mood);
  let useCase = asList(body?.useCase);

  if (body?.trackId) {
    const track = await ctx.env.DB.prepare(
      `SELECT genre, mood, use_case FROM tracks WHERE id = ?1`,
    )
      .bind(body.trackId)
      .first<{ genre: string | null; mood: string | null; use_case: string | null }>();
    if (!track) return json({ error: "Track not found" }, 404);
    genre = split(track.genre);
    mood = split(track.mood);
    useCase = split(track.use_case);
  }
  if (genre.length === 0 && mood.length === 0 && useCase.length === 0) {
    return json({ error: "Pick Genre, Mood and Use Case first" }, 400);
  }

  const prompt = PROMPT_TEMPLATE.replace("<GENRE>", genre.join(", ") || "Cinematic")
    .replace("<MOOD>", mood.join(", ") || "Emotional")
    .replace("<USE_CASE>", useCase.join(", ") || "Film & TV");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ctx.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 220,
      temperature: 0.9,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return json({ error: data.error?.message ?? `Text generation failed (${res.status})` }, 502);
  }
  let description = data.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, "");
  if (!description) return json({ error: "The text API returned nothing" }, 502);
  // Hard cap at 360 chars (owner rule) — trim to the last full sentence if needed.
  if (description.length > 360) {
    const cut = description.slice(0, 360);
    const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    description = lastStop > 120 ? cut.slice(0, lastStop + 1) : cut.trimEnd();
  }

  return json({ ok: true, description });
};
