"use client";

import { useState } from "react";
import { Modal, Button } from "@/src/components/ui";
import {
  createSocialPlatform,
  updateSocialPlatform,
} from "@/src/lib/supabase/social-media-queries";
import type { SocialPlatform, PlatformName } from "@/src/lib/types/social-media";
import type { PlatformConfig } from "./platform-config";

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
  onConnected,
}: ConnectPlatformModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      // Mock token expiry 60 days from now (Phase 2 will use real OAuth tokens)
      const mockTokenExpiry = new Date(
        Date.now() + 60 * 24 * 60 * 60 * 1000
      ).toISOString();

      if (existingPlatform) {
        const updated = await updateSocialPlatform(existingPlatform.id, {
          is_connected: true,
          access_token: `mock_access_token_${platform}`,
          token_expires_at: mockTokenExpiry,
        });
        onConnected(updated);
      } else {
        const created = await createSocialPlatform({
          platform_name: platform,
          account_name: `@rei_${platform}`,
          account_id: `mock_account_id_${platform}`,
          access_token: `mock_access_token_${platform}`,
          refresh_token: `mock_refresh_token_${platform}`,
          token_expires_at: mockTokenExpiry,
          is_connected: true,
          platform_url: config.defaultUrl,
          metadata: null,
          connected_by: null,
        });
        onConnected(created);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect platform"
      );
    } finally {
      setLoading(false);
    }
  }

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
            {loading ? "Connecting…" : `Authorize with ${config.name}`}
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
              OAuth authorization will be implemented in Phase 2. This saves a
              placeholder connection for now.
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

        <p className="text-xs text-slate-500">
          In Phase 2, this button will redirect you to {config.name}&apos;s
          official OAuth authorization page to grant the permissions listed
          above.
        </p>
      </div>
    </Modal>
  );
}
