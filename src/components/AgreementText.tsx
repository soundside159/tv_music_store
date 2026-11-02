import { Fragment, type ReactNode } from "react";
import { AGREEMENT_MD, AGREEMENT_TITLE, AGREEMENT_VERSION } from "@/content/composerAgreement";

// Renders the Composer Agreement (src/content/composerAgreement.ts) plus,
// when given a signed record, its filled Schedule and signature block.
// Tiny markdown subset: ## headings, **bold**, "- " and "1. " lists, pipe tables.

export interface SignedAgreement {
  id: string;
  version: string;
  legalName: string;
  artistName: string | null;
  address: string;
  country: string;
  email: string | null;
  categories: string | null;
  pro: string | null;
  ipi: string | null;
  publisher: string | null;
  payout: string;
  signedAt: string;
}

const inline = (text: string): ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground print:text-black">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );

const Body = () => {
  const blocks = AGREEMENT_MD.split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} className="mt-8 font-body text-lg font-semibold text-foreground print:text-black">
              {block.slice(3)}
            </h2>
          );
        }
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="mt-3 list-disc space-y-1.5 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\.\s/.test(l))) {
          return (
            <ol key={i} className="mt-3 list-decimal space-y-1.5 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\.\s/, ""))}</li>
              ))}
            </ol>
          );
        }
        if (lines[0].startsWith("|")) {
          const rows = lines
            .filter((l) => !/^\|\s*-/.test(l))
            .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
          const [head, ...rest] = rows;
          return (
            <table key={i} className="mt-3 w-full border-collapse text-left">
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j} className="border-b border-border py-1.5 pr-4 font-semibold print:border-black">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rest.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k} className="border-b border-border/50 py-1.5 pr-4 print:border-gray-400">
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        return (
          <p key={i} className="mt-3">
            {inline(block)}
          </p>
        );
      })}
    </>
  );
};

const fmtSigned = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

const AgreementText = ({ signed }: { signed?: SignedAgreement | null }) => (
  <div className="font-body text-sm leading-relaxed text-muted-foreground print:text-black">
    <h1 className="font-body text-2xl font-semibold text-foreground print:text-black">{AGREEMENT_TITLE}</h1>
    <p className="mt-1 text-xs">Version {signed?.version ?? AGREEMENT_VERSION}</p>
    <Body />
    {signed && (
      <>
        <h2 className="mt-8 font-body text-lg font-semibold text-foreground print:text-black">
          Schedule: Composer details
        </h2>
        <table className="mt-3 w-full border-collapse text-left">
          <tbody>
            {[
              ["Legal name", signed.legalName],
              ["Artist name (shown on the site)", signed.artistName ?? ""],
              ["Address", signed.address],
              ["Country", signed.country],
              ["Email", signed.email ?? ""],
              ["PRO", signed.pro ?? "None"],
              ["IPI/CAE number", signed.ipi ?? "None"],
              ["Publisher", signed.publisher ?? "None"],
              ["Bank details for payouts", signed.payout],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="w-1/3 border-b border-border/50 py-1.5 pr-4 font-semibold print:border-gray-400">{k}</td>
                <td className="border-b border-border/50 py-1.5 print:border-gray-400">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="mt-8 font-body text-lg font-semibold text-foreground print:text-black">Signatures</h2>
        <p className="mt-3">
          <strong className="text-foreground print:text-black">Composer:</strong> {signed.legalName}, signed
          electronically on tvmusicstore.com on {fmtSigned(signed.signedAt)} by ticking "I agree" while signed in as{" "}
          {signed.email}. Record ID: {signed.id}.
        </p>
        <p className="mt-3">
          <strong className="text-foreground print:text-black">For TV Music Store:</strong> Stanislav Barantsov,
          partner. Offered and accepted electronically through tvmusicstore.com.
        </p>
      </>
    )}
  </div>
);

export default AgreementText;
