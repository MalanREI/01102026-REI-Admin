"use client";

import { useRef, useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RecipientInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = input.trim().replace(/,$/, "").trim();
    if (!trimmed) return;
    if (!EMAIL_RE.test(trimmed)) {
      setInvalid(true);
      setTimeout(() => setInvalid(false), 600);
      return;
    }
    if (!value.includes(trimmed.toLowerCase())) {
      onChange([...value, trimmed.toLowerCase()]);
    }
    setInput("");
  }

  function remove(addr: string) {
    onChange(value.filter((v) => v !== addr));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="flex items-start gap-2">
      <label className="text-xs text-slate-400 pt-2.5 w-8 shrink-0">{label}</label>
      <div
        className={[
          "flex-1 flex flex-wrap items-center gap-1 min-h-10 rounded-md border px-3 py-1.5 bg-surface cursor-text",
          invalid ? "border-red-500/60" : "border-white/[0.08]",
        ].join(" ")}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((addr) => (
          <span
            key={addr}
            className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm px-2 py-0.5 rounded-md"
          >
            <span className="truncate max-w-[200px]">{addr}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(addr); }}
              className="text-emerald-400/60 hover:text-emerald-300 text-xs"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder={value.length === 0 ? (placeholder ?? `Add ${label.toLowerCase()} recipients…`) : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-200 placeholder:text-slate-500 outline-none"
        />
      </div>
    </div>
  );
}
