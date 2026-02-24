"use client";
import { useState } from "react";
import { Button, Modal } from "@/src/components/ui";
import type { ContentType } from "@/src/lib/types/social-media";

export function BulkActions({
  selectedIds,
  onClear,
  onSubmitForApproval,
  onArchive,
  onDelete,
  onChangeContentType,
  contentTypes,
}: {
  selectedIds: Set<string>;
  onClear: () => void;
  onSubmitForApproval: (ids: string[]) => Promise<void>;
  onArchive: (ids: string[]) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  onChangeContentType: (ids: string[], contentTypeId: string) => Promise<void>;
  contentTypes: ContentType[];
}) {
  const [confirmAction, setConfirmAction] = useState<"archive" | "delete" | null>(null);
  const [changeTypeOpen, setChangeTypeOpen] = useState(false);
  const [selectedContentType, setSelectedContentType] = useState("");
  const [loading, setLoading] = useState(false);

  const count = selectedIds.size;
  if (count === 0) return null;

  const ids = Array.from(selectedIds);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (confirmAction === "archive") await onArchive(ids);
      else if (confirmAction === "delete") await onDelete(ids);
    } finally {
      setLoading(false);
      setConfirmAction(null);
      onClear();
    }
  };

  const handleChangeType = async () => {
    if (!selectedContentType) return;
    setLoading(true);
    try {
      await onChangeContentType(ids, selectedContentType);
    } finally {
      setLoading(false);
      setChangeTypeOpen(false);
      onClear();
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-elevated px-4 py-3">
        <span className="text-sm text-slate-300 font-medium">{count} selected</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-xs px-2 py-1"
            onClick={() => {
              setLoading(true);
              onSubmitForApproval(ids).finally(() => { setLoading(false); onClear(); });
            }}
            disabled={loading}
          >
            Submit for Approval
          </Button>
          <Button variant="ghost" className="text-xs px-2 py-1" onClick={() => setConfirmAction("archive")} disabled={loading}>
            Archive
          </Button>
          <Button variant="ghost" className="text-xs px-2 py-1 text-red-400 hover:text-red-300" onClick={() => setConfirmAction("delete")} disabled={loading}>
            Delete
          </Button>
          <Button variant="ghost" className="text-xs px-2 py-1" onClick={() => setChangeTypeOpen(true)} disabled={loading}>
            Change Type
          </Button>
        </div>
        <button onClick={onClear} className="ml-auto text-slate-500 hover:text-slate-300 text-sm">✕</button>
      </div>

      <Modal
        open={!!confirmAction}
        title={confirmAction === "delete" ? "Delete Posts?" : "Archive Posts?"}
        onClose={() => setConfirmAction(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              onClick={handleConfirm}
              disabled={loading}
              className={confirmAction === "delete" ? "bg-red-600 hover:bg-red-500" : ""}
            >
              {loading ? "Processing…" : confirmAction === "delete" ? "Delete" : "Archive"} {count} posts
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          {confirmAction === "delete"
            ? `Are you sure you want to permanently delete ${count} post${count !== 1 ? "s" : ""}? This cannot be undone.`
            : `Archive ${count} post${count !== 1 ? "s" : ""}? They will be hidden from the main library.`}
        </p>
      </Modal>

      <Modal
        open={changeTypeOpen}
        title="Change Content Type"
        onClose={() => setChangeTypeOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setChangeTypeOpen(false)}>Cancel</Button>
            <Button onClick={handleChangeType} disabled={loading || !selectedContentType}>
              {loading ? "Updating…" : "Update"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Select a new content type for {count} post{count !== 1 ? "s" : ""}.</p>
          <select
            value={selectedContentType}
            onChange={(e) => setSelectedContentType(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200"
          >
            <option value="">Select content type…</option>
            {contentTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>{ct.icon ? `${ct.icon} ` : ""}{ct.name}</option>
            ))}
          </select>
        </div>
      </Modal>
    </>
  );
}
