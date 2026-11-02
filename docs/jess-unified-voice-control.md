# Jess Unified Voice Control Integration

## Goal

Make Jess the single user-facing voice-control system for Hub-Mind: reliable dictation, direct voice commands, accessible Windows control, browser automation, clear listening states, and verified actions. Reuse compatible Wheelhouse ideas and Windows accessibility APIs without embedding a second full assistant or duplicating microphones, command routers, permission checks, or UI.

## Existing building blocks (audit baseline)

- `src/services/liveAudioClient.ts`: primary real-time conversational audio, audio worklet/worker processing, transcript and tool-call flow.
- `native/JessOfflineWake`: consent-gated local Windows wake-word listener using `System.Speech`; Electron stops it when it emits a wake event.
- `src/components/VoiceDictation.tsx`: separate, user-triggered browser speech-recognition control for text fields.
- `electron/agentBridge.cjs` + `electron/jess-agent.ps1`: Windows native desktop actions and UI Automation.
- `electron/chromeBridge.cjs` + `native/JessChromeNativeHost` + `chrome-extension`: authenticated native-messaging bridge to Chrome.
- `src/shared/jessNativeToolNames.ts` and `src/lib/jessTools.ts`: shared tool contract and orchestration.
- `electron/main.cjs` / `electron/preload.cjs`: desktop IPC authority, consent and permission enforcement.

## Target architecture

1. **One voice session coordinator in Jess.** Model the states as `idle`, `wake-listening`, `connecting`, `live-conversation`, `dictation`, `command-execution`, `muted`, and `error`. Only one primary microphone consumer may own capture at a time. The local wake listener must stop before live conversation or explicit dictation begins and may resume after the live session ends if consent remains granted.
2. **One intent router.** Route user speech into either literal dictation, a direct deterministic command, or an AI-planned request. Never infer an executable command from text currently being dictated. Support a literal-dictation escape and a visible transcript/command preview.
3. **One action registry.** Keep `JESS_NATIVE_TOOL_NAMES` as the canonical capability list. Reuse existing tools for Windows UI Automation, keyboard/mouse, OCR, window management and Chrome. Do not create parallel tool names that call the same implementation.
4. **Layered Windows targeting.** Prefer UI Automation names, roles and supported control patterns; then use keyboard/native APIs; use visual/coordinate targeting only as a bounded fallback. Revalidate the foreground window and target before acting.
5. **One permission authority.** Electron main-process IPC remains the enforcement boundary for Full Control, user/session scope, confirmations, cancellation and audit. Speech engines and model output never authorize actions by themselves.
6. **Local-first speech service.** Evaluate Wheelhouse's speech pipeline and licenses; benchmark a compatible local STT engine on the actual target PC before selecting a runtime. Keep cloud recognition explicitly opt-in. Do not ship an unreviewed Python environment or model download in the installer.
7. **Verified execution.** Each action reports `ok`, `verified`, evidence and a safe error. Unknown outcomes must not trigger blind retries for non-idempotent actions.

## Implementation sequence

### Phase A — restore and diagnose the native bridges

- Make the Chrome named-pipe server recover after transient listener errors.
- Surface native-host startup/handshake failures through stderr without leaking tokens.
- Add integration diagnostics that distinguish: server not listening, native host not installed, extension not loaded, pipe not connected, token/handshake rejected, and Full Control disabled.
- Verify the Electron native-action sidecar and Chrome bridge independently before connecting them to new voice features.
- Add tests for protocol contracts, restart behavior, error reporting and safe failure.
- Manually validate on Windows: install/repair bridge, launch Chrome, inspect extension errors, check status, list tabs, open a tab, read a page, stop Full Control, and confirm requests are rejected.

### Phase B — unify microphone ownership

- Add a small voice-session coordinator and use it in the live audio client, offline wake lifecycle and explicit dictation control.
- Preserve consent and make microphone ownership visible.
- Ensure wake listening pauses during a live session and resumes only after a clean stop/disconnect.
- Make device changes, permission denial and worker failure release capture before retrying.
- Do not run a second speech recognizer in parallel to the active owner.

### Phase C — Windows Voice Access-style interaction

- Add deterministic voice commands for help, sleep/wake, mute, app/window switching, scrolling, keyboard shortcuts and named UI controls.
- Add numbered UI Automation labels and clear disambiguation when names are duplicated.
- Improve dictation editing: punctuation, new line, select/correct last phrase, undo and literal-dictation mode.
- Preserve a visible transcript, current mode, microphone state and cancellable action progress.
- Keep Windows secure desktop/UAC boundaries intact.

### Local speech runtime now implemented

- The packaged `JessOfflineWake.exe` now has two explicit modes: the existing consent-gated wake-word listener and user-triggered local dictation through Windows `System.Speech`.
- Desktop dictation uses the same native speech process and Electron IPC rather than opening a second browser recognizer. The shared renderer microphone coordinator still arbitrates live conversation versus dictation; the wake listener is stopped before either begins.
- Browser-based speech recognition remains the fallback for the web workspace when the native desktop API is unavailable.
- This is the lightweight Windows-native offline path, not a bundled Wheelhouse Parakeet model. Model-based local STT remains a separate benchmarked option; do not bundle a second recognizer until accuracy, memory use, model licensing and CPU latency have been measured on the target PC.
- Offline dictation requires a compatible Windows speech recognition language/engine. A missing engine or microphone failure is surfaced as an actionable error rather than silently falling back to cloud recognition.

### Phase D — Wheelhouse-inspired local speech

- Audit Wheelhouse source, dependency licenses, model licenses, CPU/RAM use and packaging.
- Benchmark at least one CPU-friendly local model on target hardware for latency, accuracy, memory and cold-start.
- Implement the chosen engine behind a small adapter, not directly inside UI components.
- Support offline dictation and direct commands only after quality and resource tests pass.
- Keep the existing real-time conversational audio path as a deliberate mode, not a duplicate always-on recognizer.

### Phase E — unified browser/desktop execution

- Reuse the current Chrome extension for web-page DOM interactions and the native UI Automation helper for desktop controls.
- Route both through the same tool registry, execution IDs, permission policy and audit format.
- Add status/help for bridge readiness and actionable repair instructions.
- Verify results after actions; never treat a sent click or keypress as proof that the requested task succeeded.

### Phase F — packaging and release

- Include only selected, license-reviewed runtime binaries and models.
- Ensure clean install, upgrade, repair and uninstall behavior.
- Run unit/contract/security tests, TypeScript checks, production build, native helper builds and Windows installer packaging.
- Perform real Windows acceptance tests before publishing a release.

## Screen capture and visual verification

- The native Windows screenshot tool defaults to the primary monitor in standard detail (longest edge capped at 1920 pixels, JPEG quality 82).
- For closer visual inspection, call the same tool with `detail: "high"` and an exact `monitorName` from the desktop's monitor/window diagnostics. High detail captures one monitor up to 3200 pixels on the longest edge at JPEG quality 92.
- Use `monitorName: "all"` only with standard detail. High-detail multi-monitor captures are rejected deliberately to bound memory and IPC payloads.
- High-detail images are capped at 8 MB; standard-detail images are capped at 2 MB per monitor, and standard all-monitor capture is limited to four displays. The sidecar JSON line limit is 16 MB. Oversized captures fail with an actionable message rather than overflowing the pipe.
- Screen sharing's source-picker thumbnails remain previews; they are not the high-resolution stream. High-detail native capture is the separate path for screenshot inspection. Windows UI Automation remains the first choice for exact controls and accessible text.
- Windows OCR fallback requests a high-detail primary-monitor capture when accessible UI text is unavailable, and still deletes its temporary image after OCR.

## Release gates

- [ ] Chrome native host connects and authenticates reliably after fresh install and app restart.
- [ ] Native desktop helper receives and returns a correlated request through the current bridge.
- [ ] No two microphone consumers are active at once.
- [ ] Dictation does not accidentally execute commands.
- [ ] Local speech works without network access when configured for offline mode.
- [ ] UI Automation is preferred over raw coordinates and ambiguous controls are disambiguated.
- [ ] High-risk actions require explicit confirmation and stop/cancel works.
- [ ] All automated checks pass and Windows manual acceptance is recorded.

## Current status

Implemented in the current integration branch:

- Chrome named-pipe listener recovery with bounded backoff and safe native-host handshake diagnostics.
- Read-only Chrome bridge status reporting for listening, connection, authentication, pending requests, handshake/disconnect timestamps and last error.
- Native desktop sidecar health reporting for resolved script path, script existence, process state, PID, pending calls, start/exit timestamps, exit code/signal and sanitized last error.
- Electron's native status IPC now returns Full Control state plus native-helper and Chrome-bridge diagnostics.
- A renderer microphone ownership coordinator prevents Jess live conversation and explicit browser dictation from capturing concurrently.
- The desktop offline wake listener is paused before live conversation/dictation begins and resumed after the owning session ends.
- Contract tests cover bridge diagnostics, recovery hooks, and microphone handoff.
- Dictation converts explicit spoken punctuation and line-break phrases into text in both Windows-local and browser fallback modes; an explicit `literal dictation` / `type literally` prefix bypasses substitutions.
- Microphone ownership now uses per-session leases. Duplicate claims are rejected even from the same mode, and stale cleanup cannot release a newer session's microphone.

Not yet verified or fully implemented:

- These source-level changes are not proof that the installed native helper works on the target Windows machine. The release still needs a real request/response round-trip through Electron, PowerShell, the Chrome named host, and the extension.
- The Wheelhouse speech engine has not been bundled. Its project documents local Parakeet speech recognition, but engine/model licensing, download size, memory/CPU use, startup latency, recognition accuracy, and offline behavior must be measured before choosing a runtime.
- Voice Access-style command/dictation parity is partial. Named/numbered Windows UI controls exist, but text correction, literal dictation, and command-vs-dictation handling need end-to-end interaction tests.
- Chrome Web Store publishing, clean-machine installation, and real voice-only acceptance remain release gates.

## Release gates

- [ ] Chrome native host connects and authenticates reliably after fresh install and app restart.
- [ ] Native desktop helper receives and returns a correlated request through the current bridge.
- [ ] Exactly one Jess microphone consumer is active at a time, including offline wake.
- [ ] Dictation does not accidentally execute commands.
- [ ] Local speech works without network access when configured for offline mode.
- [ ] UI Automation is preferred over raw coordinates and ambiguous controls are disambiguated.
- [ ] High-risk actions require explicit confirmation and stop/cancel works.
- [ ] All automated checks pass and Windows manual acceptance is recorded.


## Native bridge failure semantics and fallback

The native bridge is a capability boundary, not a promise that every runtime can control Windows. The web workspace may use only browser-exposed capabilities; Windows desktop actions require the installed Electron app and its packaged native helper. When that bridge is unavailable, Jess must say so and offer a safe browser-only alternative where one exists. It must not imply that a desktop action was attempted or completed.

### Required error distinctions

Report the earliest actionable failure, with a safe next step, and preserve the structured error in the execution trace:

- **Unsupported runtime:** the current session is running in the browser, not the Windows desktop app. Explain that native Windows actions require the installed desktop app.
- **Helper missing:** the expected PowerShell/.NET helper or script is absent from the development or packaged path. Report the resolved path and recommend repair/reinstallation; do not silently switch to a different executable.
- **Helper startup failure:** process spawn failed or the helper exited before readiness. Include the sanitized error and exit code/signal when available.
- **Transport/protocol failure:** request write failed, response JSON was invalid/oversized, request timed out, or a correlation ID had no matching response. Mark the action failed or outcome unknown; never convert this into success.
- **Chrome bridge unavailable:** distinguish listener, socket, authentication/handshake, extension/host installation, pending request timeout, and disconnected states. Do not collapse them into a single “Chrome connected” flag.
- **Action rejected:** permission, Full Control, stale target, unsupported control pattern, or safety policy rejected the request. Explain the required permission or safer next step without bypassing the gate.
- **Verification failed/unknown:** the helper accepted or sent an action but returned no evidence that the intended result occurred. Say “sent but not verified” or “outcome unknown”; do not retry non-idempotent actions automatically.

### Why native-agent errors matter

Native-agent errors are essential operational feedback. They identify the failing layer (process, transport, protocol, authorization, or target application), allow the UI to offer a useful recovery step, and prevent a tool call from being mistaken for a completed task. Preserve request/action correlation IDs, timing, timeout classification, process exit details, and sanitized diagnostic text in logs. Never log bridge tokens, credentials, or sensitive clipboard/screen contents as diagnostic metadata.

### Command execution and safety boundary

The bounded PowerShell diagnostic/automation tool is not an unrestricted shell. Do not advertise arbitrary command execution or unrestricted administrator access. Continue to enforce the existing allowlists, Full Control session, per-action confirmation for consequential operations, cancellation, audit events, and current-user privilege boundary. Destructive/elevated operations remain blocked unless a separately reviewed and explicitly authorized capability is added. A timeout or lost response must not trigger a blind replay of an action that could have changed system state.

### Screen capture expectations

Keep thumbnail/source-picker previews distinct from the screenshot actually delivered to Jess. The UI should report whether capture was requested, captured, delivered as an image frame, and received/processed where observable. Use bounded high-detail single-monitor capture for closer inspection and standard multi-monitor capture for overview; enforce payload limits before IPC delivery. If image delivery repeatedly fails, surface that visual analysis is unavailable rather than continuing as though Jess can see the screen.

### Release checklist additions

- [ ] Browser-only sessions clearly explain that native Windows controls are unavailable.
- [ ] Missing helper, startup failure, timeout, protocol error, permission rejection, and unverified outcome have distinct user-facing messages.
- [ ] Native and Chrome bridge diagnostics never expose tokens or credentials.
- [ ] No action is reported successful solely because it was queued or sent.
- [ ] Screenshot capture and frame delivery failures are visible to the user.
- [ ] Destructive/elevated PowerShell remains blocked by default and no silent elevation is introduced.
