import { getSessionUser, getVocabularies, json, OWNER_EMAIL, readJson, type Ctx } from "../_utils";

// POST /api/admin/import-map — admin only. STAGE 5 (spreadsheet metadata import).
// Takes ONE CHUNK (≤20) of spreadsheet rows from a composer's table plus, per
// row, a short list of candidate catalog tracks (fuzzy-picked client-side).
// The model (a) confirms which candidate the row refers to (titles may differ
// in case/brackets/typos) and (b) picks Use Case / Genre / Mood STRICTLY from
// our admin-editable vocabularies, based only on the row's description and
// search tags. The server validates everything against the vocab lists, so a
// hallucinated value can never reach the catalog. The client then previews and
// applies via the normal bulk_update_tracks action.

const MODEL = "gpt-4o-mini";

interface InRow {
  title?: string;
  description?: string;
  tags?: string;
  candidates?: { id?: string; title?: string }[];
}

export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const user = await getSessionUser(ctx);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "admin" && user.email !== OWNER_EMAIL) {
    return json({ error: "Admin only" }, 403);
  }
  if (!ctx.env.OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY is not set in Pages → Settings" }, 503);
  }

  const body = await readJson<{ rows?: InRow[] }>(ctx.request);
  const rows = (Array.isArray(body?.rows) ? body!.rows! : []).slice(0, 20);
  if (rows.length === 0) return json({ error: "rows required" }, 400);

  const vocab = await getVocabularies(ctx.env.DB);

  const rowsText = rows
    .map((r, i) => {
      const cands = (r.candidates ?? [])
        .slice(0, 6)
        .map((c) => `{id:"${c.id}", title:"${(c.title ?? "").replace(/"/g, "'")}"}`)
        .join(", ");
      return `ROW ${i}:
title: ${r.title ?? ""}
description: ${(r.description ?? "").slice(0, 500)}
tags: ${(r.tags ?? "").slice(0, 300)}
candidates: [${cands}]`;
    })
    .join("\n\n");

  const prompt = `You map spreadsheet rows from music composers onto a music catalog.

Our fixed tag lists (you may ONLY use values from these, spelled exactly):
USE CASE: ${vocab.useCase.join(" | ")}
GENRE: ${vocab.genre.join(" | ")}
MOOD: ${vocab.mood.join(" | ")}

For every ROW below decide:
1. "trackId": which candidate refers to the SAME track as the row title (titles may differ in case, punctuation, bracketed suffixes or small typos). Use the candidate id, or null when no candidate is clearly the same track.
2. "useCase" (1-3 values), "genre" (1-3 values), "mood" (1-4 values): pick from the lists above based ONLY on the row's description and tags (and the title's obvious meaning). Choose what fits best; never invent values.

Reply with STRICT JSON: {"rows":[{"i":0,"trackId":"..."|null,"useCase":[],"genre":[],"mood":[]}, ...]} — one object per ROW in order, no other text.

${rowsText}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ctx.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 3000,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return json({ error: data.error?.message ?? `AI mapping failed (${res.status})` }, 502);
  }

  let parsed: { rows?: { i?: number; trackId?: string | null; useCase?: string[]; genre?: string[]; mood?: string[] }[] };
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return json({ error: "AI returned unreadable JSON — try again" }, 502);
  }

  // Validate: facet values must exist in the vocab (case-insensitive → canonical
  // spelling); trackId must be one of the row's candidates.
  const canon = (list: string[], values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    const out: string[] = [];
    for (const v of values) {
      if (typeof v !== "string") continue;
      const hit = list.find((x) => x.toLowerCase() === v.trim().toLowerCase());
      if (hit && !out.includes(hit)) out.push(hit);
    }
    return out;
  };

  const results = rows.map((r, i) => {
    const m = parsed.rows?.find((x) => x.i === i) ?? parsed.rows?.[i];
    const candidateIds = new Set((r.candidates ?? []).map((c) => c.id));
    const trackId =
      m && typeof m.trackId === "string" && candidateIds.has(m.trackId) ? m.trackId : null;
    return {
      i,
      trackId,
      useCase: canon(vocab.useCase, m?.useCase),
      genre: canon(vocab.genre, m?.genre),
      mood: canon(vocab.mood, m?.mood),
    };
  });

  return json({ ok: true, rows: results });
};
