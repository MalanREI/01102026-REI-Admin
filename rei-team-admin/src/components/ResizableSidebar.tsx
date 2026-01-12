"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapsedWidth?: number;
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function ResizableSidebar({
  storageKey,
  defaultWidth = 420,
  minWidth = 300,
  maxWidth = 620,
  collapsedWidth = 56,
  sidebar,
  children,
}: Props) {
  const dragRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(defaultWidth);

  const persisted = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as { width?: number; collapsed?: boolean };
    } catch {
      return null;
    }
  }, [storageKey]);

  const [collapsed, setCollapsed] = useState<boolean>(persisted?.collapsed ?? false);
  const [width, setWidth] = useState<number>(() => {
    const w = persisted?.width ?? defaultWidth;
    return clamp(w, minWidth, maxWidth);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ width, collapsed }));
    } catch {
      // ignore
    }
  }, [storageKey, width, collapsed]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = e.clientX - startXRef.current;
      const next = clamp(startWRef.current + dx, minWidth, maxWidth);
      setWidth(next);
    }

    function onUp() {
      dragRef.current = false;
      document.body.classList.remove("select-none");
      document.body.style.cursor = "";
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minWidth, maxWidth]);

  const sidebarW = collapsed ? collapsedWidth : width;

  return (
    <div className="flex gap-6">
      <div
        className="relative shrink-0"
        style={{ width: sidebarW }}
      >
        <div className="h-full">
          <div className="flex items-start justify-between">
            <button
              type="button"
              className="h-10 w-10 rounded-xl border bg-white text-sm hover:bg-gray-50 flex items-center justify-center"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? "›" : "‹"}
            </button>
          </div>

          <div className={collapsed ? "mt-3" : "mt-3"}>
            {collapsed ? null : sidebar}
          </div>
        </div>

        {!collapsed && (
          <div
            className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
            onMouseDown={(e) => {
              dragRef.current = true;
              startXRef.current = e.clientX;
              startWRef.current = width;
              document.body.classList.add("select-none");
              document.body.style.cursor = "col-resize";
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            title="Drag to resize"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
