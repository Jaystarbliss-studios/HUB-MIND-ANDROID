# Jess Windows Desktop Agent — Gap Report

Audit date: 2026-10-12. PR #66 is merged to main. The cross-platform CI, Windows native helper builds, and Windows installer packaging have passed; the packaged installer has not yet been installed and exercised on a real Windows machine.

## Current architecture

- `electron/main.cjs` creates the workspace and companion window, maintains Full Control Session state, records native action/session events in `jess-native-audit.jsonl`, enforces a method allowlist, owns the consent-gated offline wake process, and offers an explicit per-user Windows sign-in startup toggle.
- `electron/preload.cjs` exposes a narrow context-isolated bridge; renderer code cannot directly access Node child processes or the filesystem.
- `electron/agentBridge.cjs` and `electron/jess-agent.ps1` still provide the Windows desktop UI Automation/Win32 sidecar. This is not yet replaced by a .NET implementation.
- `native/JessChromeNativeHost` is a .NET 8 self-contained Chrome Native Messaging relay. `electron/chromeBridge.cjs` connects it to the Electron main process over a named pipe. The extension is in `chrome-extension/`.
- `native/JessOfflineWake` is a .NET 8 Windows helper using `System.Speech` for local wake-word detection. The desktop asks for consent before enabling the microphone listener. A compatible Windows speech recognizer/language pack and microphone are required.
- `electron-builder.yml` includes the extension, native host, offline wake helper and per-user install/uninstall scripts as extra resources. The Windows workflows now publish the native helpers before packaging.
- Native action success is reported by the primary tool wrapper only when both `ok: true` and `verified: true`. Injection-only mouse/keyboard operations intentionally remain unverified until follow-up evidence is available.

- `native/JessWindowsOcr` is a .NET 8 helper using Windows.Media.Ocr. If UI Automation returns no text, the desktop captures the primary monitor, runs local OCR, deletes the temporary screenshot, and returns recognized text with its source and bounds.

## Feature audit

| Capability | Implementation state | Validation still required |
|---|---|---|
| Window listing, focus, close, minimize, maximize, restore, move, resize, snap | Implemented in the PowerShell sidecar and allowlisted IPC | Test against real Windows applications and DPI/multi-monitor setups |
| Mouse, typing, key combinations | Implemented; input delivery is not proof of target effect | Verify Notepad and real app postconditions |
| Screenshot and UI Automation text | Implemented through Win32/UIA | Test capture visibility, screen bounds, protected/secure desktop behavior |
| Jess orb, tray, emergency stop | Native overlay restores the original `/icon.svg` Jess orb, stays visible over the workspace and desktop, includes a cross-window transcript panel, and passes clicks through transparent regions except while interacting with the orb/transcript | Verify packaged visibility, hotkey registration and stop behavior on real Windows |
| Workspace foreground recovery | Desktop-only tool waits for visible and focused main window; showing/restoring workspace no longer hides the always-on-top companion | Real-machine acceptance test |
| Minimized conversation transcript | Voice transcript entries are cached in same-origin localStorage and mirrored into the native companion window | Verify multi-window storage events and transcript continuity in packaged runtime |
| Chrome tab list/open/close/activate/navigate/reload/scroll/read/find/click/fill | Implemented through MV3 extension, .NET 8 native host and named-pipe relay; gated by the signed-in Full Control Session | Build installer, register host, load unpacked extension and test against a real Chrome profile |
| Native offline wake word | Consent-gated .NET 8 helper using Windows System.Speech; falls back to browser recognition outside the desktop shell | Verify recognizer availability, microphone access, false wakes, latency and cleanup on Windows |
| Installer and extension packaging | Windows workflow now builds the three self-contained .NET helpers and packages extension/installer scripts | Latest CI must pass and artifacts must be downloaded/installed |
| Elevated administrator actions / elevated scheduled task | Not implemented; the app provides an opt-in per-user Windows sign-in startup toggle instead | A privileged broker requires a separate threat model, UAC consent and security review; the full Electron app must not run elevated by default |
| Installer code signing | Workflow supports optional signing through protected `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` secrets | Output remains unsigned until the certificate secrets are configured; signed output must be verified |
| OCR fallback | Implemented with Windows.Media.Ocr when UI Automation exposes no text | Must compile, have an installed OCR language, and be tested on real screenshots before relying on it |
| Secure desktop, password prompts, DRM and protected browser pages | Restricted by platform and application security | Must remain unsupported; never bypass OS protections |

## Changes in this branch

1. Keeps the native Jess companion overlay visible both over the workspace and when Hub-Mind is minimized; restores the original `/icon.svg` icon instead of the changed `/jess-orb.svg` asset.
2. Adds a compact transcript panel that receives user/Jess voice transcript updates across desktop windows.
3. Improves real desktop window activation with BringWindowToTop before SetForegroundWindow, and clarifies how Jess should use the window-management tools.
4. Enforces verified-result honesty for native Windows actions.
2. Reuses the emergency stop hotkey and adds tray stop/reset controls.
3. Fixes workspace restoration and adds a foreground tool with a visible/focused postcondition.
4. Adds a Chrome Native Messaging relay, Chrome extension tool declarations, per-user registry install/uninstall scripts, and CI packaging for the extension and host.
5. Gates Chrome requests on the current signed-in Full Control Session; closing a tab requires an explicit tab ID.
6. Cancels pending Chrome requests and stops the PowerShell sidecar when Full Control Session ends.
7. Adds an opt-in offline Windows wake helper; the desktop prompts before enabling local microphone listening.
8. Adds static contract tests for the Chrome bridge and native host build wiring.

## Chrome bridge installation

The packaged installer places `Install-JessChromeBridge.ps1` and `Uninstall-JessChromeBridge.ps1` in the app's `resources` directory. After installing Hub-Mind, run the installer script from that directory in the current user's PowerShell session. It registers the native host under HKCU and copies the extension into the user's LocalAppData folder. Then open `chrome://extensions`, enable Developer mode, and choose **Load unpacked** for the copied extension folder. The extension is not silently installed into Chrome.

## Release acceptance checklist — not yet completed

- Confirm the merged main-branch CI is green, including Windows native helper publish and NSIS packaging. (Completed for merge commit `eebe793cd0bccf458d8a15de705b9ed09a59f125`.)
- Install the produced Windows package and confirm the .NET native host and offline wake executable exist under the packaged resources.
- Register the Chrome host and load the extension; verify listing tabs, opening/navigating, reading a page and filling a test field.
- Confirm closing a tab without a tab ID is rejected and emergency stop cancels outstanding work.
- Accept the offline wake prompt, say “Hey Jess, open Notepad”, verify the command is handled, then confirm listening stops during the active voice session and restarts only after the session ends.
- Test window listing, snap, UIA text, typing, mouse input, orb transitions and Ctrl+Alt+Shift+J.
- Confirm no action is described as successful unless independent evidence supports it.

## Still outstanding

The Chrome bridge, consent-gated offline wake-word listener and Windows.Media.Ocr fallback are present in source. The companion overlay/transcript and window-focus fixes are implemented in this branch; the self-contained helpers plus NSIS installer previously built successfully in CI. Their packaged runtime behavior remains unverified until the installer is installed and tested on a real Windows machine. Administrator elevation/scheduled-task integration remain intentionally unimplemented because a privileged broker requires a separate threat model, explicit UAC consent and security review. The published installer is unsigned unless protected certificate secrets are configured. Do not describe the feature as fully runtime-accepted until the real-machine acceptance checklist above passes.
