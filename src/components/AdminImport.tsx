import { useMemo, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useTracks } from "@/hooks/useTracks";
import type { CatalogTrack } from "@/data/catalogTracks";

// STAGE 5 — spreadsheet metadata import.
// 1. Export the catalog as CSV (composers fill in / send their own tables).
// 2. Upload a CSV back: columns are auto-detected (remappable), rows are
//    fuzzy-matched to catalog tracks client-side, then the AI confirms the
//    matches AND picks Use Case / Genre / Mood from our vocabularies based on
//    each row's description + search tags (/api/admin/import-map, chunks of 15).
// 3. Preview table (match confidence, facets, what changes) → Apply writes
//    every included row via the normal bulk_update_tracks action.

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#F4C430] focus:outline-none";
const btnCls =
  "rounded-lg border border-border px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:border-[#F4C430] hover:text-[#F4C430] disabled:pointer-events-none disabled:opacity-50";
const goldBtnCls =
  "rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-semibold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50";

// ---------------------------------------------------------------------------
// CSV helpers (tiny parser — quotes + , ; or tab delimiters)
// ---------------------------------------------------------------------------

const sniffDelimiter = (text: string): string => {
  const head = text.slice(0, 2000);
  const counts: Array<[string, number]> = [",", ";", "\t"].map((d) => [
    d,
    (head.match(new RegExp(`\\${d}`, "g")) ?? []).length,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
};

const parseCSV = (text: string): string[][] => {
  const delim = sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
};

const csvEscape = (v: string | number | null | undefined): string => {
  const s = String(v ?? "");
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ---------------------------------------------------------------------------
// Fuzzy title matching (client-side candidates for the AI)
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9а-яё]+/g, " ")
    .trim();

const similarity = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
};

// ---------------------------------------------------------------------------

type ColKey = "title" | "description" | "tags" | "bpm";

interface PreviewRow {
  i: number;
  title: string;
  description: string;
  tags: string;
  bpm: string;
  trackId: string | null;
  matchTitle: string;
  exact: boolean;
  useCase: string[];
  genre: string[];
  mood: string[];
  include: boolean;
  status: "pending" | "analyzed" | "applied" | "error";
}

const HEADER_GUESSES: Record<ColKey, RegExp> = {
  title: /^(title|track|name|назв)/i,
  description: /^(desc|about|опис)/i,
  tags: /^(tags?|keywords?|теги|ключ)/i,
  bpm: /^(bpm|tempo|темп)/i,
};

const AdminImport = () => {
  const { tracks, source } = useTracks({ drafts: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [cols, setCols] = useState<Partial<Record<ColKey, number>>>({});
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // ---- 1. Export ------------------------------------------------------------
  const exportCsv = () => {
    const header = ["code", "title", "composer", "bpm", "status", "use case", "genre", "mood", "tags", "description"];
    const lines = [header.join(",")].concat(
      tracks.map((t) =>
        [
          t.code ?? "",
          t.title,
          t.artist,
          t.bpm || "",
          t.status ?? "published",
          t.useCase,
          t.genre,
          t.mood,
          t.tags.join(", "),
          t.description,
        ]
          .map(csvEscape)
          .join(","),
      ),
    );
    // ﻿ BOM so Excel opens the UTF-8 CSV with correct characters.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tvmusicstore-tracks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---- 2. Load a table -------------------------------------------------------
  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length < 2) {
      toast.error("The file needs a header row and at least one data row");
      return;
    }
    const header = parsed[0];
    const guess: Partial<Record<ColKey, number>> = {};
    header.forEach((h, idx) => {
      (Object.keys(HEADER_GUESSES) as ColKey[]).forEach((key) => {
        if (guess[key] === undefined && HEADER_GUESSES[key].test(h.trim())) guess[key] = idx;
      });
    });
    if (guess.title === undefined) guess.title = 0;
    setGrid(parsed);
    setCols(guess);
    setRows([]);
  };

  // ---- 3. Analyze (fuzzy candidates + AI mapping in chunks) ------------------
  const analyze = async () => {
    if (!grid || cols.title === undefined) return;
    setBusy(true);
    try {
      const normTracks = tracks.map((t) => ({ t, n: norm(t.title) }));
      const drafts: PreviewRow[] = grid.slice(1).map((r, i) => {
        const title = (r[cols.title!] ?? "").trim();
        const n = norm(title);
        let best: { t: CatalogTrack; score: number } | null = null;
        for (const { t, n: tn } of normTracks) {
          const score = similarity(n, tn);
          if (!best || score > best.score) best = { t, score };
        }
        const exact = !!best && best.score >= 0.999;
        return {
          i,
          title,
          description: cols.description !== undefined ? (r[cols.description] ?? "").trim() : "",
          tags: cols.tags !== undefined ? (r[cols.tags] ?? "").trim() : "",
          bpm: cols.bpm !== undefined ? (r[cols.bpm] ?? "").replace(/[^0-9]/g, "") : "",
          trackId: exact ? best!.t.id : null,
          matchTitle: exact ? best!.t.title : "",
          exact,
          useCase: [],
          genre: [],
          mood: [],
          include: true,
          status: "pending",
        };
      });
      setRows([...drafts]);

      // Chunked AI pass: confirm fuzzy matches + pick facets.
      const CHUNK = 15;
      for (let start = 0; start < drafts.length; start += CHUNK) {
        setNote(`AI ${Math.min(start + CHUNK, drafts.length)}/${drafts.length}…`);
        const chunk = drafts.slice(start, start + CHUNK);
        const payload = chunk.map((row) => {
          const n = norm(row.title);
          const cands = normTracks
            .map(({ t, n: tn }) => ({ t, score: similarity(n, tn) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .filter((c) => c.score > 0.25)
            .map((c) => ({ id: c.t.id, title: c.t.title }));
          return { title: row.title, description: row.description, tags: row.tags, candidates: cands };
        });
        const res = await fetch("/api/admin/import-map", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows: payload }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          rows?: { i: number; trackId: string | null; useCase: string[]; genre: string[]; mood: string[] }[];
          error?: string;
        };
        if (!res.ok || !d.ok || !d.rows) throw new Error(d.error ?? "AI mapping failed");
        for (const m of d.rows) {
          const row = chunk[m.i];
          if (!row) continue;
          if (!row.exact && m.trackId) {
            row.trackId = m.trackId;
            row.matchTitle = tracks.find((t) => t.id === m.trackId)?.title ?? "";
          }
          row.useCase = m.useCase;
          row.genre = m.genre;
          row.mood = m.mood;
          row.status = "analyzed";
          if (!row.trackId) row.include = false;
        }
        setRows([...drafts]);
      }
      setNote("");
      const unmatched = drafts.filter((r) => !r.trackId).length;
      toast.success(
        `Analyzed ${drafts.length} row(s)` + (unmatched ? ` · ${unmatched} without a match` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analyze failed");
      setNote("");
    } finally {
      setBusy(false);
    }
  };

  // ---- 4. Apply ---------------------------------------------------------------
  const apply = async () => {
    const todo = rows.filter((r) => r.include && r.trackId && r.status === "analyzed");
    if (todo.length === 0) return;
    if (!window.confirm(`Apply metadata to ${todo.length} track(s)?`)) return;
    setBusy(true);
    let done = 0;
    for (const r of todo) {
      setNote(`Applying ${done + 1}/${todo.length}…`);
      try {
        const fields: Record<string, unknown> = {};
        if (r.description) fields.description = r.description;
        if (r.tags) fields.tags = r.tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
        if (r.bpm) fields.bpm = Number(r.bpm);
        const res = await fetch("/api/admin/content", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "bulk_update_tracks",
            trackIds: [r.trackId],
            facets: {
              useCase: { add: r.useCase },
              genre: { add: r.genre },
              mood: { add: r.mood },
            },
            ...(Object.keys(fields).length > 0 ? { fields } : {}),
          }),
        });
        const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !d.ok) throw new Error(d.error ?? "failed");
        r.status = "applied";
        done += 1;
      } catch (e) {
        r.status = "error";
        toast.error(`${r.title}: ${e instanceof Error ? e.message : "failed"}`);
      }
      setRows([...rows]);
    }
    setNote("");
    setBusy(false);
    if (done > 0) {
      toast.success(`Metadata applied to ${done} track(s)`, {
        description: "Next: select them in Tracks and run AI Art & Text, then Publish.",
      });
    }
  };

  const header = grid?.[0] ?? [];
  const analyzed = rows.some((r) => r.status !== "pending");
  const applicable = rows.filter((r) => r.include && r.trackId && r.status === "analyzed").length;

  const colPicker = (key: ColKey, label: string) => (
    <label className="flex items-center gap-2 font-body text-xs text-muted-foreground">
      {label}
      <select
        value={cols[key] ?? -1}
        onChange={(e) =>
          setCols((c) => ({ ...c, [key]: e.target.value === "-1" ? undefined : Number(e.target.value) }))
        }
        className={`${inputCls} py-1.5 text-xs`}
      >
        <option value={-1}>—</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-body text-lg font-semibold text-foreground">Import (CSV)</h2>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={exportCsv} className={btnCls} disabled={source !== "api"}>
            <Download className="mr-1 inline h-3.5 w-3.5" />
            Export catalog CSV
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={goldBtnCls}>
            <Upload className="mr-1 inline h-4 w-4" />
            Load a table…
          </button>
        </div>
      </div>
      <p className="mt-2 font-body text-xs text-muted-foreground">
        Load a composer's CSV (Excel/Google Sheets → save as CSV). Rows are matched to catalog
        tracks by title (AI double-checks near-misses), and Use Case / Genre / Mood are picked by
        AI from each row's description and search tags. Nothing is written until you press Apply.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />

      {grid && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-border/60 bg-background/40 p-3">
            <span className="font-body text-xs text-foreground">
              <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5 text-[#F4C430]" />
              {grid.length - 1} rows
            </span>
            {colPicker("title", "Title")}
            {colPicker("description", "Description")}
            {colPicker("tags", "Tags")}
            {colPicker("bpm", "BPM")}
            <button
              type="button"
              disabled={busy || cols.title === undefined}
              onClick={() => void analyze()}
              className={`${goldBtnCls} ml-auto inline-flex items-center gap-1.5`}
            >
              <Sparkles className={`h-4 w-4 ${busy && note.startsWith("AI") ? "animate-pulse" : ""}`} />
              {busy && note ? note : "Analyze with AI"}
            </button>
          </div>

          {rows.length > 0 && (
            <>
              <div className="mt-4 overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full min-w-[860px] font-body text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40 text-left uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">
                        <Check className="h-3.5 w-3.5" />
                      </th>
                      <th className="px-2 py-2">Row title</th>
                      <th className="px-2 py-2">Matched track</th>
                      <th className="px-2 py-2">Use Case / Genre / Mood (AI)</th>
                      <th className="px-2 py-2">BPM</th>
                      <th className="px-2 py-2">Description</th>
                      <th className="px-2 py-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.i} className={`border-b border-border/40 last:border-0 ${r.include ? "" : "opacity-45"}`}>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            className="accent-[#F4C430]"
                            checked={r.include}
                            disabled={busy || !r.trackId || r.status === "applied"}
                            onChange={(e) =>
                              setRows((rs) => rs.map((x) => (x.i === r.i ? { ...x, include: e.target.checked } : x)))
                            }
                          />
                        </td>
                        <td className="max-w-[14rem] truncate px-2 py-2 text-foreground">{r.title}</td>
                        <td className="px-2 py-2">
                          <select
                            value={r.trackId ?? ""}
                            disabled={busy || r.status === "applied"}
                            onChange={(e) =>
                              setRows((rs) =>
                                rs.map((x) =>
                                  x.i === r.i
                                    ? {
                                        ...x,
                                        trackId: e.target.value || null,
                                        matchTitle: tracks.find((t) => t.id === e.target.value)?.title ?? "",
                                        include: !!e.target.value && x.include,
                                      }
                                    : x,
                                ),
                              )
                            }
                            className={`${inputCls} max-w-[13rem] py-1 text-xs ${
                              r.trackId ? (r.exact ? "border-green-500/50" : "border-[#F4C430]/60") : "border-red-400/50"
                            }`}
                          >
                            <option value="">— no match —</option>
                            {tracks.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.title}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="max-w-[16rem] px-2 py-2 text-muted-foreground">
                          {[...r.useCase, ...r.genre, ...r.mood].join(" · ") || "—"}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-muted-foreground">{r.bpm || "—"}</td>
                        <td className="max-w-[16rem] truncate px-2 py-2 text-muted-foreground" title={r.description}>
                          {r.description || "—"}
                        </td>
                        <td className="px-2 py-2">
                          {r.status === "applied" ? (
                            <span className="text-green-400">applied</span>
                          ) : r.status === "error" ? (
                            <span className="text-red-400">error</span>
                          ) : r.status === "analyzed" ? (
                            <span className="text-[#F4C430]">ready</span>
                          ) : (
                            <span className="text-muted-foreground">…</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy || !analyzed || applicable === 0 || source !== "api"}
                  onClick={() => void apply()}
                  className={goldBtnCls}
                >
                  {busy && note.startsWith("Applying") ? note : `Apply to ${applicable} track(s)`}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setGrid(null);
                    setRows([]);
                  }}
                  className={btnCls}
                >
                  <X className="mr-1 inline h-3.5 w-3.5" />
                  Clear
                </button>
                <span className="font-body text-[11px] text-muted-foreground">
                  Facets are ADDED to the tracks; description / tags / BPM from the table overwrite.
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AdminImport;
