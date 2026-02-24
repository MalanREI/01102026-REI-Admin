"use client";

export type ConnectionStatus = "connected" | "disconnected" | "expiring";

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        Connected
      </span>
    );
  }
  if (status === "expiring") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        Token Expiring
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="w-2 h-2 rounded-full bg-slate-600" />
      Not Connected
    </span>
  );
}
