"use client";

import { Pill } from "@/src/components/ui";
import { getMissingScopes } from "@/src/lib/auth/outlook-scopes";
import type { ConnectedAccount } from "@/src/lib/types/workspace";

export function ReconnectBanner({ workspace }: { workspace: ConnectedAccount }) {
  const missingScopes = getMissingScopes(workspace.scopes);
  if (missingScopes.length === 0) return null;

  const backfillDays = workspace.backfill_days || 90;

  return (
    <div className="flex items-start gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <span className="text-lg shrink-0 mt-0.5">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-300">Additional permissions needed</p>
        <p className="text-xs text-slate-400 mt-1">
          This workspace needs new permissions to enable Compose, Reply, and Calendar features.
          Reconnect to grant access — you'll see a Microsoft consent screen listing the new permissions.
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          {missingScopes.map((scope) => (
            <Pill key={scope}>{scope}</Pill>
          ))}
        </div>
      </div>
      <a
        href={`/api/auth/outlook/start?backfill_days=${backfillDays}`}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 transition-colors"
      >
        Reconnect Outlook
      </a>
    </div>
  );
}
