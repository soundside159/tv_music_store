import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, FileText, Loader2, Music2, Pencil, Users, X } from "lucide-react";
import { toast } from "sonner";
import { downloadTrackVersion } from "@/lib/downloadTrack";

// Account → Licenses. Every track the customer may use, in one list:
// tracks covered by his subscription (a code minted per track when he downloaded
// it) and tracks he bought outright. Each row: audio, PDF certificate, and an
// "Edit certificate" button for the details printed on THAT licence only, so a
// video editor can put a different client on each one. "Default details" at the
// top are used for licences that have no details of their own.

const GOLD = "#F4C430";

interface LicenseRow {
  id: string;
  kind: "subscription" | "one-time";
  code: string;
  trackId: string;
  trackTitle: string;
  trackSlug?: string;
  cover?: string;
  tier: string;
  refunded: boolean;
  issuedAt: string;
  pdfHref: string;
}

interface CertDetails {
  firstName: string;
  lastName: string;
  company: string;
  vat: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  project: string;
}

const EMPTY: CertDetails = {
  firstName: "",
  lastName: "",
  company: "",
  vat: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postcode: "",
  country: "",
  project: "",
};

interface SavedClient {
  id: string;
  /** Custom display name; empty = show the company or the person. */
  name: string;
  details: CertDetails;
}

/** The name shown for a saved client: the company, else the person's name. */
const detailsLabel = (d: CertDetails) =>
  d.company || [d.firstName, d.lastName].filter(Boolean).join(" ") || "Unnamed client";
const clientLabel = (c: SavedClient) => c.name || detailsLabel(c.details);

/** A second line under the client name: the person (when a company is set) or the place. */
const clientSub = (c: SavedClient) => {
  const d = c.details;
  if (c.name) return detailsLabel(d);
  const person = [d.firstName, d.lastName].filter(Boolean).join(" ");
  if (d.company && person) return person;
  return [d.city, d.country].filter(Boolean).join(", ");
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#F4C430] focus:outline-none transition-[background-color,border-color] duration-500";
const labelCls =
  "font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

/** The "Edit PDF certificate" dialog — the details printed on the licence PDF. */
const CertDialog = ({
  email,
  initial,
  license,
  onClose,
  onSaved,
}: {
  email: string;
  initial: CertDetails;
  /** The licence being edited; null = the default details. */
  license: LicenseRow | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [d, setD] = useState<CertDetails>(initial);
  const [busy, setBusy] = useState(false);
  // Saved clients panel (left of the form). null = not loaded yet.
  const [showClients, setShowClients] = useState(false);
  const [clients, setClients] = useState<SavedClient[] | null>(null);
  const [clientBusy, setClientBusy] = useState(false);
  // Fill animation after picking a client: "hide" = text invisible for one
  // frame, "show" = text fades in with a gold glow, then back to normal.
  const [fill, setFill] = useState<"none" | "hide" | "show">("none");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/cert-clients", { credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as { clients?: SavedClient[] };
      setClients(body.clients ?? []);
    } catch {
      setClients([]);
    }
  }, []);

  const toggleClients = () => {
    const next = !showClients;
    setShowClients(next);
    if (next && clients === null) void loadClients();
  };

  // Fill the form from a client. The project name stays as typed: it belongs
  // to this licence, not to the client.
  const pickClient = (c: SavedClient) => {
    setFill("hide");
    requestAnimationFrame(() => {
      setD((prev) => ({ ...c.details, project: prev.project }));
      requestAnimationFrame(() => setFill("show"));
    });
    window.setTimeout(() => setFill("none"), 1100);
  };

  const startRename = (c: SavedClient) => {
    setRenaming(c.id);
    setRenameText(clientLabel(c));
  };

  const saveRename = async (c: SavedClient) => {
    const name = renameText.trim();
    setRenaming(null);
    if (name === clientLabel(c)) return;
    setClients((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, name } : x)));
    try {
      const res = await fetch("/api/cert-clients", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: c.id, name }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Could not rename client");
      void loadClients();
    }
  };

  // Input styling during the fill animation (fields the client filled only).
  const fillCls = (k: keyof CertDetails) => {
    if (fill === "none" || k === "project" || !d[k]) return inputCls;
    if (fill === "hide") return `${inputCls} text-transparent`;
    return `${inputCls} border-[#F4C430]/70 bg-[#F4C430]/[0.07] transition-[color,background-color,border-color] duration-700`;
  };

  const saveClient = async () => {
    setClientBusy(true);
    try {
      const res = await fetch("/api/cert-clients", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ details: d }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        updated?: boolean;
        clients?: SavedClient[];
        error?: string;
      };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not save client");
      setClients(body.clients ?? []);
      toast.success(body.updated ? "Client updated" : "Client saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save client");
    } finally {
      setClientBusy(false);
    }
  };

  const deleteClient = async (c: SavedClient) => {
    setClients((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    try {
      const res = await fetch(`/api/cert-clients?id=${encodeURIComponent(c.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Could not delete client");
      void loadClients();
    }
  };

  const set = (k: keyof CertDetails, v: string) => setD((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/cert-details", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...d,
          ...(license ? { license: license.code } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not save");
      toast.success(
        license ? "Saved. Download the certificate to get the updated file" : "Default details saved",
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="mt-10 flex w-full max-w-lg flex-col gap-3 md:w-auto md:max-w-none md:flex-row md:items-stretch">
      {showClients && (
        <aside className="flex w-full flex-col rounded-2xl border border-border bg-card shadow-2xl md:w-72">
          <div className="px-5 pb-2 pt-5">
            <span className={labelCls}>Saved clients</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-2">
            {clients === null && (
              <p className="px-2 py-3 font-body text-xs text-muted-foreground">Loading…</p>
            )}
            {clients?.length === 0 && (
              <p className="px-2 py-3 font-body text-xs leading-5 text-muted-foreground">
                No clients yet. Fill in the form and click "Save as client" to reuse these details
                on other licences.
              </p>
            )}
            {clients?.map((c) => (
              <div
                key={c.id}
                className="group flex items-center gap-0.5 rounded-lg transition-colors hover:bg-[#F4C430]/10"
              >
                {renaming === c.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRename(c);
                    }}
                  >
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => void saveRename(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      aria-label="Client name"
                      className={`${inputCls} py-1.5`}
                    />
                    <button
                      type="submit"
                      aria-label="Save name"
                      className="rounded p-1 text-[#F4C430]"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => pickClient(c)}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                      <span className="block truncate font-body text-sm font-medium text-foreground">
                        {clientLabel(c)}
                      </span>
                      {clientSub(c) && (
                        <span className="block truncate font-body text-xs text-muted-foreground">
                          {clientSub(c)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(c)}
                      aria-label={`Rename ${clientLabel(c)}`}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-[#F4C430] focus:opacity-100 group-hover:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteClient(c)}
                      aria-label={`Delete ${clientLabel(c)}`}
                      className="mr-1.5 rounded p-1 text-muted-foreground transition-colors hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <button
              type="button"
              disabled={clientBusy}
              onClick={() => void saveClient()}
              className="w-full rounded-lg border border-dashed border-border px-3 py-2 font-body text-xs font-medium text-foreground transition-colors hover:border-[#F4C430]/60 hover:text-[#F4C430] disabled:opacity-50"
            >
              {clientBusy ? "Saving…" : "+ Save as client"}
            </button>
          </div>
        </aside>
      )}
      <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-2xl md:w-[32rem]">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(244,196,48,0.12)" }}
          >
            <FileText className="h-5 w-5" style={{ color: GOLD }} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold text-foreground">
              {license ? "Edit PDF certificate" : "Default certificate details"}
            </h2>
            <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
              {license
                ? `The name, company or address printed on the certificate for "${license.trackTitle}". Other licences are not changed.`
                : "Printed on licences that have no details of their own. Certificates you already downloaded keep their details."}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>First name</span>
              <input value={d.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="First name" className={fillCls("firstName")} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Last name</span>
              <input value={d.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Last name" className={fillCls("lastName")} />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Email</span>
            <input value={email} readOnly className={`${inputCls} opacity-70`} />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Company (optional)</span>
              <input value={d.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" className={fillCls("company")} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>VAT ID (optional)</span>
              <input value={d.vat} onChange={(e) => set("vat", e.target.value)} placeholder="VAT" className={fillCls("vat")} />
            </label>
          </div>

          <div className="space-y-3">
            <span className={labelCls}>Address (optional)</span>
            <input value={d.address1} onChange={(e) => set("address1", e.target.value)} placeholder="Address line 1" className={fillCls("address1")} />
            <input value={d.address2} onChange={(e) => set("address2", e.target.value)} placeholder="Address line 2" className={fillCls("address2")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={d.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className={fillCls("city")} />
              <input value={d.region} onChange={(e) => set("region", e.target.value)} placeholder="State / Region" className={fillCls("region")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={d.postcode} onChange={(e) => set("postcode", e.target.value)} placeholder="ZIP / Postal code" className={fillCls("postcode")} />
              <input value={d.country} onChange={(e) => set("country", e.target.value)} placeholder="Country" className={fillCls("country")} />
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Project name (optional)</span>
            <input value={d.project} onChange={(e) => set("project", e.target.value)} placeholder="What this license is used for" className={fillCls("project")} />
            <span className="font-body text-[11px] text-muted-foreground/70">
              E.g. "Brand Campaign 2026". Shown in the PDF.
            </span>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={toggleClients}
            className={`mr-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 font-body text-xs font-medium transition-colors ${
              showClients
                ? "border-[#F4C430]/60 text-[#F4C430]"
                : "border-border text-foreground hover:border-[#F4C430]/60 hover:text-[#F4C430]"
            }`}
          >
            <Users className="h-3.5 w-3.5" /> Clients
          </button>
          <button
            type="button"
            onClick={onClose}
            className="font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg bg-[#F4C430] px-5 py-2.5 font-body text-sm font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

const Btn = ({
  children,
  onClick,
  href,
  loading,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
}) => {
  const cls =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-body text-xs font-medium text-foreground transition-colors hover:border-[#F4C430]/60 hover:text-[#F4C430] disabled:cursor-default disabled:opacity-60 disabled:hover:border-border disabled:hover:text-foreground";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={loading} className={cls}>
      {children}
    </button>
  );
};

const LicensesSection = () => {
  const [rows, setRows] = useState<LicenseRow[] | null>(null);
  const [details, setDetails] = useState<CertDetails>(EMPTY);
  const [email, setEmail] = useState("");
  // What the dialog edits: a licence, the defaults (null), or closed (undefined).
  const [editing, setEditing] = useState<LicenseRow | null | undefined>(undefined);
  const [editInitial, setEditInitial] = useState<CertDetails>(EMPTY);

  const openEditor = async (row: LicenseRow | null) => {
    if (!row) {
      setEditInitial(details);
      setEditing(null);
      return;
    }
    try {
      const res = await fetch(`/api/cert-details?license=${encodeURIComponent(row.code)}`, {
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { details?: CertDetails; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load");
      setEditInitial({ ...EMPTY, ...(body.details ?? {}) });
      setEditing(row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load");
    }
  };
  // Which download button is preparing its file (WAV bundles zip on the server,
  // so the icon spins until the download actually starts). Key = `${id}:${fmt}`.
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const doDownload = async (row: LicenseRow, format: "mp3" | "wav") => {
    if (!row.trackSlug) return;
    const key = `${row.id}:${format}`;
    setBusyKey(key);
    try {
      await downloadTrackVersion({
        slug: row.trackSlug,
        versionId: "main",
        src: "",
        title: row.trackTitle,
        label: "Main",
        format,
        ...(format === "mp3" ? { quality: 320 as const } : {}),
      });
    } finally {
      setBusyKey(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const [lic, cert] = await Promise.all([
        fetch("/api/licenses", { credentials: "include" }),
        fetch("/api/cert-details", { credentials: "include" }),
      ]);
      if (lic.ok) {
        const d = (await lic.json()) as { licenses?: LicenseRow[] };
        setRows(d.licenses ?? []);
      } else {
        setRows([]);
      }
      if (cert.ok) {
        const d = (await cert.json()) as { details?: CertDetails; email?: string };
        setDetails({ ...EMPTY, ...(d.details ?? {}) });
        setEmail(d.email ?? "");
      }
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rows) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border/40 bg-card/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {/* Same page title as every other account section (was font-display). */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Licenses</h1>
          <button
            type="button"
            onClick={() => void openEditor(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-body text-xs font-medium text-foreground transition-colors hover:border-[#F4C430]/60 hover:text-[#F4C430]"
          >
            <Pencil className="h-3.5 w-3.5" /> Default details
          </button>
        </div>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Tracks you've licensed. Download the audio and the PDF certificate for each one, and edit
          the details on any certificate to match your client.
        </p>
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center font-body text-sm text-muted-foreground">
          No licensed tracks yet. Every track you download on a paid plan, and every track you buy,
          appears here with its certificate.
        </div>
      )}

      {rows.map((row) => (
        <div
          key={row.id}
          className={`rounded-xl border border-border bg-card p-5 ${row.refunded ? "opacity-60" : ""}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-secondary">
                {row.cover ? (
                  <img src={row.cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Music2 className="h-5 w-5" style={{ color: GOLD }} />
                )}
              </span>
              <div className="min-w-0">
                {row.trackSlug ? (
                  <Link
                    to={`/track/${row.trackSlug}`}
                    className="block truncate font-body text-sm font-semibold text-foreground transition-colors hover:text-[#F4C430]"
                  >
                    {row.trackTitle}
                  </Link>
                ) : (
                  <p className="truncate font-body text-sm font-semibold text-foreground">
                    {row.trackTitle}
                  </p>
                )}
                <p className="truncate font-body text-xs text-muted-foreground">
                  Issued {fmtDate(row.issuedAt)} · #{row.code}
                  {row.refunded && <span className="ml-2 text-red-400">Refunded</span>}
                </p>
              </div>
            </div>

            {!row.refunded && (
              <button
                type="button"
                onClick={() => void openEditor(row)}
                className="inline-flex shrink-0 items-center gap-1.5 font-body text-xs text-muted-foreground transition-colors hover:text-[#F4C430]"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit PDF certificate
              </button>
            )}
          </div>

          {!row.refunded && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
              {row.trackSlug && (
                <>
                  <Btn loading={busyKey === `${row.id}:mp3`} onClick={() => void doDownload(row, "mp3")}>
                    {busyKey === `${row.id}:mp3` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}{" "}
                    MP3
                  </Btn>
                  <Btn loading={busyKey === `${row.id}:wav`} onClick={() => void doDownload(row, "wav")}>
                    {busyKey === `${row.id}:wav` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}{" "}
                    WAV
                  </Btn>
                </>
              )}
              <Btn href={row.pdfHref}>
                <FileText className="h-3.5 w-3.5" /> License
              </Btn>
            </div>
          )}
        </div>
      ))}

      {editing !== undefined && (
        <CertDialog
          key={editing ? editing.id : "default"}
          email={email}
          initial={editInitial}
          license={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
};

export default LicensesSection;
