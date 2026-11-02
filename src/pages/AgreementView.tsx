import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import AgreementText, { type SignedAgreement } from "@/components/AgreementText";

// /agreement/:id - a signed Composer Agreement as a clean, printable page
// (the signer or an admin). "Save as PDF" = the browser's print dialog.

const AgreementView = () => {
  const { id = "" } = useParams();
  const [signed, setSigned] = useState<SignedAgreement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/composer/agreement?id=${encodeURIComponent(id)}`, { credentials: "include" })
      .then(async (res) => {
        const d = (await res.json()) as { signed?: SignedAgreement; error?: string };
        if (!res.ok || !d.signed) throw new Error(d.error ?? "Not found");
        setSigned(d.signed);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="mx-auto max-w-3xl px-6 py-10 print:max-w-none print:p-0">
        <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
          <img src="/images/icons/logo-header.png" alt="TV Music Store" className="h-8" />
          {signed && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4C430] px-4 py-2 font-body text-sm font-bold text-background"
            >
              <Printer className="h-4 w-4" /> Print / save as PDF
            </button>
          )}
        </div>
        {error && <p className="font-body text-sm text-red-400">{error}</p>}
        {!error && !signed && <p className="font-body text-sm text-muted-foreground">Loading…</p>}
        {signed && <AgreementText signed={signed} />}
      </div>
    </div>
  );
};

export default AgreementView;
