import { useEffect, useState } from "react";
import { toast } from "sonner";

// Account -> Notifications. The Marketing toggle is real (controls the newsletter
// subscription for this account); the "Other" toggles are stored locally as
// preferences (not yet wired to real emails — placeholders for now).

const PREFS_KEY = "tvms_notif_prefs_v1";

type OtherKey = "downloads" | "recommendations" | "notifications";

const Toggle = ({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
      on ? "bg-[#F4C430]" : "bg-secondary"
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform ${
        on ? "translate-x-6" : "translate-x-1"
      }`}
    />
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
  <p className="border-b border-border/60 px-5 py-3 font-body text-sm font-semibold text-foreground">{label}</p>
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
