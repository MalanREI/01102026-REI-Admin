'use client';
import { useEffect } from 'react';

/// <reference types="office-js" />

export default function CommandsPage() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof Office !== 'undefined' && Office.onReady) {
      Office.onReady(() => {
        // No function associations needed in Phase 6.
      });
    }
  }, []);

  return <div style={{ display: 'none' }}>Commands</div>;
}
