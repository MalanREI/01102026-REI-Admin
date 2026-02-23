import { PageShell } from "@/src/components/PageShell";
import { Card, Pill } from "@/src/components/ui";

export default function MediaPostingPage() {
  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Media Posting</h1>
          <div className="text-sm text-slate-400 mt-1">
            This module is scaffolded. Next step: build the posting plan UI we discussed (calendar + weekly checklist + templates).
          </div>
        </div>

        <Card title="Status" right={<Pill>MVP scaffold</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Define “Platforms” (FB, IG, X, LinkedIn, etc.)</li>
            <li>Create “Post Templates” (hooks, CTAs, offer types)</li>
            <li>Create “Posting Plan” generator (weekly cadence)</li>
            <li>Add optional approval workflow</li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
