import { PageShell } from "@/src/components/PageShell";
import { Card, Pill } from "@/src/components/ui";

export default function ContentStudioPage() {
  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Content Studio</h1>
          <div className="text-sm text-slate-400 mt-1">
            AI-powered content generation for all your social media platforms.
          </div>
        </div>

        <Card title="Status" right={<Pill>Coming soon</Pill>}>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            <li>Select content type and brand voice</li>
            <li>Generate AI draft using GPT-4o or Claude</li>
            <li>Edit, preview, and tailor per platform</li>
            <li>Submit for approval or save as draft</li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
