import { useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { Check, GripVertical, ImageUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useMockData";
import { useTracks } from "@/hooks/useTracks";
import { refreshContent } from "@/hooks/useContent";
import {
  useAdminTrackContent,
  type AdminContentData,
  type AdminContentItem,
} from "@/components/AdminTrackPanel";

// Inline admin editing on the PUBLIC /playlists, /collections and detail pages:
// click the title/description to edit in place, hover the cover to upload or
// clear it, drag cards to reorder, rename/delete from a small bar, remove
// tracks straight off the track rows. Admins only; customers never see it.

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

/** upsert overwrites every field — always resend the item's current values. */
const upsertPayload = (
  kind: ContentKind,
  item: AdminContentItem,
  patch: Partial<Pick<AdminContentItem, "title" | "description" | "image">>,
) => ({
  action: upsertAction(kind),
  id: item.id,
  title: patch.title ?? item.title,
  description: patch.description ?? item.description ?? "",
  image: patch.image ?? item.image ?? "",
  ...(kind === "collection"
    ? { shortTitle: patch.title ?? item.shortTitle ?? item.title }
    : {}),
});

/** Refresh both the admin copy and the public pages after any change. */
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
// Drag & drop reorder for the list-page cards (native HTML5 DnD, no deps)
// ---------------------------------------------------------------------------

export const useAdminDragReorder = (kind: ContentKind, admin: ContentAdmin) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const items = itemsOf(admin.data, kind);

  const drop = async (targetId: string) => {
    const from = items.findIndex((x) => x.id === dragId);
    const to = items.findIndex((x) => x.id === targetId);
    setOverId(null);
    const moved = dragId;
    setDragId(null);
    if (!moved || from === -1 || to === -1 || from === to) return;
    const ids = items.map((x) => x.id);
    ids.splice(from, 1);
    ids.splice(to, 0, moved);
    const ok = await admin.run({ action: "reorder_content", kind, values: ids });
    if (ok) await afterChange(admin);
  };

  /** Spread over each card wrapper: makes it draggable + a drop target. */
  const dragProps = (id: string) => {
    if (!admin.enabled || !items.some((x) => x.id === id)) return {};
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (overId !== id) setOverId(id);
      },
      onDragLeave: () => {
        if (overId === id) setOverId(null);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        void drop(id);
      },
      onDragEnd: () => {
        setDragId(null);
        setOverId(null);
      },
    };
  };

  /** Visual classes for the card wrapper while dragging. */
  const dragClass = (id: string) =>
    dragId === id
      ? "opacity-40"
      : overId === id && dragId
        ? "rounded-xl ring-2 ring-[#F4C430]"
        : "";

  return { dragProps, dragClass, dragging: !!dragId };
};

// ---------------------------------------------------------------------------
// Per-card admin bar (list pages): drag grip, rename, delete
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
  const item = itemsOf(admin.data, kind).find((x) => x.id === id);
  if (!item) return null; // mock/legacy row — not editable

  const rename = async () => {
    const t = draft.trim();
    if (!t || t === item.title) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    const ok = await admin.run(upsertPayload(kind, item, { title: t }));
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
      <span title="Drag the card to reorder" className="cursor-grab text-muted-foreground/60">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
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
        <span className="ml-auto flex items-center gap-2.5">
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
// Detail pages: click-to-edit text + hover-to-change cover (no bulky form)
// ---------------------------------------------------------------------------

export const AdminEditableText = ({
  kind,
  id,
  admin,
  field,
  value,
  multiline = false,
  className = "",
  placeholder = "Click to add…",
}: {
  kind: ContentKind;
  id: string;
  admin: ContentAdmin;
  field: "title" | "description";
  value: string;
  multiline?: boolean;
  /** Applied to both the display span and the editor to keep the typography. */
  className?: string;
  placeholder?: string;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const item = itemsOf(admin.data, kind).find((x) => x.id === id);
  if (!admin.enabled || !item) return <>{value}</>;

  const save = async () => {
    setEditing(false);
    const t = draft.trim();
    if (t === value.trim() || (field === "title" && !t)) return;
    const ok = await admin.run(upsertPayload(kind, item, { [field]: t }));
    if (ok) {
      toast.success("Saved");
      await afterChange(admin);
    }
  };

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        title="Click to edit"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setDraft(value);
            setEditing(true);
          }
        }}
        className={`cursor-text rounded decoration-[#F4C430]/60 decoration-dashed underline-offset-4 transition-colors hover:underline ${className} ${
          value ? "" : "italic opacity-60"
        }`}
      >
        {value || placeholder}
      </span>
    );
  }

  const editorClass = `w-full rounded border border-[#F4C430]/60 bg-background/60 px-1 focus:outline-none ${className}`;
  return multiline ? (
    <textarea
      autoFocus
      value={draft}
      rows={3}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
      }}
      className={editorClass}
    />
  ) : (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === "Enter") void save();
        if (e.key === "Escape") setEditing(false);
      }}
      className={editorClass}
    />
  );
};

/** Wraps the cover image; on hover the admin gets Upload / Clear buttons. */
export const AdminCoverControl = ({
  kind,
  id,
  admin,
  children,
  className = "",
}: {
  kind: ContentKind;
  id: string;
  admin: ContentAdmin;
  children: ReactNode;
  className?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const item = itemsOf(admin.data, kind).find((x) => x.id === id);
  if (!admin.enabled || !item) return <>{children}</>;

  const setImage = async (image: string) => {
    const ok = await admin.run(upsertPayload(kind, item, { image }));
    if (ok) await afterChange(admin);
    return ok;
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/upload?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": file.type },
        body: file,
      });
      const d = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !d.path) {
        toast.error(d.error ?? "Upload failed");
        return;
      }
      if (await setImage(d.path)) toast.success("Cover updated");
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`group/cover relative ${className}`}>
      {children}
      <div
        className={`absolute inset-0 flex items-center justify-center gap-2 bg-background/70 transition-opacity ${
          busy ? "opacity-100" : "opacity-0 group-hover/cover:opacity-100"
        }`}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="Upload a new cover"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#F4C430]/60 bg-card text-[#F4C430] transition-colors hover:bg-[#F4C430] hover:text-background disabled:opacity-50"
        >
          <ImageUp className="h-4 w-4" />
        </button>
        {item.image && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Remove the cover image?")) void setImage("");
            }}
            title="Remove cover"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {busy && <span className="font-body text-[10px] text-muted-foreground">Uploading…</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Detail pages: small delete button + remove-track handler for the track rows
// ---------------------------------------------------------------------------

export const AdminDeleteItemButton = ({
  kind,
  id,
  admin,
  onDeleted,
}: {
  kind: ContentKind;
  id: string;
  admin: ContentAdmin;
  onDeleted: () => void;
}) => {
  const item = itemsOf(admin.data, kind).find((x) => x.id === id);
  if (!admin.enabled || !item) return null;

  const remove = async () => {
    if (!window.confirm(`Delete ${kind} "${item.title}"? Tracks themselves stay in the catalog.`)) return;
    const ok = await admin.run({
      action: kind === "collection" ? "delete_collection" : "delete_playlist",
      id: item.id,
    });
    if (ok) {
      refreshContent();
      void admin.reload();
      onDeleted();
    }
  };

  return (
    <button
      type="button"
      onClick={() => void remove()}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 px-3 py-1.5 font-body text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/10"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete {kind}
    </button>
  );
};

/**
 * Remove-track handler for the detail pages' track rows (the X on each row).
 * Returns null when not admin-editable, so pages can pass it straight to
 * TrackRowList's `adminRemove` prop. (Plain function, not a hook.)
 */
export const makeRemoveTrackHandler = (
  kind: ContentKind,
  id: string,
  admin: ContentAdmin,
  onTracksChanged?: () => void,
): ((trackId: string) => void) | null => {
  const item = itemsOf(admin.data, kind).find((x) => x.id === id);
  if (!admin.enabled || !item) return null;
  return (trackId: string) => {
    void (async () => {
      const ok = await admin.run({
        action: "set_tracks",
        id: item.id,
        kind,
        trackIds: item.trackIds.filter((x) => x !== trackId),
      });
      if (ok) {
        toast.success(`Removed from ${item.title}`);
        await afterChange(admin);
        onTracksChanged?.();
      }
    })();
  };
};
