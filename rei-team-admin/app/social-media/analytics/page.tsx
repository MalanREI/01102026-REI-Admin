import { PageShell } from "@/src/components/PageShell";
import { Card, Pill } from "@/src/components/ui";

export default function SocialMediaAnalyticsPage() {
  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <div className="text-sm text-slate-400 mt-1">
            Track performance metrics and engagement across all platforms.
          </div>
        </div>

        <Card title="Status" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Impressions, reach, likes, comments, shares, and saves</li>
            <li>Engagement rate trends over time</li>
            <li>Top performing posts and content types</li>
            <li>Follower growth per platform</li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
