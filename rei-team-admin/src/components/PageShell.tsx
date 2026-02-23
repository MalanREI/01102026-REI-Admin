"use client";

import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { TopBar } from "@/src/components/TopBar";

export function PageShell({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("rei_sidebar_collapsed");
    if (saved === "1") setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("rei_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
      <div className="flex-1 min-w-0">
        <TopBar onToggleSidebar={() => setSidebarCollapsed((v) => !v)} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
