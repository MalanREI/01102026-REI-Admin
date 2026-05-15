/// <reference types="office-js" />

export type OfficeDiagnostics = {
  hostName: string;
  platform: string;
  hostVersion: string;
  supportsMailbox15: boolean;
  supportsMailbox16: boolean;
  supportsMailbox17: boolean;
  supportsMailbox18: boolean;
  supportsMailbox19: boolean;
  userEmail: string | null;
};

export function readOfficeDiagnostics(): OfficeDiagnostics {
  const ctx = Office?.context;
  const diag = ctx?.diagnostics;
  const mailbox = ctx?.mailbox;

  function isSetSupported(name: string, version: string): boolean {
    try {
      return !!Office.context?.requirements?.isSetSupported(name, version);
    } catch {
      return false;
    }
  }

  return {
    hostName: String(diag?.host ?? 'unknown'),
    platform: String(diag?.platform ?? 'unknown'),
    hostVersion: diag?.version ?? 'unknown',
    supportsMailbox15: isSetSupported('Mailbox', '1.5'),
    supportsMailbox16: isSetSupported('Mailbox', '1.6'),
    supportsMailbox17: isSetSupported('Mailbox', '1.7'),
    supportsMailbox18: isSetSupported('Mailbox', '1.8'),
    supportsMailbox19: isSetSupported('Mailbox', '1.9'),
    userEmail: mailbox?.userProfile?.emailAddress ?? null,
  };
}
