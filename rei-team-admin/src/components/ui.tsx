"use client";
import { ReactNode, useEffect, useState, useRef } from "react";

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface border border-white/[0.06] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none",
        "focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none",
        "focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const variant = props.variant ?? "primary";
  const base = "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const styles =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-500"
      : "bg-transparent text-slate-300 hover:bg-white/[0.06] border border-white/10";
  return <button {...props} className={[base, styles, props.className ?? ""].join(" ")} />;
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-400">{children}</span>;
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  maxWidthClass,
}: {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  /** Optional Tailwind max-width class for the dialog container (e.g. "max-w-5xl"). */
  maxWidthClass?: string;
}) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className={[
          "w-full",
          maxWidthClass ?? "max-w-2xl",
          "rounded-2xl bg-surface border border-white/[0.06] shadow-2xl overflow-hidden",
        ].join(" ")}
        style={{ maxHeight: "90vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div className="text-base md:text-lg font-semibold text-slate-100 text-center flex-1">{title}</div>
          <Button variant="ghost" onClick={onClose} aria-label="Close modal" className="shrink-0">
            Close
          </Button>
        </div>

        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "calc(90vh - 64px - 72px)" }}>
          {children}
        </div>

        {footer && <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-surface p-1">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={[
              "px-3 py-1.5 text-sm rounded-lg font-medium transition-colors",
              active ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Dropdown({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-lg border border-white/10 bg-surface shadow-xl z-50">
          <div className="py-1">
            {items.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick();
                    setOpen(false);
                  }
                }}
                disabled={item.disabled}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const allSelected = selected.size === options.length;
  const summary = allSelected ? "All" : `${selected.size} selected`;

  const handleSelectAll = () => {
    onChange(new Set(options.map((o) => o.value)));
  };

  const handleSelectNone = () => {
    onChange(new Set());
  };

  const handleInvertSelection = () => {
    const newSelected = new Set<string>();
    for (const opt of options) {
      if (!selected.has(opt.value)) {
        newSelected.add(opt.value);
      }
    }
    onChange(newSelected);
  };

  const handleToggle = (value: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      newSelected.add(value);
    }
    onChange(newSelected);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left rounded border border-white/10 px-2 py-1 text-xs bg-base text-slate-300 hover:bg-white/[0.04]"
      >
        {label}: {summary}
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-full min-w-[200px] rounded-lg border border-white/10 bg-surface shadow-xl z-50 max-h-80 overflow-auto">
          <div className="p-2 border-b border-white/[0.06] bg-elevated flex gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs px-2 py-1 rounded text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            >
              All
            </button>
            <button
              type="button"
              onClick={handleSelectNone}
              className="text-xs px-2 py-1 rounded text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            >
              None
            </button>
            <button
              type="button"
              onClick={handleInvertSelection}
              className="text-xs px-2 py-1 rounded text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            >
              Invert
            </button>
          </div>
          <div className="py-1">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.06] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={() => handleToggle(opt.value)}
                  className="rounded"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
