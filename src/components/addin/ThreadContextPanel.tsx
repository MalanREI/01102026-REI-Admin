'use client';
import { useEffect, useState } from 'react';
import { getConversationByThreadId } from '@/src/lib/supabase/workspace-queries';
import { resolveAccountByOutlookEmail } from '@/src/lib/addin/account-resolution';
import { useOfficeItem } from './OfficeItemContext';
import type { Email, Conversation } from '@/src/lib/types/workspace';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no-account' }
  | { status: 'no-thread' }
  | { status: 'not-synced' }
  | { status: 'loaded'; conversation: Conversation; emails: Email[] }
  | { status: 'error'; message: string };

export default function ThreadContextPanel() {
  const { message, userEmail, refreshNonce } = useOfficeItem();
  const conversationId = message.conversationId;
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });

      if (!userEmail) {
        if (!cancelled) setState({ status: 'no-account' });
        return;
      }
      if (!conversationId) {
        if (!cancelled) setState({ status: 'no-thread' });
        return;
      }

      try {
        const account = await resolveAccountByOutlookEmail(userEmail);
        if (!account) {
          if (!cancelled) setState({ status: 'no-account' });
          return;
        }
        const result = await getConversationByThreadId(account.id, conversationId);
        if (!result) {
          if (!cancelled) setState({ status: 'not-synced' });
          return;
        }
        if (!cancelled) setState({ status: 'loaded', ...result });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [userEmail, conversationId, refreshNonce]);

  if (state.status === 'idle' || state.status === 'loading') {
    return <p className="text-xs text-gray-500">Loading thread context…</p>;
  }
  if (state.status === 'no-account') {
    return <p className="text-xs text-gray-500">This Outlook account isn't connected to your workspace yet.</p>;
  }
  if (state.status === 'no-thread') {
    return <p className="text-xs text-gray-500">No thread context for this item.</p>;
  }
  if (state.status === 'not-synced') {
    return <p className="text-xs text-gray-500">This email hasn't synced to your workspace yet (sync runs every 5 minutes).</p>;
  }
  if (state.status === 'error') {
    return <p className="text-xs text-red-700">Error: {state.message}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">
        Thread: {state.emails.length} message{state.emails.length === 1 ? '' : 's'}
      </p>
      <ul className="space-y-1.5 text-xs">
        {state.emails.map((e) => (
          <li key={e.id} className="border-l-2 border-gray-200 pl-2">
            <div className="font-medium text-gray-900 truncate">
              {e.from_name || e.from_address || '(unknown)'}
            </div>
            <div className="text-gray-500">
              {e.sent_at ? new Date(e.sent_at).toLocaleString([], {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              }) : ''}
            </div>
            {e.snippet && <div className="text-gray-400 truncate italic">{e.snippet}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
