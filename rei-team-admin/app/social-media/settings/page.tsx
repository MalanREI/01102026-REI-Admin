"use client";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { SettingsSection } from "@/src/components/social-media/settings/SettingsSection";
import { Card, Pill } from "@/src/components/ui";
import { getSocialPlatforms } from "@/src/lib/supabase/social-media-queries";
import type { SocialPlatform } from "@/src/lib/types/social-media";
import { PlatformCard } from "@/src/components/social-media/PlatformCard";
import { PlatformQuickLinks } from "@/src/components/social-media/PlatformQuickLinks";
import { ConnectionHealthSummary } from "@/src/components/social-media/ConnectionHealthSummary";
import {
  ALL_PLATFORMS,
  PLATFORM_CONFIGS,
} from "@/src/components/social-media/platform-config";

export default function SocialMediaSettingsPage() {
  const [contentTypeCount, setContentTypeCount] = useState<number | undefined>(undefined);
  const [brandVoiceCount, setBrandVoiceCount] = useState<number | undefined>(undefined);
  const [platformData, setPlatformData] = useState<Record<string, SocialPlatform>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/content-types?activeOnly=false")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setContentTypeCount(d.length))
      .catch(() => {});
    fetch("/api/brand-voices")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setBrandVoiceCount(d.length))
      .catch(() => {});
  }, []);

  const loadPlatforms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getSocialPlatforms();
      const map: Record<string, SocialPlatform> = {};
      for (const row of rows) {
        map[row.platform_name] = row;
      }
      setPlatformData(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platforms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlatforms();
  }, [loadPlatforms]);

  function handlePlatformUpdate(updated: SocialPlatform) {
    setPlatformData((prev) => ({
      ...prev,
      [updated.platform_name]: updated,
    }));
  }

  const allPlatforms = Object.values(platformData);

  return (
    <PageShell>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Social Media Settings</h1>
          <p className="text-sm text-slate-400 mt-1">Configure platforms, team members, brand voices, and content types.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SettingsSection
            title="Platform Connections"
            description="Connect Instagram, Facebook, LinkedIn, TikTok, YouTube, and Google Business Profile. Manage OAuth tokens."
            icon="🔗"
          />
          <SettingsSection
            title="Content Types"
            description="Manage post content types with default AI models and brand voices."
            href="/social-media/settings/content-types"
            count={contentTypeCount}
            countLabel="types"
            icon="📋"
          />
          <SettingsSection
            title="Brand Voices"
            description="Create and manage AI brand voice personalities with custom system prompts."
            href="/social-media/settings/brand-voices"
            count={brandVoiceCount}
            countLabel="voices"
            icon="🎙️"
          />
          <SettingsSection
            title="Team & Permissions"
            description="Invite team members, manage roles (Creator, Manager, Admin), and control permissions."
            icon="👥"
          />
          <SettingsSection
            title="Newsletter Sources"
            description="Configure RSS feeds and newsletter sources for AI content inspiration."
            icon="📰"
          />
        </div>
        {/* Connection health summary */}
        {!loading && !error && (
          <ConnectionHealthSummary
            platforms={allPlatforms}
            total={ALL_PLATFORMS.length}
          />
        )}

        {/* Quick links to connected platforms */}
        <Card title="Quick Launch">
          {loading ? (
            <div className="text-xs text-slate-500">Loading platforms…</div>
          ) : (
            <PlatformQuickLinks platforms={allPlatforms} />
          )}
        </Card>

        {/* Platform connection cards */}
        <Card title="Platform Connections">
          {loading ? (
            <div className="text-xs text-slate-500 py-4 text-center">
              Loading platform connections…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ALL_PLATFORMS.map((name) => (
                <PlatformCard
                  key={name}
                  platformName={name}
                  config={PLATFORM_CONFIGS[name]}
                  platform={platformData[name] ?? null}
                  onUpdate={handlePlatformUpdate}
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Team Management" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Invite team members (Creator, Manager, Admin roles)</li>
            <li>Manage permissions per role</li>
            <li>Deactivate or reassign members</li>
          </ul>
        </Card>

        <Card title="Brand Voices" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Edit default brand voices: Educational, Casual, Professional, Promotional, Storytelling</li>
            <li>Create custom brand voices with custom AI system prompts</li>
            <li>Set default voice per content type</li>
          </ul>
        </Card>

        <Card title="Content Types" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Manage system content types: Daily Tips, Newsletter, Mythbusters, Market Updates, etc.</li>
            <li>Create custom content types</li>
            <li>Assign default AI model per content type</li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
