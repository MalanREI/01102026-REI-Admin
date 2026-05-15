# Outlook Desktop Sideload (macOS)

This document records how to sideload the Alans Workspace add-in into Outlook for Mac during development.

## Prerequisites

- Outlook for Mac version 16.x (verified working on 16.108.2)
- Running Next.js dev server with HTTPS: `npm run dev:addin`
- Self-signed cert trusted system-wide (see Phase 6 setup)

## Install

```bash
# From the repo root
mkdir -p ~/Library/Containers/com.microsoft.Outlook/Data/Documents/wef
cp manifest.xml ~/Library/Containers/com.microsoft.Outlook/Data/Documents/wef/alans-workspace-manifest.xml
```

Then **completely quit and restart Outlook** (Cmd+Q, wait 5 seconds, reopen). Outlook reads the WEF folder on startup. Mid-session restarts won't pick up changes.

## Verify install

After Outlook restarts:

1. Click any email in the inbox to open it in the reading pane.
2. In the message's toolbar (above the email body), look for "..." or the apps icon.
3. You should see "Alans Workspace · Show Workspace" in the menu.
4. Click it. The task pane opens on the right side of Outlook.

## Pinning

In Outlook desktop, the task pane has a push-pin icon in its own header (top-right of the pane content area, NOT the Outlook window chrome). Click it once. The pane will now persist as you click between emails.

## Updating

If the manifest changes:
1. Update the file in this repo
2. Re-copy to WEF: `cp manifest.xml ~/Library/Containers/com.microsoft.Outlook/Data/Documents/wef/alans-workspace-manifest.xml`
3. Quit and restart Outlook

If only React/TS code changes (no manifest changes), the dev server's hot reload handles it. Just close and reopen the task pane in Outlook.

## Removing

```bash
rm ~/Library/Containers/com.microsoft.Outlook/Data/Documents/wef/alans-workspace-manifest.xml
```

Then restart Outlook.

## Troubleshooting

- **Task pane shows blank**: check the dev server is running (`npm run dev:addin`) and cert is trusted (`https://localhost:3000/icons/icon-64.png` in browser should show a blue square with a lock icon).
- **"Add-in could not start" error**: usually means the cert isn't trusted by Outlook's WebView. Outlook on macOS uses WKWebView which reads from the system keychain. The same trust setup that works for Chrome should work here — see Phase 6 cert troubleshooting.
- **Add-in doesn't appear in ribbon**: confirm `wef/` folder exists and contains the manifest. Verify Outlook was fully quit (Cmd+Q) before reopening, not just window-closed.
- **Ribbon shows the add-in but task pane button is grayed out**: requirements mismatch — check the manifest's `<Requirements>` block.
