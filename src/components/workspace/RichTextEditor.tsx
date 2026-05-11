"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 200,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Sync value from props (only when it changes externally)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
      setIsEmpty(!el.textContent?.trim());
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setIsEmpty(!el.textContent?.trim());
    onChange(el.innerHTML);
  }, [onChange]);

  function exec(command: string, val?: string) {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    handleInput();
  }

  function handleLink() {
    const url = window.prompt("Enter URL:");
    if (url) exec("createLink", url);
  }

  const toolbarBtnClass =
    "text-xs px-2 py-1 rounded text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 transition-colors";

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 mb-1 border border-white/[0.08] rounded-t-md bg-surface px-2 py-1">
        <button type="button" onClick={() => exec("bold")} className={toolbarBtnClass} title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => exec("italic")} className={toolbarBtnClass} title="Italic">
          <em>I</em>
        </button>
        <button type="button" onClick={handleLink} className={toolbarBtnClass} title="Insert link">
          Link
        </button>
        <div className="w-px h-4 bg-white/[0.08] mx-1" />
        <button type="button" onClick={() => exec("insertUnorderedList")} className={toolbarBtnClass} title="Bullet list">
          •
        </button>
        <button type="button" onClick={() => exec("insertOrderedList")} className={toolbarBtnClass} title="Numbered list">
          1.
        </button>
      </div>

      {/* Editor area */}
      <div className="relative">
        {isEmpty && placeholder && (
          <div className="absolute top-3 left-3 text-sm text-slate-500 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          className="bg-surface border border-t-0 border-white/[0.08] rounded-b-md p-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500/50"
          style={{ minHeight: `${minHeight}px` }}
        />
      </div>
    </div>
  );
}
