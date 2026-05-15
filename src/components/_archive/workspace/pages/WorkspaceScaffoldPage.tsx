"use client";

import { Pill } from "@/src/components/ui";

export function WorkspaceScaffoldPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
        <Pill>Scaffold</Pill>
      </div>
      <p className="text-sm text-slate-400">{description}</p>
    </div>
  );
}
