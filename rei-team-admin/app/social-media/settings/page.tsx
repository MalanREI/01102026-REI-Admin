import { PageShell } from "@/src/components/PageShell";
import { Card, Pill } from "@/src/components/ui";

export default function SocialMediaSettingsPage() {
  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Social Media Settings</h1>
          <div className="text-sm text-slate-400 mt-1">
            Configure platforms, team members, brand voices, and content types.
          </div>
        </div>

        <Card title="Platform Connections" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Connect Instagram, Facebook, LinkedIn, TikTok, YouTube, Google Business Profile</li>
            <li>OAuth token management and refresh</li>
            <li>Platform-specific posting settings</li>
          </ul>
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
