"use client";

import { useState } from "react";
import { Modal, Button } from "@/src/components/ui";
import type { SocialPlatform, PlatformName } from "@/src/lib/types/social-media";
import type { PlatformConfig } from "./platform-config";

// Platforms that have real OAuth configured; all others use mock flow.
const OAUTH_SUPPORTED: PlatformName[] = ['facebook', 'instagram', 'linkedin', 'google_business'];

interface ConnectPlatformModalProps {
  open: boolean;
  onClose: () => void;
  platform: PlatformName;
  config: PlatformConfig;
  existingPlatform?: SocialPlatform | null;
  onConnected: (platform: SocialPlatform) => void;
}

export function ConnectPlatformModal({
  open,
  onClose,
  platform,
  config,
  existingPlatform,
}: ConnectPlatformModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOAuth = OAUTH_SUPPORTED.includes(platform);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      if (hasOAuth) {
        // Redirect user to the platform's OAuth authorization flow.
        // The callback at /api/auth/social/[platform] will handle token exchange
        // and update the social_platforms record, then redirect back to settings.
        window.location.href = `/api/auth/social/${platform}?action=authorize`;
      } else {
        // Platform not yet OAuth-enabled; inform the user.
        setError(`${config.name} OAuth integration is not yet configured. Add the required environment variables and try again.`);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate authorization");
      setLoading(false);
    }
  }

  // Show reconnect label when a connection already exists
  const buttonLabel = loading
    ? "Redirecting…"
    : existingPlatform?.is_connected
    ? `Reconnect ${config.name}`
    : `Authorize with ${config.name}`;

  return (
    <Modal
      open={open}
      title={`Connect ${config.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={loading}>
            {buttonLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{config.icon}</span>
          <div>
            <div className="text-sm font-medium text-slate-200">
              Connect your {config.name} account
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {hasOAuth
                ? `You will be redirected to ${config.name} to grant access.`
                : `${config.name} integration coming soon.`}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
              Permissions Required
            </div>
            <ul className="space-y-1.5">
              {config.permissions.map((perm) => (
                <li
                  key={perm}
                  className="flex items-start gap-2 text-xs text-slate-400"
                >
                  <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                  {perm}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-white/[0.06] pt-4">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
              This Integration Enables
            </div>
            <ul className="space-y-1.5">
              {config.enables.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-xs text-slate-400"
                >
                  <span className="text-blue-400 mt-0.5 shrink-0">→</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {hasOAuth && (
          <p className="text-xs text-slate-500">
            After authorizing, you will be redirected back to this page with your{" "}
            {config.name} account connected.
          </p>
        )}
      </div>
    </Modal>
  );
}
