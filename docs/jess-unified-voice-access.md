# Jess unified voice and accessibility integration

## Goal

Unify Windows Voice Access-inspired interaction patterns, selected Wheelhouse ideas, and Hub-Mind's existing Jess runtime without creating duplicate microphones, command routers, native helpers, or browser bridges.

The product outcome is one Jess experience: spoken requests are transcribed/interpreted, routed to the right existing tool, authorized by the Electron main process, executed through the appropriate desktop or browser adapter, and verified before Jess claims success.

## Existing components to preserve

- `src/services/liveAudioClient.ts`: the primary interactive, low-latency voice session and tool-call orchestration.
- `src/services/jessWakeListener.ts` and `native/JessOfflineWake`: the existing optional local Windows wake listener. It is not a second full-time command engine.
- `electron/main.cjs`: authoritative Full Control state, permission checks, action allowlists, auditing and IPC.
- `electron/agentBridge.cjs` + `electron/jess-agent.ps1`: the existing Windows desktop action sidecar and UI Automation layer.
- `electron/chromeBridge.cjs` + `native/JessChromeNativeHost` + `chrome-extension`: the existing authenticated Chrome native-messaging transport.
- `src/shared/jessNativeToolNames.ts` and `src/lib/jessTools.ts`: canonical native-tool availability and tool routing.

Do not add a parallel Electron native helper or a second Chrome bridge.

## Implemented on the feature branch

1. **Chrome handshake framing fix.** The desktop bridge's `hello-ack` must end in a real newline. The native helper waits with `ReadLineAsync()`; a literal backslash followed by `n` leaves the helper waiting and blocks authentication.
2. **Regression test for handshake framing.** The native bridge test asserts the exact line delimiter so the issue is caught by CI.
3. **Numbered UI Automation controls.** `list_windows_ui_elements` returns up to 50 visible, enabled controls in the foreground window with temporary indices, accessible names, automation IDs, roles and bounds.
4. **Stale-target protection.** Numbered invocation requires both the temporary index and exact `expectedName`; the native helper re-enumerates the foreground window and refuses the action if the element name no longer matches.
5. **Accessibility-first voice guidance.** Jess is instructed to prefer UI Automation, then keyboard/native shortcuts, then coordinates as a fallback.
6. **Command/dictation separation.** Explicit dictation is treated as literal content; it is not reinterpreted as commands. The intended target application must be foreground before typing.

These changes require CI and real Windows acceptance before they can be considered verified.

## Integration rules

### Single microphone owner

- The active Gemini Live session remains the primary conversational voice path.
- The optional local Windows wake listener runs only while waiting for the wake phrase and stops when it fires.
- Do not run a Wheelhouse listener or another local STT loop concurrently with Gemini Live or the wake listener.
- If offline full voice control is added, it must be an explicit mode transition with one owner of microphone capture at a time, visible status, cancellation and deterministic shutdown.

### Speech providers are replaceable

A future local speech provider should sit behind a small interface for start, stop, transcript events, readiness, errors and health. Keep provider selection separate from command execution. Benchmark Wheelhouse's local engines on supported hardware and check model size, CPU/RAM cost, packaging, licenses and offline behavior before selecting one. Do not embed an entire Wheelhouse UI or start its app as a competing assistant.

### One command router and one authorization boundary

All speech-originated actions use the same existing Jess tool declarations and Electron main-process allowlists as typed or AI-originated requests. Speech recognition is not consent. The renderer must not bypass main-process permission checks. Preserve Full Control gating, high-risk confirmations, cancellation, audit events and Windows privilege boundaries.

### Desktop and browser adapters stay separate

- Use UI Automation for accessible Windows controls.
- Use keyboard/native actions where they are more reliable.
- Use visual/coordinate actions only as a fallback and validate the target immediately before acting.
- Use the existing Chrome extension for page DOM and tab operations.
- Never use browser DOM tooling to claim control of another native Windows application.

### Feedback and verification

Expose listening/connection status, show the recognized text when practical, describe the planned action for ambiguous or consequential requests, and report failures honestly. Distinguish an action being sent from an action being verified. Refresh temporary UI element indices after navigation, window changes or ambiguous results.

## Next implementation phases

1. **Repair and validate transport**
   - Run bridge contract tests and all CI workflows.
   - Test install/repair, extension registration, native host launch, token authentication, hello acknowledgement, request/response correlation, disconnect/reconnect and Full Control stop.
   - Add clear diagnostic status so "extension installed", "native host launched", "pipe connected", "authenticated" and "action verified" are not collapsed into one boolean.

2. **Finish accessible control interaction**
   - Test numbered UIA listing and stale-index rejection on Notepad, File Explorer, Settings, Chrome and a UIA-poor application.
   - Add supported SelectionItem/Toggle/ExpandCollapse patterns only where they are safe and testable.
   - Keep coordinate labels/overlays as a separate future enhancement; do not claim native Voice Access's exact overlay behavior has been reproduced yet.

3. **Unify command and dictation UX**
   - Add explicit, discoverable command/dictation modes using the existing voice session.
   - Support punctuation, new lines, selection, correction, undo and literal dictation where the target application supports them.
   - Make "what can I say?" describe the actual available tools and current connection/permission state.

4. **Evaluate Wheelhouse reuse**
   - Review its Apache-2.0 license, notices and each dependency's license.
   - Benchmark local speech models on supported Windows hardware, including CPU load, RAM, model download size and first-run setup.
   - Prefer reusable engine adapters or algorithms over copying its whole UI/process architecture.
   - Only ship a local provider after microphone exclusivity, fallback, cancellation, model packaging and uninstall behavior are tested.

5. **Release acceptance**
   - Run TypeScript/unit/contract tests, Firestore security tests, PowerShell syntax checks, .NET builds and Windows installer packaging.
   - On a real Windows PC, test voice-only navigation, dictation, numbered controls, Chrome actions, focus changes, mixed-DPI monitors, microphone denial, service crashes, cancellation, high-risk confirmation and clean installation.
   - Do not merge or publish a release until CI passes and the owner has completed the real-device checks.

## Acceptance criteria

- The Chrome bridge reaches an authenticated state and returns correlated responses.
- Reconnecting after Chrome/native-host restart does not leave a stale client or duplicate pending requests.
- Only one speech capture path owns the microphone at a time.
- Accessible control actions prefer semantic UI Automation and reject stale numbered targets.
- Dictated text is not executed as commands.
- All native/browser actions pass through the existing permission and audit path.
- Jess never claims success without returned evidence.
- Packaged installation and upgrade paths contain the same helper and extension assets as development builds.
