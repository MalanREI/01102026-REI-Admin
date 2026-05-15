// Resolves once Office.js is loaded and ready inside the host application.

/// <reference types="office-js" />

export type OfficeHostInfo = {
  host: Office.HostType;
  platform: Office.PlatformType;
};

export async function waitForOffice(): Promise<OfficeHostInfo> {
  if (typeof window === 'undefined') {
    throw new Error('waitForOffice called outside browser context');
  }
  if (typeof Office === 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (typeof Office !== 'undefined') {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > 10_000) {
          clearInterval(timer);
          reject(new Error('Office.js failed to load within 10s'));
        }
      }, 50);
    });
  }
  const info = await Office.onReady();
  return {
    host: info.host,
    platform: info.platform,
  };
}

export type CurrentMessageContext = {
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  internetMessageId: string | null;
};

export function readCurrentMessage(): CurrentMessageContext {
  const item = Office.context?.mailbox?.item;
  if (!item) {
    return { subject: null, fromEmail: null, fromName: null, internetMessageId: null };
  }
  return {
    subject: item.subject ?? null,
    fromEmail: item.from?.emailAddress ?? null,
    fromName: item.from?.displayName ?? null,
    internetMessageId: item.internetMessageId ?? null,
  };
}

export function subscribeItemChanged(onChange: () => void): () => void {
  const mailbox = Office.context?.mailbox;
  if (!mailbox) return () => {};
  mailbox.addHandlerAsync(Office.EventType.ItemChanged, onChange, () => {});
  return () => {
    mailbox.removeHandlerAsync(Office.EventType.ItemChanged, () => {});
  };
}
