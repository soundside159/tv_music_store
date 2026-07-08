import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { CatalogTrack } from "@/data/catalogTracks";
import { useCurrentUser } from "@/hooks/useMockData";
import { useTracks } from "@/hooks/useTracks";
import { refreshContent } from "@/hooks/useContent";
import {
  useAdminTrackContent,
  type AdminContentData,
  type AdminContentItem,
} from "@/components/AdminTrackPanel";

// Inline admin editing on the PUBLIC /playlists, /collections and detail pages:
// rename / delete / reorder items, create new ones, edit title/description/
// image and remove tracks — right where the owner is looking, without /admin.
// Rendered only for role=admin with a DB-backed catalog; customers never see it.

const GOLD = "#F4C430";

export type ContentKind = "collection" | "playlist";

export interface ContentAdmin {
  enabled: boolean;
  data: AdminContentData | null;
  run: (payload: Record<string, unknown>) => Promise<boolean>;
  reload: () => Promise<void> | void;
}

/** Admin gate + admin content data for the public content pages. */
export const useContentAdmin = (): ContentAdmin => {
  const user = useCurrentUser();
  const { source } = useTracks();
  const enabled = user?.role === "admin" && source === "api";
  const { data, run, reload } = useAdminTrackContent(enabled);
  return { enabled, data, run, reload };
};

const itemsOf = (data: AdminContentData | null, kind: ContentKind): AdminContentItem[] =>
  !data ? [] : kind === "collection" ? data.collections : data.playlists;

const upsertAction = (kind: ContentKind) =>
  kind === "collection" ? "upsert_collection" : "upsert_playlist";

/** Save order + tell the admin copy AND the public pages to refetch. */
const afterChange = async (admin: ContentAdmin) => {
  await admin.reload();
  refreshContent();
};

// ---------------------------------------------------------------------------
// "+ Add" button with a small inline title form (list pages, next to heading)
// ---------------------------------------------------------------------------

export const AdminAddItem = ({ kind, admin }: { kind: ContentKind; admin: ContentAdmin }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  if (!admin.enabled) return null;

  const create = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    const ok = await admin.run({ action: upsertAction(kind), title: t });
    setBusy(false);
    if (ok) {
      toast.success(`${kind === "collection" ? "Collection" : "Playlist"} created`);
      setTitle("");
      setOpen(false);
      await afterChange(admin);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#F4C430]/50 px-3 py-1.5 font-body text-xs font-semibold text-[#F4C430] transition-colors hover:bg-[#F4C430]/10"
      >
        <Plus className="h-3.5 w-3.5" />
        Add {kind}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void create();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={`New ${kind} title`}
        className="w-48 rounded-lg border border-border bg-background px-2.5 py-1.5 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        aria-label="Create"
        className="text-[#F4C430] transition-colors hover:opacity-80 disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Cancel"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Per-card admin bar (list pages): move up/down, rename, delete
// ---------------------------------------------------------------------------

export const AdminItemBar = ({
  kind,
  id,
  admin,
}: {
  kind: ContentKind;
  id: string;
  admin: ContentAdmin;
}) => {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (!admin.enabled || !admin.data) return null;
  const items = itemsOf(admin.data, kind);
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return null; // mock/legacy row — not editable
  const item = items[idx];

  const move = async (dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((x) => x.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    setBusy(true);
    const ok = await admin.run({ action: "reorder_content", kind, values: ids });
    setBusy(false);
    if (ok) await afterChange(admin);
  };

  const rename = async () => {
    const t = draft.trim();
    if (!t || t === item.title) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    const ok = await admin.run({
      action: upsertAction(kind),
      id: item.id,
      title: t,
      // upsert overwrites every field — resend the current values.
      description: item.description ?? "",
      image: item.image ?? "",
      ...(kind === "collection" ? { shortTitle: t } : {}),
    });
    setBusy(false);
    setRenaming(false);
    if (ok) {
      toast.success("Renamed");
      await afterChange(admin);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${kind} "${item.title}"? Tracks themselves stay in the catalog.`)) return;
    setBusy(true);
    const ok = await admin.run({
      action: kind === "collection" ? "delete_collection" : "delete_playlist",
      id: item.id,
    });
    setBusy(false);
    if (ok) {
      toast.success("Deleted");
      await afterChange(admin);
    }
  };

  return (
    <div
      className={`mt-1 flex items-center gap-2 rounded-lg border border-[#F4C430]/25 bg-card/60 px-2 py-1.5 ${
        busy ? "opacity-50" : ""
      }`}
    >
      <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
        Admin
      </span>
      {renaming ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void rename();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
          />
          <button type="button" onClick={() => void rename()} aria-label="Save name" className="text-[#F4C430]">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            aria-label="Cancel"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void move(-1)}
            disabled={idx === 0 || busy}
            aria-label="Move left/up"
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void move(1)}
            disabled={idx === items.length - 1 || busy}
            aria-label="Move right/down"
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(item.title);
              setRenaming(true);
            }}
            aria-label="Rename"
            className="text-muted-foreground transition-colors hover:text-[#F4C430]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            aria-label="Delete"
            className="text-muted-foreground transition-colors hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Detail-page editor: title / description / image + delete + remove tracks
// ---------------------------------------------------------------------------

export const AdminItemEditor = ({
  kind,
  id,
  admin,
  tracks,
  backTo,
  onTracksChanged,
}: {
  kind: ContentKind;
  id: string;
  admin: ContentAdmin;
  /** Full catalog — used for track titles in the remove list. */
  tracks: CatalogTrack[];
  /** Where to go after deleting the whole item (e.g. "/playlists"). */
  backTo: string;
  /** Extra refetch after membership changes (CollectionDetail needs /api/tracks). */
  onTracksChanged?: () => void;
}) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingTrack, setPendingTrack] = useState<string | null>(null);

  const item = itemsOf(admin.data, kind).find((x) => x.id === id) ?? null;

  // Prefill the form whenever the admin copy (re)loads.
  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDescription(item.description ?? "");
    setImage(item.image ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.title, item?.description, item?.image]);

  if (!admin.enabled || !item) return null;

  const save = async () => {
    const t = title.trim();
    if (!t) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    const ok = await admin.run({
      action: upsertAction(kind),
      id: item.id,
      title: t,
      description,
      image,
      ...(kind === "collection" ? { shortTitle: t } : {}),
    });
    setBusy(false);
    if (ok) {
      toast.success("Saved");
      await afterChange(admin);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${kind} "${item.title}"? Tracks themselves stay in the catalog.`)) return;
    setBusy(true);
    const ok = await admin.run({
      action: kind === "collection" ? "delete_collection" : "delete_playlist",
      id: item.id,
    });
    setBusy(false);
    if (ok) {
      refreshContent();
      void admin.reload();
      navigate(backTo);
    }
  };

  const removeTrack = async (trackId: string) => {
    setPendingTrack(trackId);
    const ok = await admin.run({
      action: "set_tracks",
      id: item.id,
      kind,
      trackIds: item.trackIds.filter((x) => x !== trackId),
    });
    setPendingTrack(null);
    if (ok) {
      await afterChange(admin);
      onTracksChanged?.();
    }
  };

  const titleOf = (trackId: string) => tracks.find((t) => t.id === trackId)?.title ?? trackId;

  return (
    <div className="mt-6 rounded-xl border border-[#F4C430]/30 bg-card p-4">
      <p className="mb-3 font-body text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: GOLD }}>
        Admin — edit this {kind}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground focus:border-[#F4C430] focus:outline-none"
          />
          <input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="Cover image URL (/api/file/covers/... or /images/...)"
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            rows={3}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-xs text-foreground focus:border-[#F4C430] focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-lg bg-[#F4C430] px-4 py-2 font-body text-xs font-bold text-background transition-colors hover:bg-[#F4C430]/85 disabled:opacity-50"
            >
              Save changes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 px-3 py-2 font-body text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {kind}
            </button>
          </div>
        </div>

        <div>
          <p className="font-body text-xs font-semibold text-foreground">
            Tracks in this {kind} ({item.trackIds.length})
          </p>
          <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
            {item.trackIds.length === 0 && (
              <p className="font-body text-xs text-muted-foreground">
                Empty — add tracks from their track pages or Admin → Tracks.
              </p>
            )}
            {item.trackIds.map((trackId, i) => (
              <div
                key={trackId}
                className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-white/5"
              >
                <span className="w-5 shrink-0 font-body text-[10px] text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-body text-xs text-foreground">
                  {titleOf(trackId)}
                </span>
                <button
                  type="button"
                  disabled={pendingTrack === trackId}
                  onClick={() => void removeTrack(trackId)}
                  aria-label={`Remove ${titleOf(trackId)}`}
                  title="Remove from this list"
                  className="text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
