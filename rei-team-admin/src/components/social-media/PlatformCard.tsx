"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui";
import { updateSocialPlatform } from "@/src/lib/supabase/social-media-queries";
import type { SocialPlatform, PlatformName } from "@/src/lib/types/social-media";
import {
  ConnectionStatusBadge,
  type ConnectionStatus,
} from "./ConnectionStatusBadge";
import { ConnectPlatformModal } from "./ConnectPlatformModal";
import type { PlatformConfig } from "./platform-config";

interface PlatformCardProps {
  platformName: PlatformName;
  config: PlatformConfig;
  platform: SocialPlatform | null;
  onUpdate: (updated: SocialPlatform) => void;
}

function getConnectionStatus(platform: SocialPlatform | null): ConnectionStatus {
  if (!platform || !platform.is_connected) return "disconnected";
  if (platform.token_expires_at) {
    const expiresIn =
      new Date(platform.token_expires_at).getTime() - Date.now();
    if (expiresIn < 7 * 24 * 60 * 60 * 1000) return "expiring";
  }
  return "connected";
}

function formatLastSynced(updatedAt: string): string {
  const diff = Date.now() - new Date(updatedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PlatformCard({
  platformName,
  config,
  platform,
  onUpdate,
}: PlatformCardProps) {
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const status = getConnectionStatus(platform);
  const isConnected = status === "connected" || status === "expiring";
  const launchUrl = platform?.platform_url || config.defaultUrl;

  async function handleDisconnect() {
    if (!platform) return;
    setDisconnecting(true);
    try {
      const updated = await updateSocialPlatform(platform.id, {
        is_connected: false,
        access_token: "",
        refresh_token: null,
        token_expires_at: null,
      });
      onUpdate(updated);
    } catch {
      // ignore disconnect errors — user can retry
    } finally {
      setDisconnecting(false);
    }
  }

  const tokenExpiresAt = platform?.token_expires_at
    ? new Date(platform.token_expires_at)
    : null;
  const daysUntilExpiry = tokenExpiresAt
    ? Math.ceil(
        (tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <>
      <div
        className={[
          "rounded-2xl border bg-surface overflow-hidden flex flex-col",
          config.borderColor,
        ].join(" ")}
      >
        {/* Color accent bar */}
        <div className={`h-1 bg-gradient-to-r ${config.gradient}`} />

        <div className="p-4 flex flex-col gap-3 flex-1">
          {/* Header row: icon + name + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={[
                  "w-10 h-10 flex items-center justify-center rounded-xl text-xl shrink-0",
                  config.iconBg,
                ].join(" ")}
              >
                {config.icon}
              </span>
              <div>
                <div
                  className={[
                    "text-sm font-semibold",
                    config.textColor,
                  ].join(" ")}
                >
                  {config.name}
                </div>
                {platform?.account_name && isConnected ? (
                  <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[140px]">
                    {platform.account_name}
                  </div>
                ) : null}
              </div>
            </div>
            <ConnectionStatusBadge status={status} />
          </div>

          {/* Token expiry warning */}
          {status === "expiring" && daysUntilExpiry !== null && (
            <div
              role="alert"
              className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400"
            >
              <span aria-label="Warning">&#x26A0;</span> Token expires in{" "}
              {daysUntilExpiry} day{daysUntilExpiry !== 1 ? "s" : ""} — reconnect soon.
            </div>
          )}

          {/* Last synced */}
          {platform && isConnected && (
            <div className="text-xs text-slate-500">
              Last synced: {formatLastSynced(platform.updated_at)}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-auto pt-1">
            {isConnected ? (
              <>
                <a
                  href={launchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center rounded-lg px-3 py-2 text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] transition-colors"
                >
                  Open ↗
                </a>
                <Button
                  variant="ghost"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex-1 text-xs text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setConnectModalOpen(true)}
                className="w-full text-xs"
              >
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConnectPlatformModal
        open={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        platform={platformName}
        config={config}
        existingPlatform={platform}
        onConnected={onUpdate}
      />
    </>
  );
}
