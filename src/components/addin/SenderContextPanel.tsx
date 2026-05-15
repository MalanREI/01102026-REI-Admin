'use client';
import { useEffect, useState } from 'react';
import { listEmailsFromSender } from '@/src/lib/supabase/workspace-queries';
import { resolveAccountByOutlookEmail } from '@/src/lib/addin/account-resolution';
import { readCurrentMessage, readCurrentUserEmail } from '@/src/lib/office/office-ready';
import type { Email } from '@/src/lib/types/workspace';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no-account' }
  | { status: 'no-sender' }
  | { status: 'loaded'; emails: Email[] }
  | { status: 'error'; message: string };

export default function SenderContextPanel() {
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      const userEmail = readCurrentUserEmail();
      const message = readCurrentMessage();

      if (!userEmail) {
        if (!cancelled) setState({ status: 'no-account' });
        return;
      }
      if (!message.fromEmail) {
        if (!cancelled) setState({ status: 'no-sender' });
        return;
      }

      try {
        const account = await resolveAccountByOutlookEmail(userEmail);
        if (!account) {
          if (!cancelled) setState({ status: 'no-account' });
          return;
        }
        const emails = await listEmailsFromSender(account.id, message.fromEmail, { limit: 10 });
        if (!cancelled) setState({ status: 'loaded', emails });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'idle' || state.status === 'loading') {
    return <p className="text-xs text-gray-500">Loading sender context…</p>;
  }
  if (state.status === 'no-account') {
    return <p className="text-xs text-gray-500">This Outlook account isn't connected to your workspace yet.</p>;
  }
  if (state.status === 'no-sender') {
    return <p className="text-xs text-gray-500">No sender for this item.</p>;
  }
  if (state.status === 'error') {
    return <p className="text-xs text-red-700">Error: {state.message}</p>;
  }
  if (state.emails.length === 0) {
    return <p className="text-xs text-gray-500">No prior emails from this sender in your workspace.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">
        Prior emails from this sender ({state.emails.length})
      </p>
      <ul className="space-y-1.5 text-xs">
        {state.emails.map((e) => (
          <li key={e.id} className="border-l-2 border-gray-200 pl-2">
            <div className="font-medium text-gray-900 truncate">{e.subject || '(no subject)'}</div>
            <div className="text-gray-500">
              {e.received_at ? new Date(e.received_at).toLocaleDateString() : ''}
              {!e.is_read && <span className="text-blue-600"> · unread</span>}
            </div>
            {e.snippet && <div className="text-gray-400 truncate italic">{e.snippet}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
