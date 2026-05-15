"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function PaneSplit({
  storageKey,
  defaultLeftWidth,
  minLeftWidth,
  maxLeftWidth,
  leftPane,
  rightPane,
  collapsible,
  collapsed,
  onCollapsedChange,
}: {
  storageKey: string;
  defaultLeftWidth: number;
  minLeftWidth: number;
  maxLeftWidth: number;
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const persisted = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as { width?: number }) : null;
    } catch { return null; }
  }, [storageKey]);

  const [leftWidth, setLeftWidth] = useState(
    Math.max(minLeftWidth, Math.min(maxLeftWidth, persisted?.width ?? defaultLeftWidth))
  );

  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(leftWidth);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ width: leftWidth })); }
    catch { /* ignore */ }
  }, [storageKey, leftWidth]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      setLeftWidth(Math.max(minLeftWidth, Math.min(maxLeftWidth, startW.current + dx)));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.classList.remove("select-none");
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [minLeftWidth, maxLeftWidth]);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = leftWidth;
    document.body.style.cursor = "col-resize";
    document.body.classList.add("select-none");
  }, [leftWidth]);

  const isCollapsed = collapsible && collapsed;

  return (
    <div className="flex h-full">
      {/* Left pane */}
      <div
        className="shrink-0 overflow-hidden h-full"
        style={{ width: isCollapsed ? 0 : leftWidth, transition: dragging.current ? undefined : "width 150ms" }}
      >
        {!isCollapsed && leftPane}
      </div>

      {/* Divider */}
      <div
        className="shrink-0 w-1 cursor-col-resize hover:bg-emerald-500/30 transition-colors relative group"
        onMouseDown={onDividerMouseDown}
      >
        {collapsible && isCollapsed && (
          <button
            onClick={() => onCollapsedChange?.(false)}
            className="absolute top-2 -left-1 w-5 h-6 flex items-center justify-center bg-surface border border-white/[0.08] rounded text-[10px] text-slate-400 hover:text-slate-200 z-10"
          >
            ▸
          </button>
        )}
      </div>

      {/* Right pane */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {rightPane}
      </div>
    </div>
  );
}
