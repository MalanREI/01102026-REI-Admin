"use client";

import { useEffect, useState } from "react";
import { listEmailFolders } from "@/src/lib/supabase/workspace-queries";
import type { EmailFolder } from "@/src/lib/types/workspace";

const WELL_KNOWN_ORDER = ["inbox", "drafts", "sentitems", "archive", "deleteditems", "junkemail"];
const WELL_KNOWN_ICONS: Record<string, string> = {
  inbox: "📥",
  drafts: "📝",
  sentitems: "📤",
  archive: "📦",
  deleteditems: "🗑",
  junkemail: "⚠",
};
const WELL_KNOWN_LABELS: Record<string, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  sentitems: "Sent",
  archive: "Archive",
  deleteditems: "Deleted",
  junkemail: "Junk",
};

export function FolderList({
  accountId,
  selectedFolderId,
  onFolderSelect,
}: {
  accountId: string;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
}) {
  const [folders, setFolders] = useState<EmailFolder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEmailFolders(accountId)
      .then(setFolders)
      .catch(() => setFolders([]))
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) {
    return <div className="p-2 text-xs text-slate-500 italic">Loading folders…</div>;
  }

  // Split into well-known (ordered) and custom
  const wellKnown = WELL_KNOWN_ORDER
    .map((wk) => folders.find((f) => f.well_known_name === wk))
    .filter((f): f is EmailFolder => !!f);

  const customFolders = folders
    .filter((f) => !f.well_known_name && !f.parent_folder_id)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  const childFolders = folders.filter((f) => f.parent_folder_id);

  function renderFolder(folder: EmailFolder, indent = 0) {
    const icon = folder.well_known_name ? WELL_KNOWN_ICONS[folder.well_known_name] ?? "📁" : "📁";
    const label = folder.well_known_name ? WELL_KNOWN_LABELS[folder.well_known_name] ?? folder.display_name : folder.display_name;
    const fid = folder.well_known_name ?? folder.display_name;
    const isActive = selectedFolderId === fid;
    const children = childFolders.filter((cf) => cf.parent_folder_id === folder.id);

    return (
      <div key={folder.id}>
        <button
          type="button"
          onClick={() => onFolderSelect(isActive ? null : fid)}
          className={[
            "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
            isActive ? "bg-emerald-500/10 text-emerald-400" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
          ].join(" ")}
          style={{ paddingLeft: `${8 + indent * 16}px` }}
        >
          <span className="text-sm">{icon}</span>
          <span className="flex-1 truncate text-left">{label}</span>
          {folder.unread_count > 0 && (
            <span className={["text-[10px] font-semibold tabular-nums", isActive ? "text-emerald-400" : "text-slate-500"].join(" ")}>
              {folder.unread_count}
            </span>
          )}
        </button>
        {children.map((cf) => renderFolder(cf, indent + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {/* All mail option */}
      <button
        type="button"
        onClick={() => onFolderSelect(null)}
        className={[
          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
          selectedFolderId === null ? "bg-emerald-500/10 text-emerald-400" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
        ].join(" ")}
      >
        <span className="text-sm">📬</span>
        <span className="flex-1 text-left">All Mail</span>
      </button>

      {/* Well-known folders */}
      {wellKnown.map((f) => renderFolder(f))}

      {/* Custom folders */}
      {customFolders.length > 0 && (
        <>
          <div className="border-t border-white/[0.04] my-1.5" />
          {customFolders.map((f) => renderFolder(f))}
        </>
      )}
    </div>
  );
}
