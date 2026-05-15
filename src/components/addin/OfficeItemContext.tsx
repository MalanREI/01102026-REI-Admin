'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  readCurrentMessage,
  readCurrentUserEmail,
  subscribeItemChanged,
  type CurrentMessageContext,
} from '@/src/lib/office/office-ready';

export type OfficeItemState = {
  message: CurrentMessageContext;
  userEmail: string | null;
  refreshNonce: number;
};

const OfficeItemContext = createContext<OfficeItemState | null>(null);

export function OfficeItemProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OfficeItemState>(() => ({
    message: readCurrentMessage(),
    userEmail: readCurrentUserEmail(),
    refreshNonce: 0,
  }));

  useEffect(() => {
    const unsubscribe = subscribeItemChanged(() => {
      setState((prev) => ({
        message: readCurrentMessage(),
        userEmail: readCurrentUserEmail(),
        refreshNonce: prev.refreshNonce + 1,
      }));
    });
    return unsubscribe;
  }, []);

  return (
    <OfficeItemContext.Provider value={state}>{children}</OfficeItemContext.Provider>
  );
}

export function useOfficeItem(): OfficeItemState {
  const ctx = useContext(OfficeItemContext);
  if (!ctx) {
    throw new Error('useOfficeItem must be used inside OfficeItemProvider');
  }
  return ctx;
}
