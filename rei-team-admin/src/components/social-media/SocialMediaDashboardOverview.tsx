"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/src/components/ui";
import { getSocialPlatforms } from "@/src/lib/supabase/social-media-queries";
import type { SocialPlatform } from "@/src/lib/types/social-media";
import { ConnectionHealthSummary } from "./ConnectionHealthSummary";
import { PlatformQuickLinks } from "./PlatformQuickLinks";
import { ALL_PLATFORMS } from "./platform-config";

export function SocialMediaDashboardOverview() {
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlatforms = useCallback(async () => {
    try {
      const rows = await getSocialPlatforms();
      setPlatforms(rows);
    } catch {
      // silently ignore — dashboard should not break on fetch error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlatforms();
  }, [loadPlatforms]);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-surface px-4 py-3 text-xs text-slate-500">
        Loading platform connections…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ConnectionHealthSummary
        platforms={platforms}
        total={ALL_PLATFORMS.length}
      />

      <Card
        title="Connected Platforms"
        right={
          <Link
            href="/social-media/settings"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Manage →
          </Link>
        }
      >
        <PlatformQuickLinks platforms={platforms} />
      </Card>
    </div>
  );
}
