# Hub-Mind Windows desktop controls

The Windows installer wraps the existing Hub-Mind web workspace in Electron. The main window stays online and uses the same authenticated workspace. The Jess companion is a separate, always-on-top, icon-sized window.

## Overlay controls
- Drag the Jess orb to move it.
- Select the orb or the expand control to show the full workspace.
- Select X to hide the orb.
- Close the main workspace window to hide that window and keep Jess available.
- Use the Hub-Mind system-tray menu to reopen the workspace, show Jess, or explicitly quit.

## Screen sharing
The desktop build exposes the installed-app marker through the isolated preload bridge and delegates screen capture to Electron's display-media handler. Where Windows/Electron supports its native picker, it is preferred. On fallback paths, Hub-Mind asks before sharing the entire screen. The user must still choose to begin sharing in the app's normal share flow and can stop sharing from the UI.

## Native actions
Jess can:
- Open a public URL in the default browser.
- Open a selected local path with its default Windows application.
- Launch approved applications (Calculator, Notepad, Paint, Explorer, Task Manager, Edge, Chrome, Word, Excel, PowerPoint, Teams and VS Code).
- Run approved read-only diagnostics (IP configuration, system information, and process listing).
- Request a PowerShell command for a specific purpose.

Native operations use a context-isolated preload API; renderer Node integration remains disabled. The main process verifies the trusted app origin. Application launches, URL/path opening, diagnostics, and arbitrary command requests require an OS confirmation dialog. The command dialog displays the exact PowerShell command and purpose. Commands run as the signed-in Windows user, not elevated. A set of high-risk destructive command patterns is blocked. Review commands before approving them, and do not approve instructions copied from untrusted webpages.

## Web access
Jess's research tool calls the Hub-Mind server endpoint for Google Search grounding. Search results and webpage content are treated as untrusted data. The Windows app does not bypass authentication for private GitHub or Google Drive content; those services need their explicit, authorized integrations.

## Installer release
The Windows workflow builds an NSIS installer and publishes it as a GitHub release asset. The public homepage only exposes the download link when it can find a published .exe. A real Windows smoke test is required after each installer refresh, especially for screen sharing, Google sign-in popups, and overlay dragging.
