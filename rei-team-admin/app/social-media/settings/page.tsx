"use client";
import { useEffect, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { SettingsSection } from "@/src/components/social-media/settings/SettingsSection";

export default function SocialMediaSettingsPage() {
  const [contentTypeCount, setContentTypeCount] = useState<number | undefined>(undefined);
  const [brandVoiceCount, setBrandVoiceCount] = useState<number | undefined>(undefined);

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
      </div>
    </PageShell>
  );
}
