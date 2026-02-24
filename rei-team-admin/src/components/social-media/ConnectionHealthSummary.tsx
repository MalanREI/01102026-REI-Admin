"use client";

import type { SocialPlatform } from "@/src/lib/types/social-media";

interface ConnectionHealthSummaryProps {
  platforms: SocialPlatform[];
  total: number;
}

function getTokenStatus(platform: SocialPlatform): "ok" | "expiring" {
  if (!platform.token_expires_at) return "ok";
  const expiresIn = new Date(platform.token_expires_at).getTime() - Date.now();
  return expiresIn < 7 * 24 * 60 * 60 * 1000 ? "expiring" : "ok";
}

export function ConnectionHealthSummary({
  platforms,
  total,
}: ConnectionHealthSummaryProps) {
  const connected = platforms.filter((p) => p.is_connected);
  const expiring = connected.filter((p) => getTokenStatus(p) === "expiring");
  const allHealthy = connected.length === total && expiring.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.06] bg-surface px-4 py-3">
      {/* Connected count */}
      <div className="flex items-center gap-2">
        <span
          className={[
            "w-2.5 h-2.5 rounded-full",
            connected.length === total ? "bg-emerald-400" : "bg-slate-500",
          ].join(" ")}
        />
        <span className="text-sm font-medium text-slate-200">
          {connected.length} of {total} connected
        </span>
      </div>

      <div className="h-4 w-px bg-white/[0.08]" />

      {/* Expiring tokens */}
      {expiring.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-sm text-yellow-400">
            {expiring.length} token{expiring.length !== 1 ? "s" : ""} expiring
            soon
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/40" />
          <span className="text-sm text-slate-400">No expiring tokens</span>
        </div>
      )}

      <div className="h-4 w-px bg-white/[0.08]" />

      {/* Overall health */}
      <div className="flex items-center gap-2">
        {allHealthy ? (
          <>
            <span aria-label="Healthy" className="text-emerald-400 text-sm">✓</span>
            <span className="text-sm text-emerald-400 font-medium">
              All systems healthy
            </span>
          </>
        ) : connected.length === 0 ? (
          <>
            <span aria-hidden="true" className="text-slate-500 text-sm">○</span>
            <span className="text-sm text-slate-500">No platforms connected</span>
          </>
        ) : (
          <>
            <span aria-label="Warning" className="text-yellow-400 text-sm">&#x26A0;</span>
            <span className="text-sm text-yellow-400">Attention needed</span>
          </>
        )}
      </div>
    </div>
  );
}
