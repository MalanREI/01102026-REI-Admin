'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AddinAuthGate from './AddinAuthGate';
import MessageContextPanel from './MessageContextPanel';
import CalendarContextPanel from './CalendarContextPanel';
import PinHint from './PinHint';
import { OfficeItemProvider } from './OfficeItemContext';
import { waitForOffice, type OfficeHostInfo } from '@/src/lib/office/office-ready';
import { readOfficeDiagnostics, type OfficeDiagnostics } from '@/src/lib/office/diagnostics';

/// <reference types="office-js" />

function getItemType(): 'message' | 'appointment' | 'unknown' {
  const item = Office.context?.mailbox?.item;
  if (!item) return 'unknown';
  if (item.itemType === Office.MailboxEnums.ItemType.Message) return 'message';
  if (item.itemType === Office.MailboxEnums.ItemType.Appointment) return 'appointment';
  return 'unknown';
}

export default function TaskPaneShell() {
  const [officeReady, setOfficeReady] = useState<OfficeHostInfo | null>(null);
  const [officeError, setOfficeError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<OfficeDiagnostics | null>(null);

  useEffect(() => {
    waitForOffice()
      .then(setOfficeReady)
      .catch((err) => setOfficeError(err.message ?? String(err)));
  }, []);

  useEffect(() => {
    if (officeReady) {
      try {
        setDiagnostics(readOfficeDiagnostics());
      } catch {
        // Ignore
      }
    }
  }, [officeReady]);

  if (officeError) {
    return (
      <div className="p-4 text-sm">
        <h2 className="font-semibold text-red-700">Office.js failed to load</h2>
        <p className="mt-2 text-gray-600">{officeError}</p>
        <p className="mt-2 text-gray-500">
          Are you running this inside Outlook? Open the task pane from the
          message read pane button after sideloading the manifest.
        </p>
      </div>
    );
  }

  if (!officeReady) {
    return (
      <div className="p-4 text-sm text-gray-500">Loading Office bridge…</div>
    );
  }

  const itemType = getItemType();

  return (
    <>
      {diagnostics && (
        <div style={{
          background: '#fffbeb',
          borderBottom: '1px solid #fbbf24',
          padding: '8px 12px',
          fontSize: '11px',
          fontFamily: 'ui-monospace, monospace',
          color: '#78350f',
        }}>
          <div><strong>DIAGNOSTICS</strong></div>
          <div>Host: {diagnostics.hostName} / {diagnostics.platform} / v{diagnostics.hostVersion}</div>
          <div>Account: {diagnostics.userEmail ?? '(none)'}</div>
          <div>
            Mailbox: 1.5={diagnostics.supportsMailbox15 ? '✓' : '✗'}
            {' '}1.6={diagnostics.supportsMailbox16 ? '✓' : '✗'}
            {' '}1.7={diagnostics.supportsMailbox17 ? '✓ pin OK' : '✗ NO PIN'}
            {' '}1.8={diagnostics.supportsMailbox18 ? '✓' : '✗'}
            {' '}1.9={diagnostics.supportsMailbox19 ? '✓' : '✗'}
          </div>
        </div>
      )}
      <AddinAuthGate>
        <OfficeItemProvider>
          <PinHint />
          {itemType === 'appointment' ? <CalendarContextPanel /> : <MessageContextPanel />}
          <footer className="border-t border-gray-200 px-3 py-2 flex gap-3 text-xs text-gray-500">
            <Link href="/addin/setup" target="_blank" className="hover:text-gray-900">Projects</Link>
            <Link href="/addin/review" target="_blank" className="hover:text-gray-900">Review</Link>
            <Link href="/addin/settings" target="_blank" className="hover:text-gray-900">Settings</Link>
          </footer>
        </OfficeItemProvider>
      </AddinAuthGate>
    </>
  );
}
