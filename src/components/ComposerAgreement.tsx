import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileSignature, Printer } from "lucide-react";
import { toast } from "sonner";
import AgreementText, { type SignedAgreement } from "@/components/AgreementText";
import { AGREEMENT_VERSION } from "@/content/composerAgreement";

// Account -> Composer -> Agreement: read the Composer Agreement, fill the
// Schedule, tick "I agree", sign. Uploads stay locked until the CURRENT
// version is signed (enforced server-side in upload-audio.ts / composer/tracks.ts).

interface AgreementState {
  version: string;
  signed: SignedAgreement | null;
  current: boolean;
  artistName: string | null;
  email: string | null;
}

let cache: AgreementState | null = null;
const listeners = new Set<() => void>();

const load = async (): Promise<AgreementState | null> => {
  try {
    const res = await fetch("/api/composer/agreement", { credentials: "include" });
    if (!res.ok) return null;
    cache = (await res.json()) as AgreementState;
    listeners.forEach((l) => l());
    return cache;
  } catch {
    return null;
  }
};

/** Signed status for the signed-in composer (shared, fetched once). */
export const useComposerAgreement = (enabled = true) => {
  const [state, setState] = useState<AgreementState | null>(cache);
  useEffect(() => {
    if (!enabled) return;
    const l = () => setState(cache);
    listeners.add(l);
    if (!cache) void load();
    return () => {
      listeners.delete(l);
    };
  }, [enabled]);
  return { state, reload: load };
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none transition-colors focus:border-[#F4C430]";

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    <div className="mt-1">{children}</div>
    {hint && <span className="mt-1 block font-body text-[11px] text-muted-foreground">{hint}</span>}
  </label>
);

const ComposerAgreement = () => {
  const { state, reload } = useComposerAgreement();
  const [form, setForm] = useState({
    legalName: "",
    address: "",
    country: "",
    pro: "",
    ipi: "",
    publisher: "",
    payout: "",
  });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = useCallback(
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    [],
  );

  // Re-signing a newer version: start from the previous answers.
  useEffect(() => {
    const s = state?.signed;
    if (s && !state?.current) {
      setForm({
        legalName: s.legalName,
        address: s.address,
        country: s.country,
        pro: s.pro ?? "",
        ipi: s.ipi ?? "",
        publisher: s.publisher ?? "",
        payout: s.payout,
      });
    }
  }, [state?.signed, state?.current]);

  const sign = async () => {
    if (!agree) {
      toast.error('Please tick "I have read and agree"');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/composer/agreement", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, agree: true }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Could not sign");
      toast.success("Agreement signed. You can upload now.");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />;
  }

  if (state.current && state.signed) {
    const s = state.signed;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm font-semibold text-foreground">Agreement signed</p>
            <p className="font-body text-xs text-muted-foreground">
              Version {s.version}, signed by {s.legalName} on{" "}
              {new Date(s.signedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
          </div>
          <Link
            to={`/agreement/${s.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-xs font-semibold text-foreground transition-colors hover:border-[#F4C430]/60 hover:text-[#F4C430]"
          >
            <Printer className="h-3.5 w-3.5" /> Open / save as PDF
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <AgreementText signed={s} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-[#F4C430]/40 bg-[#F4C430]/5 p-5">
        <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-[#F4C430]" />
        <p className="font-body text-sm text-foreground">
          {state.signed
            ? `The agreement was updated to version ${AGREEMENT_VERSION}. Please read it and sign again to keep uploading.`
            : "Please read the Composer Agreement and sign it below. Uploading opens as soon as it is signed."}
        </p>
      </div>

      <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-border bg-card p-6">
        <AgreementText />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-body text-base font-semibold text-foreground">Your details (Schedule)</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full legal name">
            <input className={inputCls} value={form.legalName} onChange={set("legalName")} />
          </Field>
          <Field label="Artist name" hint="Set by TV Music Store; ask us to change it.">
            <input className={`${inputCls} opacity-70`} value={state.artistName ?? ""} readOnly />
          </Field>
          <Field label="Address">
            <textarea className={`${inputCls} min-h-[4.5rem]`} value={form.address} onChange={set("address")} />
          </Field>
          <Field label="Country">
            <input className={inputCls} value={form.country} onChange={set("country")} />
          </Field>
          <Field label="PRO (optional)" hint="e.g. BMI, PRS, ASCAP">
            <input className={inputCls} value={form.pro} onChange={set("pro")} />
          </Field>
          <Field label="IPI/CAE number (optional)">
            <input className={inputCls} value={form.ipi} onChange={set("ipi")} />
          </Field>
          <Field label="Publisher (optional)" hint="Name, PRO and IPI, if you have one">
            <input className={inputCls} value={form.publisher} onChange={set("publisher")} />
          </Field>
          <Field label="Payout method" hint="PayPal email or bank details">
            <input className={inputCls} value={form.payout} onChange={set("payout")} />
          </Field>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3 font-body text-sm text-foreground">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#F4C430]"
          />
          <span>
            I have read and agree to the TV Music Store Composer Agreement (version {AGREEMENT_VERSION}), and I am
            signing it electronically as {state.email}.
          </span>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void sign()}
          className="mt-5 rounded-lg bg-[#F4C430] px-6 py-2.5 font-body text-sm font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
        >
          {busy ? "Signing…" : "Sign agreement"}
        </button>
      </div>
    </div>
  );
};

export default ComposerAgreement;
