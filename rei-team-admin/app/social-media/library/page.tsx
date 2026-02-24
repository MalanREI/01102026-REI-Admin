import { PageShell } from "@/src/components/PageShell";
import { Card, Pill } from "@/src/components/ui";

export default function ContentLibraryPage() {
  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Content Library</h1>
          <div className="text-sm text-slate-400 mt-1">
            Browse, search, and manage all posts and drafts.
          </div>
        </div>

        <Card title="Status" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Filter by status: draft, pending approval, scheduled, published</li>
            <li>Filter by platform, content type, and brand voice</li>
            <li>Bulk actions: approve, archive, reschedule</li>
            <li>Full post detail view with revision history</li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
