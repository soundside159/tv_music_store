import { useEffect, useState } from "react";
import { mockPersonas } from "@/mocks";
import { setMockPersona, useMockPersona } from "@/hooks/useMockData";
import type { PersonaId } from "@/types/domain";

/**
 * Design-phase tool: preview the site as any user state.
 * Hidden by default; enable by visiting any page with ?dev=1
 * (persisted in localStorage), disable with ?dev=0.
 */
const DevPersonaSwitcher = () => {
  const persona = useMockPersona();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("dev");
    if (flag === "1") localStorage.setItem("tvms.dev", "1");
    if (flag === "0") localStorage.removeItem("tvms.dev");
    setEnabled(localStorage.getItem("tvms.dev") === "1");
  }, []);

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[60] rounded-lg border border-[#F4C430]/50 bg-card p-2 shadow-lg">
      <p className="px-1 pb-1 font-body text-[10px] uppercase tracking-wider text-muted-foreground">
        Preview as
      </p>
      <select
        value={persona.id}
        onChange={(e) => setMockPersona(e.target.value as PersonaId)}
        className="w-52 rounded-md border border-border bg-background px-2 py-1.5 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
      >
        {mockPersonas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default DevPersonaSwitcher;
