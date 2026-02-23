"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, APP_NAME } from "@/src/config/app.config";
import { Button } from "@/src/components/ui";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

  return (
    <aside className={["h-screen border-r border-white/[0.06] bg-surface p-4 flex flex-col", collapsed ? "w-16" : "w-64"].join(" ")}>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2">
          {!collapsed && (
            <div>
              <div className="text-lg font-semibold text-slate-100">{APP_NAME}</div>
              <div className="text-xs text-slate-500">Internal team workspace</div>
            </div>
          )}
          <Button variant="ghost" onClick={onToggle} aria-label="Toggle sidebar">
            {collapsed ? "→" : "←"}
          </Button>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-emerald-500/10 text-emerald-400 font-medium"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
              ].join(" ")}
            >
              {collapsed ? item.label.slice(0, 1) : item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
