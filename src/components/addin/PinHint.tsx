'use client';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pinHintDismissed';

export default function PinHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const dismissed = data?.preferences?.[STORAGE_KEY] === true;
        if (!cancelled && !dismissed) setShow(true);
      } catch { /* silent */ }
    }
    void check();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(async () => {
    setShow(false);
    try {
      const current = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
      const currentData = current.ok ? await current.json() : { preferences: {} };
      const nextPreferences = { ...(currentData.preferences ?? {}), [STORAGE_KEY]: true };
      await fetch('/api/user-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: nextPreferences }),
      });
    } catch { /* silent */ }
  }, []);

  if (!show) return null;

  return (
    <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-900">
      <div className="flex items-start justify-between gap-2">
        <p className="leading-relaxed">
          <strong>Tip:</strong> Click the pin icon at the top of this pane to keep it open as you
          move between emails and calendar events.
        </p>
        <button onClick={() => void dismiss()} className="text-blue-700 hover:text-blue-900" aria-label="Dismiss tip">
          ×
        </button>
      </div>
    </div>
  );
}
