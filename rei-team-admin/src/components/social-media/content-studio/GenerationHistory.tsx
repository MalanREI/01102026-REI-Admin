"use client";

import { useState, useEffect } from "react";
import { AiGenerationHistory } from "@/src/lib/types/social-media";
import { getAiGenerationHistory } from "@/src/lib/supabase/social-media-queries";

export function GenerationHistory() {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<AiGenerationHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getAiGenerationHistory(20)
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <div className="border-t border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span>AI Generation History</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading && <p className="text-xs text-slate-500">Loading…</p>}
          {!loading && history.length === 0 && (
            <p className="text-xs text-slate-500">No generation history yet.</p>
          )}
          {history.map((h) => (
            <div key={h.id} className="rounded-lg bg-elevated border border-white/[0.06] p-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-emerald-400">{h.model_used}</span>
                <span className="text-xs text-slate-500">
                  {new Date(h.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">{h.prompt}</p>
              <div className="flex gap-3 text-xs text-slate-600">
                {h.tokens_used && <span>{h.tokens_used.toLocaleString()} tokens</span>}
                {h.cost_estimate && <span>${h.cost_estimate.toFixed(4)}</span>}
                {h.content_type && <span>{h.content_type}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
