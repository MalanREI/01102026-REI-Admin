// Opens the Supabase sign-in page in an Office Dialog.

/// <reference types="office-js" />

export type DialogAuthResult = { ok: true } | { ok: false; reason: string };

export function openSignInDialog(): Promise<DialogAuthResult> {
  return new Promise((resolve) => {
    if (!Office?.context?.ui?.displayDialogAsync) {
      resolve({ ok: false, reason: 'Office Dialog API not available' });
      return;
    }
    const url = `${window.location.origin}/addin/auth`;
    Office.context.ui.displayDialogAsync(
      url,
      { height: 60, width: 30, displayInIframe: false },
      (asyncResult) => {
        if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
          resolve({ ok: false, reason: asyncResult.error?.message ?? 'Dialog failed to open' });
          return;
        }
        const dialog = asyncResult.value;
        dialog.addEventHandler(
          Office.EventType.DialogMessageReceived,
          (arg) => {
            const msgArg = arg as { message?: string };
            try {
              const payload = JSON.parse(msgArg.message ?? '{}');
              if (payload?.status === 'signed-in') {
                dialog.close();
                resolve({ ok: true });
              } else {
                resolve({ ok: false, reason: payload?.error ?? 'Sign-in cancelled' });
                dialog.close();
              }
            } catch {
              resolve({ ok: false, reason: 'Malformed dialog message' });
              dialog.close();
            }
          },
        );
        dialog.addEventHandler(
          Office.EventType.DialogEventReceived,
          (arg) => {
            const evtArg = arg as { error?: number };
            if (evtArg.error === 12006) {
              resolve({ ok: false, reason: 'User closed dialog' });
            }
          },
        );
      },
    );
  });
}
