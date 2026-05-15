'use client';
import { useOfficeItem } from './OfficeItemContext';
import SenderContextPanel from './SenderContextPanel';
import ThreadContextPanel from './ThreadContextPanel';

export default function MessageContextPanel() {
  const { message: msg } = useOfficeItem();

  if (!msg.subject && !msg.fromEmail) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Open an email in Outlook to see workspace context.
      </div>
    );
  }

  return (
    <div className="p-4 text-sm space-y-3">
      <section>
        <h2 className="font-semibold">Current message</h2>
        <dl className="space-y-1 mt-2">
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
        <SenderContextPanel />
      </section>

      <hr className="border-gray-200" />
      <section>
        <ThreadContextPanel />
      </section>

      <p className="pt-2 text-xs text-gray-400">
        Phase 7.1: live item refresh. Phase 8 wires AI analysis.
      </p>
    </div>
  );
}
