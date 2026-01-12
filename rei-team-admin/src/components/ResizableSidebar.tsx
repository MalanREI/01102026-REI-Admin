// src/components/ResizableSidebar.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ResizableSidebarProps = {
  /** Unique storage key so each page can remember its own width/collapsed state */
  storageKey: string;

  /** Sidebar content */
  sidebar: React.ReactNode;

  /** Main content */
  children: React.ReactNode;

  /** Defaults */
  defaultWidth?: number; // px
  minWidth?: number; // px
  maxWidth?: number; // px
  collapsedWidth?: number; // px

  /** Optional class overrides */
  className?: string;
  sidebarClassName?: string;
  contentClassName?: string;

  /** Optional: show drag handle only when not collapsed (default true) */
  showHandleWhenExpandedOnly?: boolean;

  /** Optional: initial collapsed state (if nothing stored) */
  defaultCollapsed?: boolean;

  /** Optional: aria labels */
  collapseLabel?: string;
  expandLabel?: string;
};

type StoredState = {
  w: number;
  c: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ResizableSidebar({
  storageKey,
  sidebar,
  children,
  defaultWidth = 420,
  minWidth = 280,
  maxWidth = 640,
  collapsedWidth = 56,
  className,
  sidebarClassName,
  contentClassName,
  showHandleWhenExpandedOnly = true,
  defaultCollapsed = false,
  collapseLabel = "Collapse sidebar",
  expandLabel = "Expand sidebar",
}: ResizableSidebarProps) {
  const storageKeyFull = useMemo(() => `rei.sidebar.${storageKey}`, [storageKey]);

  const [width, setWidth] = useState<number>(defaultWidth);
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  // Load saved state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKeyFull);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredState;
      if (typeof parsed?.w === "number") setWidth(parsed.w);
      if (typeof parsed?.c === "boolean") setCollapsed(parsed.c);
    } catch {
      // ignore
    }
  }, [storageKeyFull]);

  // Save state
  useEffect(() => {
    try {
      const payload: StoredState = { w: width, c: collapsed };
      localStorage.setItem(storageKeyFull, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [storageKeyFull, width, collapsed]);

  // Drag listeners
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      const next = clamp(startWRef.current + dx, minWidth, maxWidth);
      setWidth(next);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minWidth, maxWidth]);

  function beginDrag(e: React.MouseEvent) {
    if (collapsed) return;
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const effectiveWidth = collapsed ? collapsedWidth : clamp(width, minWidth, maxWidth);

  return (
    <div className={["flex w-full min-w-0", className ?? ""].join(" ")}>
      <aside
        className={[
          "relative shrink-0 border-r bg-white",
          "min-h-[calc(100vh-0px)]", // safe default; page wrappers can override
          sidebarClassName ?? "",
        ].join(" ")}
        style={{ width: effectiveWidth }}
      >
        {/* Top action row */}
        <div className="flex items-center justify-between gap-2 px-2 py-2 border-b">
          {/* Left: "hamburger/chevron" button */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? expandLabel : collapseLabel}
            className="h-9 w-9 rounded-lg border hover:bg-gray-50 flex items-center justify-center"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {/* simple chevron */}
            <span className="text-lg leading-none select-none">
              {collapsed ? "›" : "‹"}
            </span>
          </button>

          {/* Right: optional hint */}
          {!collapsed && (
            <div className="text-xs text-gray-500 pr-1 select-none">Drag to resize</div>
          )}
        </div>

        {/* Sidebar content */}
        <div className={["h-full", collapsed ? "px-1 py-2" : "p-3"].join(" ")}>
          {collapsed ? (
            // Collapsed: only show an icon-like placeholder; you can customize this by changing this block
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-100 border" />
              <div className="w-8 h-8 rounded-lg bg-gray-100 border" />
              <div className="w-8 h-8 rounded-lg bg-gray-100 border" />
            </div>
          ) : (
            sidebar
          )}
        </div>

        {/* Drag handle */}
        {(!showHandleWhenExpandedOnly || !collapsed) && (
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={beginDrag}
            className={[
              "absolute top-0 right-0 h-full w-2",
              "cursor-col-resize",
              "hover:bg-gray-100",
              "active:bg-gray-200",
            ].join(" ")}
          />
        )}
      </aside>

      <main className={["flex-1 min-w-0", contentClassName ?? ""].join(" ")}>
        {children}
      </main>
    </div>
  );
}

