import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Music2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { downloadTrackVersion } from "@/lib/downloadTrack";

// Account → Licenses. Every track the customer may use, in one list:
// tracks covered by his subscription (a code minted per track when he downloaded
// it) and tracks he bought outright. Each row: audio, PDF certificate, and an
// Edit button for the details PRINTED on that certificate.

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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#F4C430] focus:outline-none";
const labelCls =
  "font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

/** The "Edit PDF certificate" dialog — the details printed on the licence PDF. */
const CertDialog = ({
  email,
  initial,
  onClose,
  onSaved,
}: {
  email: string;
  initial: CertDetails;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [d, setD] = useState<CertDetails>(initial);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof CertDetails, v: string) => setD((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/cert-details", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(d),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not save");
      toast.success("Saved — re-download a certificate to get the updated file");
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
      <div className="mt-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(244,196,48,0.12)" }}
          >
            <FileText className="h-5 w-5" style={{ color: GOLD }} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Edit PDF certificate
            </h2>
            <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
              The name, company or address printed on your licence PDFs. Changes apply immediately —
              re-download a certificate to get the updated file.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>First name</span>
              <input value={d.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="First name" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Last name</span>
              <input value={d.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Last name" className={inputCls} />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Email</span>
            <input value={email} readOnly className={`${inputCls} opacity-70`} />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Company (optional)</span>
              <input value={d.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>VAT ID (optional)</span>
              <input value={d.vat} onChange={(e) => set("vat", e.target.value)} placeholder="VAT" className={inputCls} />
            </label>
          </div>

          <div className="space-y-3">
            <span className={labelCls}>Address (optional)</span>
            <input value={d.address1} onChange={(e) => set("address1", e.target.value)} placeholder="Address line 1" className={inputCls} />
            <input value={d.address2} onChange={(e) => set("address2", e.target.value)} placeholder="Address line 2" className={inputCls} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={d.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className={inputCls} />
              <input value={d.region} onChange={(e) => set("region", e.target.value)} placeholder="State / Region" className={inputCls} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={d.postcode} onChange={(e) => set("postcode", e.target.value)} placeholder="ZIP / Postal code" className={inputCls} />
              <input value={d.country} onChange={(e) => set("country", e.target.value)} placeholder="Country" className={inputCls} />
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Project name (optional)</span>
            <input value={d.project} onChange={(e) => set("project", e.target.value)} placeholder="What this license is used for" className={inputCls} />
            <span className="font-body text-[11px] text-muted-foreground/70">
              E.g. "Brand Campaign 2026". Shown in the PDF.
            </span>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
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
  );
};

const Btn = ({
  children,
  onClick,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) => {
  const cls =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-body text-xs font-medium text-foreground transition-colors hover:border-[#F4C430]/60 hover:text-[#F4C430]";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
};

const LicensesSection = () => {
  const [rows, setRows] = useState<LicenseRow[] | null>(null);
  const [details, setDetails] = useState<CertDetails>(EMPTY);
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);

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
        <h1 className="font-display text-2xl font-semibold text-foreground">Licenses</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Tracks you've licensed — download the audio and the PDF certificate for each one.
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
                <p className="truncate font-body text-sm font-semibold text-foreground">
                  {row.trackTitle}
                </p>
                <p className="truncate font-body text-xs text-muted-foreground">
                  Issued {fmtDate(row.issuedAt)} · #{row.code}
                  {row.refunded && <span className="ml-2 text-red-400">Refunded</span>}
                </p>
              </div>
            </div>

            {!row.refunded && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex shrink-0 items-center gap-1.5 font-body text-xs text-muted-foreground transition-colors hover:text-[#F4C430]"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
          </div>

          {!row.refunded && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
              {row.trackSlug && (
                <>
                  <Btn
                    onClick={() =>
                      void downloadTrackVersion({
                        slug: row.trackSlug!,
                        versionId: "main",
                        src: "",
                        title: row.trackTitle,
                        label: "Main",
                        format: "mp3",
                        quality: 320,
                      })
                    }
                  >
                    <Download className="h-3.5 w-3.5" /> MP3
                  </Btn>
                  <Btn
                    onClick={() =>
                      void downloadTrackVersion({
                        slug: row.trackSlug!,
                        versionId: "main",
                        src: "",
                        title: row.trackTitle,
                        label: "Main",
                        format: "wav",
                      })
                    }
                  >
                    <Download className="h-3.5 w-3.5" /> WAV
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

      {editing && (
        <CertDialog
          email={email}
          initial={details}
          onClose={() => setEditing(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
};

export default LicensesSection;
