'use client';
import { useEffect, useState } from 'react';
import {
  readCurrentMessage,
  subscribeItemChanged,
  type CurrentMessageContext,
} from '@/src/lib/office/office-ready';
import SenderContextPanel from './SenderContextPanel';
import ThreadContextPanel from './ThreadContextPanel';

export default function MessageContextPanel() {
  const [msg, setMsg] = useState<CurrentMessageContext>(readCurrentMessage());

  useEffect(() => {
    const unsubscribe = subscribeItemChanged(() => {
      setMsg(readCurrentMessage());
    });
    return unsubscribe;
  }, []);

  if (!msg.subject && !msg.fromEmail) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Open an email in Outlook to see workspace context.
      </div>
    );
  }

  return (
    <div className="p-4 text-sm space-y-4">
      <section>
        <h2 className="font-semibold">Current message</h2>
        <dl className="mt-1 space-y-1">
          <div>
            <dt className="text-xs uppercase text-gray-500">Subject</dt>
            <dd>{msg.subject ?? <em>(none)</em>}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">From</dt>
            <dd>
              {msg.fromName ? `${msg.fromName} · ` : ''}
              {msg.fromEmail ?? <em>(unknown)</em>}
            </dd>
          </div>
        </dl>
      </section>

      <hr className="border-gray-200" />
      <section>
        <SenderContextPanel key={msg.fromEmail ?? 'no-sender'} />
      </section>

      <hr className="border-gray-200" />
      <section>
        <ThreadContextPanel key={msg.conversationId ?? 'no-thread'} />
      </section>

      <p className="pt-2 text-xs text-gray-400">
        Phase 7: workspace context. Phase 8 wires AI analysis.
      </p>
    </div>
  );
}
