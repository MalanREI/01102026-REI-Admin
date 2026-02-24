"use client";

import type { SocialPlatform } from "@/src/lib/types/social-media";
import { PLATFORM_CONFIGS } from "./platform-config";

interface PlatformQuickLinksProps {
  platforms: SocialPlatform[];
}

export function PlatformQuickLinks({ platforms }: PlatformQuickLinksProps) {
  const connected = platforms.filter((p) => p.is_connected);

  if (connected.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic">
        No platforms connected yet — connect a platform to see quick-launch links here.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {connected.map((p) => {
        const cfg = PLATFORM_CONFIGS[p.platform_name];
        if (!cfg) return null;
        return (
          <a
            key={p.id}
            href={p.platform_url || cfg.defaultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              "bg-white/[0.03] hover:bg-white/[0.07]",
              cfg.borderColor,
              cfg.textColor,
            ].join(" ")}
          >
            <span className="text-sm">{cfg.icon}</span>
            {cfg.name}
            <span className="text-slate-500">↗</span>
          </a>
        );
      })}
    </div>
  );
}
