# Jess Full-Control Parity — Engineering Checklist

This document is a live checklist for the work requested in the October 2026 desktop-control pass. It is not a declaration that the work is complete.

## Implemented in this work branch

- Electron main-process preferences now model `ask`, `allow-routine`, and `allow-everything`.
- Preferences persist under Electron `userData`, including Full Control, launch-on-start, and the high-impact spoken-confirmation preference.
- First-time activation of Allow everything presents a native confirmation and stores the accepted consent.
- An internal main-process session secret is created for an active Full Control session; privileged IPC still validates the trusted top-level sender frame.
- Allow everything suppresses per-call MCP approval only when the active main-process session and mode both confirm it. Other modes keep per-call approval.
- Jess Settings has automatic save, a Full Control master switch, three permission modes, launch preference, high-impact preference, and live mode/session feedback.
- Jess's system prompt no longer insists on the spoken phrase when the main process already says the session is active.
- The NSIS installer is configured for per-machine installation.

## Not complete / must be verified before merge

- [ ] Typecheck, unit tests, app build, Windows packaging, and native Windows smoke tests.
- [ ] Prevent duplicate concurrent first-consent prompts and verify cancellation/retry behavior under slow Firestore snapshots.
- [x] Spoken yes/no confirmation gate for classified high-impact tools (file write/move/rename/recycle, high-impact commands, and named send/delete/format/shutdown/transfer/purchase tools) requires a fresh affirmative transcript for the exact same tool arguments; [ ] real microphone acceptance and tool-classification coverage on Windows.
- [x] Removed stale activation-phrase requirement from the Full Control tool declaration; the main-process live session remains authoritative.
- [x] Sidecar scroll now reinterprets signed wheel deltas correctly and supports horizontal wheel input.
- [x] Sidecar: C# SendInput keyboard helper, F1–F24/extended/media key support, bounded hold timing; real Notepad type/key verification still requires Windows acceptance.
- [x] Clipboard text read/write/clear with readback and paste through Ctrl+V; [x] show desktop, minimize all, Start menu, switch window by handle/z-order.
- [x] Unified app resolution covers Start Menu/AppUserModelID, App Paths, PATH executables, and allowlisted URI schemes; [ ] verify launches on real Windows apps and edge cases.
- [x] Three-way left/center/right snapping, per-window monitor metadata, optional monitor-targeted snapping, and per-monitor DPI awareness; [ ] verify mixed-DPI multi-monitor placement on real hardware.
- [x] Bounded file list/read/write/copy/move/rename/search and Recycle Bin deletion, with no-overwrite copy/move, 1 MiB source-file limit, 100,000-character paginated reads (`offset`/`nextOffset`), and output-size limits; [x] bounded command execution with process-tree timeout termination; arbitrary destructive PowerShell commands remain blocked.
- [x] Sidecar lifecycle/crash/action-timeout logging, bounded protocol lines, and automatic restart on the next request; [ ] diagnose maximize-triggered agent exit from real audit logs and verify restore handlers.
- [x] Add a Windows-MCP McpBridge preset that disables anonymous telemetry and excludes PowerShell, Registry, Process, FileSystem, and Screenshot tool groups; safe non-secret env values are allowlisted. [ ] install/launch Windows-MCP on a real PC and verify text snapshots and tool annotations.
- [ ] Correct success contract and postcondition verification for input, click, and keyboard actions.
- [x] Keep the native orb visible over the workspace and other apps, while the in-app duplicate remains hidden in desktop mode; [x] show a thumbnail picker for screens/windows and auto-select the primary screen for user-triggered sharing only in explicitly enabled Allow everything mode.
- [x] Chrome nested-container scrolling can target a labelled container and reports actual movement; [x] Settings setup button and live native-host connection status; [x] per-user token handshake on the named pipe; [ ] screenshots and non-managed-PC acceptance test.
- [x] Jess prompt now receives the bundled package version and official workspace URL, and is instructed to verify older releases through official GitHub releases/tags rather than inventing them.
- [x] The native system-info response includes the running Electron app version; the live prompt instructs Jess to query it instead of guessing. [ ] verify historical release/tag retrieval works through actual live internet tools.
- [x] Memory service now filters narrowly matched assistant-capability claims from local and fetched memories and attempts to remove matching Firestore records; new matching claims are rejected as memories.
- [x] The live system prompt instructs Jess to refresh relevant memories at the start of every user turn and treat them as untrusted historical notes; native capabilities are enumerated from the current tool registry. [ ] confirm this behavior in a real live voice session.
- [ ] Voice-only acceptance run on a real Windows desktop for every user-provided utterance.

## Windows elevation boundary

Per-machine installation is configured. This branch does **not** configure a highest-privilege logon task to silently elevate the app or its child processes. That would turn the installer into a persistent UAC-consent bypass. If elevated operation is needed, use an explicit, documented Windows administrator setup with visible consent and least privilege. Windows secure-desktop/UAC prompts cannot be automated by Jess.

## Acceptance commands

Run `npm run verify:jess`, `npm run typecheck`, `npm run test:unit`, `npm run build`, and `npm run desktop:package:win` in CI. Then run the voice-only acceptance list on Windows and record evidence in `jess-native-audit.jsonl`. Do not mark an action verified solely because input injection returned.
