import { PageShell } from "@/src/components/PageShell";
import { Card, Pill } from "@/src/components/ui";

export default function SocialMediaInboxPage() {
  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Engagement Inbox</h1>
          <div className="text-sm text-slate-400 mt-1">
            Manage comments, DMs, mentions, and reviews from all platforms.
          </div>
        </div>

        <Card title="Status" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Unified inbox across Instagram, Facebook, LinkedIn, and more</li>
            <li>Sentiment analysis (positive, neutral, negative)</li>
            <li>AI-suggested replies</li>
            <li>Mark as read, replied, or archived</li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
