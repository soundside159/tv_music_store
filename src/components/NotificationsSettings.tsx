import { useEffect, useState } from "react";
import { toast } from "sonner";

// Account -> Notifications. The Marketing toggle is real (controls the newsletter
// subscription for this account); the "Other" toggles are stored locally as
// preferences (not yet wired to real emails — placeholders for now).

const PREFS_KEY = "tvms_notif_prefs_v1";

type OtherKey = "downloads" | "recommendations" | "notifications";

// Skeuomorphic on/off switch: dark grip knob that slides, with a glowing gold
// "ON" (or dim "OFF") label revealed on the opposite side.
const Toggle = ({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    disabled={disabled}
    onClick={onChange}
    className="relative inline-flex h-8 w-[4.5rem] shrink-0 items-center rounded-full border border-black/60 transition-all disabled:opacity-50"
    style={{
      background: "linear-gradient(180deg,#141517,#0b0c0e)",
      boxShadow: on
        ? "inset 0 1px 2px rgba(0,0,0,0.6), 0 0 16px -3px rgba(244,196,48,0.65)"
        : "inset 0 1px 3px rgba(0,0,0,0.75)",
    }}
  >
    <span
      className={`pointer-events-none absolute inset-0 flex items-center font-body text-[10px] font-bold tracking-[0.15em] ${
        on ? "justify-end pr-3" : "justify-start pl-3"
      }`}
    >
      <span
        style={
          on
            ? { color: "#F4C430", textShadow: "0 0 8px rgba(244,196,48,0.9)" }
            : { color: "rgba(255,255,255,0.32)" }
        }
      >
        {on ? "ON" : "OFF"}
      </span>
    </span>
    <span
      className={`absolute bottom-1 top-1 w-8 rounded-full transition-all duration-200 ${on ? "left-1" : "right-1"}`}
      style={{
        background: "linear-gradient(180deg,#3b3d42,#1e2023)",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.18), 0 2px 5px rgba(0,0,0,0.55)",
      }}
    >
      <span
        className="absolute inset-0 m-auto h-3 w-4 rounded"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.3) 0.8px, transparent 1px)",
          backgroundSize: "4px 4px",
        }}
      />
    </span>
  </button>
);

const Row = ({
  title,
  subtitle,
  on,
  onChange,
  disabled,
  divider,
}: {
  title: string;
  subtitle?: string;
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
  divider?: boolean;
}) => (
  <div className={`flex items-center justify-between gap-4 px-5 py-4 ${divider ? "border-t border-border/60" : ""}`}>
    <div className="min-w-0">
      <p className="font-body text-sm font-semibold text-foreground">{title}</p>
      {subtitle && <p className="mt-0.5 font-body text-xs text-muted-foreground">{subtitle}</p>}
    </div>
    <Toggle on={on} onChange={onChange} disabled={disabled} />
  </div>
);

const GroupHeader = ({ label }: { label: string }) => (
  <p className="flex items-center gap-2 border-b border-border/60 px-5 py-3 font-body text-sm font-semibold text-foreground">
    <span className="h-3 w-1 rounded-full" style={{ backgroundColor: "#F4C430" }} />
    {label}
  </p>
);

const loadOther = (): Record<OtherKey, boolean> => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { downloads: true, recommendations: true, notifications: true, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { downloads: true, recommendations: true, notifications: true };
};

const NotificationsSettings = () => {
  const [marketing, setMarketing] = useState<boolean | null>(null);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [other, setOther] = useState<Record<OtherKey, boolean>>(loadOther);

  useEffect(() => {
    fetch("/api/my-newsletter", { credentials: "include" })
      .then(async (r) => {
        const d = (await r.json()) as { subscribed?: boolean };
        setMarketing(!!d.subscribed);
      })
      .catch(() => setMarketing(false));
  }, []);

  const toggleMarketing = async () => {
    if (marketing === null || savingMarketing) return;
    const next = !marketing;
    setMarketing(next);
    setSavingMarketing(true);
    try {
      const r = await fetch("/api/my-newsletter", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscribed: next }),
      });
      if (!r.ok) throw new Error();
      toast.success(next ? "Subscribed to marketing emails" : "Unsubscribed from marketing emails");
    } catch {
      setMarketing(!next);
      toast.error("Could not update — try again");
    } finally {
      setSavingMarketing(false);
    }
  };

  const toggleOther = (key: OtherKey) => {
    setOther((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Notifications</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Choose what email notifications you want to receive
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <GroupHeader label="Marketing" />
        <Row
          title="Promotions & offers"
          subtitle="New releases, occasional offers and picks for your taste"
          on={marketing ?? false}
          onChange={() => void toggleMarketing()}
          disabled={marketing === null || savingMarketing}
        />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <GroupHeader label="Other" />
        <Row title="Downloads" subtitle="Receipts and license certificates for your downloads" on={other.downloads} onChange={() => toggleOther("downloads")} />
        <Row title="Recommendations" subtitle="Tracks picked for your taste" on={other.recommendations} onChange={() => toggleOther("recommendations")} divider />
        <Row title="Notifications" subtitle="Account and copyright-claim updates" on={other.notifications} onChange={() => toggleOther("notifications")} divider />
      </div>
    </div>
  );
};

export default NotificationsSettings;
