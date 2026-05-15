"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS, type NavItem } from "@/src/config/app.config";
import { Button } from "@/src/components/ui";

function GearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string[]>([]);

  function toggleExpanded(href: string) {
    setExpanded((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
    );
  }

  function isExpanded(href: string) {
    return expanded.includes(href);
  }

  function itemIsActive(item: NavItem): boolean {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
    if (!item.children?.length) return false;
    return item.children.some((child) => itemIsActive(child));
  }

  function renderNavItem(item: NavItem, depth = 0, parentKey = "") {
    const key = `${parentKey}${item.href}-${item.label}-${depth}`;
    const active = itemIsActive(item);
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const open = hasChildren && (isExpanded(key) || active);

    if (hasChildren && !collapsed) {
      return (
        <div key={key}>
          <button
            onClick={() => toggleExpanded(key)}
            className={[
              "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
              depth > 0 ? "ml-3" : "",
              active
                ? "bg-emerald-500/10 text-emerald-400 font-medium"
                : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
            ].join(" ")}
          >
            <span>{collapsed ? item.label.slice(0, 1) : item.label}</span>
            <span className="text-xs">{open ? "▾" : "▸"}</span>
          </button>
          {open && (
            <div className={["mt-1 space-y-1 border-l border-white/[0.06]", depth > 0 ? "ml-6 pl-3" : "ml-3 pl-3"].join(" ")}>
              {item.children!.map((child) => renderNavItem(child, depth + 1, `${key}-`))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={key}
        href={item.href as Route}
        className={[
          "block rounded-lg px-3 py-2 text-sm transition-colors",
          depth > 0 && !collapsed ? "ml-3" : "",
          active
            ? "bg-emerald-500/10 text-emerald-400 font-medium"
            : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
        ].join(" ")}
      >
        <span>{collapsed ? item.label.slice(0, 1) : item.label}</span>
      </Link>
    );
  }

  return (
    <aside className={["sticky top-0 h-screen border-r border-white/[0.06] bg-surface p-4 flex flex-col", collapsed ? "w-16" : "w-64"].join(" ")}>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2">
          {!collapsed && (
            <a href="https://renewableenergyincentives.com" target="_blank" rel="noopener noreferrer">
              <img src="/logo.png" alt="Alan's Workspace" className="h-14 w-auto" />
            </a>
          )}
          <Button variant="ghost" onClick={onToggle} aria-label="Toggle sidebar">
            {collapsed ? "→" : "←"}
          </Button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto min-h-0">
        {NAV_ITEMS.map((item) => renderNavItem(item))}
      </nav>

      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <Link
          href="/settings"
          className={[
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname === "/settings" || pathname.startsWith("/settings/")
              ? "bg-emerald-500/10 text-emerald-400 font-medium"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
          ].join(" ")}
        >
          <GearIcon />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>
    </aside>
  );
}
