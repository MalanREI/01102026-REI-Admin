"use client";
import { Button } from "@/src/components/ui";

export function ViewToggle({ view, onChange }: { view: "grid" | "list"; onChange: (v: "grid" | "list") => void }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
      <Button
        variant={view === "grid" ? "primary" : "ghost"}
        onClick={() => onChange("grid")}
        className="rounded-none border-0 px-3 py-2"
        aria-label="Grid view"
      >
        ⊞
      </Button>
      <Button
        variant={view === "list" ? "primary" : "ghost"}
        onClick={() => onChange("list")}
        className="rounded-none border-0 border-l border-white/10 px-3 py-2"
        aria-label="List view"
      >
        ☰
      </Button>
    </div>
  );
}
