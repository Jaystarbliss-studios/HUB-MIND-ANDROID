# Jess integration

## Product contract

Jess is Hub-Mind's embedded live voice operating layer. She is not a separate page, drawer, settings panel, or chat screen.

- Floating transparent/reactive assistant icon in the viewport.
- Double tap/click activates a live voice session.
- Double tap/click while active ends the session.
- Pointer drag works on mouse and touch devices.
- Position is persisted locally per browser.
- No wake word is required.
- No assistant settings UI is exposed.
- The signed-in Hub-Mind identity is passed into the live session.
- Jess can use authenticated workspace tools and navigate the visible application.

## Runtime layers

1. `JessFloatingAssistant` owns the interaction surface and viewport position.
2. `LiveAudioClient` owns microphone capture, PCM streaming, Gemini Live, interruption, audio playback and session lifecycle.
3. `jessTools` owns tool declarations and authenticated Firestore/Calendar operations.
4. `JessDocumentBridge` connects document tool actions to the visible TipTap editor so document work can be seen in the workspace.
5. Existing Hub-Mind pages remain the visible workspace; navigation is performed through the existing router.

## Security model

The browser never receives the long-lived Gemini API key. It requests an authenticated, short-lived Live token using the current Firebase ID token. Tool execution runs with the signed-in Hub-Mind profile and rejects suspended/inactive users before mutations.

## Voice model migration

The standalone VOICE-MODEL implementation established the low-latency 16 kHz capture / 24 kHz playback interaction pattern. Hub-Mind keeps its authenticated ephemeral-token path and integrates the proven live-audio behavior without embedding the standalone application's settings, vault, transcript, or chat UI.

## Navigation and document behavior

Jess can navigate to tasks, projects, documents, calendar, clients and other existing routes. Document creation returns a real document ID and opens the Hub-Mind editor. Document creation/update actions queue a short-lived authenticated browser-side edit event; `JessDocumentBridge` waits for the matching editor to mount and applies the change visibly before allowing the normal editor save lifecycle to persist it.

## Legacy removal

The legacy Shawn assistant components, assistant-specific authorization/tool files, wake-word detector, live voice control panel, transcript/settings/calibration/dictation UI and standalone assistant drawers have been removed from the integration branch. Jess is the only embedded live assistant surface.

## Live audio performance architecture

The live microphone path is deliberately split into two browser threads:

1. `AudioWorklet` captures mono 16 kHz microphone frames with deterministic timing.
2. A dedicated `Web Worker` performs client-side VAD, Float32-to-16-bit-PCM conversion, and Base64 encoding so those loops never run on the React/UI thread.
3. Only speech-positive frames are forwarded to the Gemini Live session.
4. The Google GenAI Live SDK maintains the stateful WebSocket connection to Gemini. Jess does not create a second parallel socket or proxy the audio through Netlify.

Gemini Live expects raw 16-bit PCM at 16 kHz for input and returns 24 kHz PCM audio for output. The current client-to-server architecture therefore keeps the audio stream direct from the browser to Gemini after the authenticated short-lived token is provisioned. This minimizes latency and avoids sending realtime audio through the application backend. 

The UI-level audio meter is sampled at 10 Hz because it is visual feedback rather than part of the transport path. The worker is terminated with the Live session so no background audio-processing thread survives deactivation.
