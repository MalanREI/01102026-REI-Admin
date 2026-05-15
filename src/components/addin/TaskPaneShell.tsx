'use client';
import { useEffect, useState } from 'react';
import AddinAuthGate from './AddinAuthGate';
import MessageContextPanel from './MessageContextPanel';
import CalendarContextPanel from './CalendarContextPanel';
import PinHint from './PinHint';
import { waitForOffice, type OfficeHostInfo } from '@/src/lib/office/office-ready';

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

  useEffect(() => {
    waitForOffice()
      .then(setOfficeReady)
      .catch((err) => setOfficeError(err.message ?? String(err)));
  }, []);

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
    <AddinAuthGate>
      <PinHint />
      {itemType === 'appointment' ? <CalendarContextPanel /> : <MessageContextPanel />}
    </AddinAuthGate>
  );
}
