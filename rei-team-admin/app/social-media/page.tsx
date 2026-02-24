import { PageShell } from "@/src/components/PageShell";
import { Card, Pill } from "@/src/components/ui";
import Link from "next/link";
import { SocialMediaDashboardOverview } from "@/src/components/social-media/SocialMediaDashboardOverview";

const SECTIONS = [
  {
    label: "Content Studio",
    href: "/social-media/content-studio" as const,
    icon: "✍️",
    description: "Generate and draft AI-powered social media content.",
  },
  {
    label: "Content Library",
    href: "/social-media/library" as const,
    icon: "📚",
    description: "Browse, filter, and manage all posts and drafts.",
  },
  {
    label: "Calendar",
    href: "/social-media/calendar" as const,
    icon: "📅",
    description: "View and manage your scheduled content pipeline.",
  },
  {
    label: "Analytics",
    href: "/social-media/analytics" as const,
    icon: "📊",
    description: "Track performance metrics across all platforms.",
  },
  {
    label: "Inbox",
    href: "/social-media/inbox" as const,
    icon: "💬",
    description: "Manage comments, DMs, mentions, and reviews.",
  },
  {
    label: "Settings",
    href: "/social-media/settings" as const,
    icon: "⚙️",
    description: "Configure platforms, team, brand voices, and content types.",
  },
];

export default function SocialMediaDashboard() {
  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Social Media Command Center</h1>
          <div className="text-sm text-slate-400 mt-1">
            Manage all your social media channels from one place — content creation, scheduling, analytics, and engagement.
          </div>
        </div>

        {/* Live platform overview — fetches from Supabase client-side */}
        <SocialMediaDashboardOverview />

        <Card title="Modules" right={<Pill>Coming soon</Pill>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors"
              >
                <span className="text-2xl">{section.icon}</span>
                <div>
                  <div className="text-sm font-medium text-slate-200">{section.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{section.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
