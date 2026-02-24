"use client";
import Link from "next/link";
import type { Route } from "next";

export function SettingsSection({
  title,
  description,
  href,
  count,
  countLabel,
  icon,
}: {
  title: string;
  description: string;
  href?: string;
  count?: number;
  countLabel?: string;
  icon?: string;
}) {
  const content = (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-2 hover:bg-elevated transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-xl">{icon}</span>}
          <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        </div>
        {count !== undefined && (
          <span className="text-xs text-slate-400 bg-white/[0.06] rounded-full px-2 py-0.5">
            {count} {countLabel ?? ""}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400">{description}</p>
      {href && <p className="text-xs text-emerald-400">Configure →</p>}
    </div>
  );

  if (href) return <Link href={href as Route}>{content}</Link>;
  return content;
}
