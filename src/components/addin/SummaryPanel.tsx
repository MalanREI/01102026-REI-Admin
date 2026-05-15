'use client';
import { useEffect, useState } from 'react';
import { useOfficeItem } from './OfficeItemContext';
import { resolveAccountByOutlookEmail } from '@/src/lib/addin/account-resolution';
import { getConversationByThreadId } from '@/src/lib/supabase/workspace-queries';
import { supabaseBrowser } from '@/src/lib/supabase/browser';

type SummaryData = { summary: string; keyPoints: string[]; cached: boolean; generatedAt: string };

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no-context' }
  | { status: 'not-synced' }
  | { status: 'no-key' }
  | { status: 'loaded'; data: SummaryData }
  | { status: 'error'; message: string };

export default function SummaryPanel() {
  const { message, userEmail, refreshNonce } = useOfficeItem();
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ status: 'loading' });
      if (!userEmail || !message.conversationId) { if (!cancelled) setState({ status: 'no-context' }); return; }

      try {
        const account = await resolveAccountByOutlookEmail(userEmail);
        if (!account) { if (!cancelled) setState({ status: 'no-context' }); return; }
        const conv = await getConversationByThreadId(account.id, message.conversationId);
        if (!conv) { if (!cancelled) setState({ status: 'not-synced' }); return; }

        // Find latest email in this conversation
        const sb = supabaseBrowser();
        const { data: emailMatch } = await sb
          .from('emails').select('id').eq('conversation_id', conv.conversation.id)
          .order('received_at', { ascending: false }).limit(1).maybeSingle();
        if (!emailMatch?.id) { if (!cancelled) setState({ status: 'not-synced' }); return; }

        const res = await fetch('/api/ai/summarize-email', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailId: emailMatch.id }),
        });
        if (res.status === 503) { if (!cancelled) setState({ status: 'no-key' }); return; }
        if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error ?? `${res.status}`); }
        const data: SummaryData = await res.json();
        if (!cancelled) setState({ status: 'loaded', data });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userEmail, message.conversationId, refreshNonce]);

  if (state.status === 'idle' || state.status === 'loading') return <p className="text-xs text-gray-500">Generating summary…</p>;
  if (state.status === 'no-context') return null;
  if (state.status === 'not-synced') return <p className="text-xs text-gray-500">Email not yet synced.</p>;
  if (state.status === 'no-key') return <p className="text-xs text-amber-700">No Anthropic key configured. Add one in Settings.</p>;
  if (state.status === 'error') return <p className="text-xs text-red-700">Summary error: {state.message}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">
        Summary {state.data.cached && <span className="text-gray-400">· cached</span>}
      </p>
      <p className="text-xs text-gray-900 leading-relaxed">{state.data.summary}</p>
      {state.data.keyPoints.length > 0 && (
        <ul className="space-y-1 text-xs">
          {state.data.keyPoints.map((point, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-gray-400">·</span>
              <span className="text-gray-700">{point}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
