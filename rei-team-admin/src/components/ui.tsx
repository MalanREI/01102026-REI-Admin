"use client";
import { ReactNode, useEffect, useState, useRef } from "react";

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow-sm border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
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
        "w-full rounded-lg border px-3 py-2 text-sm outline-none",
        "focus:ring-2 focus:ring-gray-300",
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
        "w-full rounded-lg border px-3 py-2 text-sm outline-none",
        "focus:ring-2 focus:ring-gray-300",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const variant = props.variant ?? "primary";
  const base = "rounded-lg px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-gray-900 text-white hover:bg-black"
      : "bg-transparent hover:bg-gray-100 border";
  return <button {...props} className={[base, styles, props.className ?? ""].join(" ")} />;
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border bg-gray-50 px-2 py-0.5 text-xs">{children}</span>;
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className={[
          "w-full",
          maxWidthClass ?? "max-w-2xl",
          "rounded-2xl bg-white border shadow-lg overflow-hidden",
        ].join(" ")}
        style={{ maxHeight: "90vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-white">
          <div className="text-base md:text-lg font-semibold text-gray-900 text-center flex-1">{title}</div>
          <Button variant="ghost" onClick={onClose} aria-label="Close modal" className="shrink-0">
            Close
          </Button>
        </div>

        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "calc(90vh - 64px - 72px)" }}>
          {children}
        </div>

        {footer && <div className="px-5 py-4 border-t bg-white flex justify-end gap-2">{footer}</div>}
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
    <div className="inline-flex rounded-xl border bg-white p-1">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={[
              "px-3 py-1.5 text-sm rounded-lg",
              active ? "bg-gray-900 text-white" : "hover:bg-gray-50",
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
        <div className="absolute right-0 mt-1 w-56 rounded-lg border bg-white shadow-lg z-50">
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
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
        className="w-full text-left rounded border px-2 py-1 text-xs bg-white hover:bg-gray-50"
      >
        {label}: {summary}
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-full min-w-[200px] rounded-lg border bg-white shadow-lg z-50 max-h-80 overflow-auto">
          <div className="p-2 border-b bg-gray-50 flex gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs px-2 py-1 rounded hover:bg-gray-200"
            >
              All
            </button>
            <button
              type="button"
              onClick={handleSelectNone}
              className="text-xs px-2 py-1 rounded hover:bg-gray-200"
            >
              None
            </button>
            <button
              type="button"
              onClick={handleInvertSelection}
              className="text-xs px-2 py-1 rounded hover:bg-gray-200"
            >
              Invert
            </button>
          </div>
          <div className="py-1">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer"
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
