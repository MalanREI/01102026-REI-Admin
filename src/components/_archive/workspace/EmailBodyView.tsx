"use client";

import { useState } from "react";

export function EmailBodyView({
  bodyHtml,
  bodyText,
  snippet,
}: {
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string | null;
}) {
  const hasHtml = !!bodyHtml;
  const hasText = !!bodyText;
  const [viewMode, setViewMode] = useState<"html" | "text">(hasHtml ? "html" : "text");

  if (!hasHtml && !hasText && !snippet) {
    return <p className="text-sm text-slate-500 italic">Email body unavailable.</p>;
  }

  return (
    <div>
      {hasHtml && hasText && (
        <button
          onClick={() => setViewMode((m) => (m === "html" ? "text" : "html"))}
          className="text-xs text-emerald-400 hover:text-emerald-300 mb-2 transition-colors"
        >
          {viewMode === "html" ? "View as text" : "View HTML"}
        </button>
      )}

      {viewMode === "html" && hasHtml ? (
        <iframe
          srcDoc={bodyHtml!}
          sandbox=""
          style={{ width: "100%", minHeight: "300px", border: "none", background: "white", borderRadius: "4px" }}
        />
      ) : hasText ? (
        <pre className="whitespace-pre-wrap text-sm font-sans text-slate-300">{bodyText}</pre>
      ) : snippet ? (
        <p className="text-sm text-slate-500 italic">{snippet}</p>
      ) : null}
    </div>
  );
}
