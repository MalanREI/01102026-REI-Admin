import { PageShell } from "@/src/components/PageShell";
import { Card, Pill } from "@/src/components/ui";

export default function SocialMediaCalendarPage() {
  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Content Calendar</h1>
          <div className="text-sm text-slate-400 mt-1">
            Visualize and manage your scheduled content across all platforms.
          </div>
        </div>

        <Card title="Status" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Monthly and weekly calendar views</li>
            <li>Drag-and-drop rescheduling</li>
            <li>Recurring post management</li>
            <li>Per-platform and multi-platform scheduling</li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
