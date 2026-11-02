# Hub-Mind Android — Integration Status

**Audit date:** 2 November 2026  
**Android package:** `com.jaystarbliss.hubmind`  
**Companion repository:** `Jaystarbliss-studios/HUB-MIND-ANDROID`  
**Main Hub-Mind project:** `Jaystarbliss-dynamic-hub/HUB-MIND`

## 1. Product architecture

Hub-Mind is intended to have one Jess identity across web, Windows and Android. The Android application is a native Kotlin/Jetpack Compose endpoint, not a React wrapper or separate assistant.

The current codebase is a first native prototype. It is not yet a distributed multi-device agent because the shared conversation store, device registry and remote command relay are not yet implemented on Android.

## 2. Existing website contracts inspected

The existing website code inspected during this audit includes:

- `src/lib/auth.tsx` and `src/services/userService.ts`: Firebase user identity, active-account check, admin profile bootstrap and invitations.
- `src/services/jessSessionCoordinator.ts`: Firestore-backed 22-second active Jess client lease with 10-second renewal.
- `src/lib/conversationStore.ts`: user conversation documents, message tree/branch structure and local cache.
- `netlify/functions/chat.ts`: authenticated text-chat endpoint; Gemini API key is server-side.
- `netlify/functions/live-token.mjs`: backend-created short-lived Gemini Live token.
- `server.ts`: existing API server and backend route architecture.
- `firestore.rules`: account/profile and user/workspace data access rules.
- `electron/main.cjs`, `electron/agentBridge.cjs`, `electron/jess-agent.ps1`: current Windows agent and its audited execution interface.

This inspection is reference context; no production website or Windows source was changed by this Android branch.

## 3. What this Android branch currently reuses

### Firebase identity
The Android auth repository now uses Firebase Auth and reads the existing `users/{uid}` profile from the existing named Firestore database. It rejects profiles that are absent or not active. Admin bootstrap is limited to the two website-configured owner emails, subject to Firestore security rules.

This integration is not usable until the Android app is registered in the same Firebase project and `app/google-services.json` is supplied locally.

### Text chat
The Android Jess repository now calls the website's `/api/chat` endpoint using the Firebase ID token. The Gemini key is not bundled in Android. This request path has not yet been verified against a live deployment.

### Shared conversations and memory
Not yet connected. Android conversations are currently local in-memory drafts, and Android memory sync is not implemented. The website's conversation branch schema and memory service need a deliberate Kotlin/API adapter.

### Jess voice/session
Not yet connected. The Android Live voice button correctly reports that Gemini Live is unavailable instead of pretending a lease or audio stream exists. The existing website's lease and Gemini Live token/WebSocket contracts still need native integration.

## 4. Device and command integration

### Local Android
A local Android device record is generated from the handset's Android ID, manufacturer/model, app version, battery and currently connected Accessibility service. It is not proof that another device is registered.

### Remote Windows
No Windows record is fabricated. The Android control repository has no registered Windows device in its current local registry and has no authenticated transport. A remote command is rejected with an explicit no-transport result.

### Required next backend/Windows work
1. Add authenticated device registration/listing and heartbeat routes to the existing Hub-Mind backend.
2. Implement an authenticated persistent control transport (WebSocket or a separately deployed relay) with expiry, replay protection, per-device authorisation and results.
3. Adapt the Windows Electron main process to register and receive commands through that protocol.
4. Route Android-origin commands to the existing Windows native agent and return real execution results.
5. Implement the inverse path so Windows-origin Jess commands can reach the Android agent.
6. Test revocation, expiry, duplicate delivery, offline devices and sensitive-action confirmation.

Do not replace this with an unauthenticated local HTTP server or treat a Firestore record as proof of a live connection.

## 5. Current source implementation status

| Component | Status |
|---|---|
| Compose UI, viewmodels, theme | Source exists; compile/visual review required |
| Firebase email/password auth | Implemented but Firebase config not yet supplied/tested |
| Google sign-in | Not implemented |
| `/api/chat` text request | Client implemented; live endpoint not yet verified |
| Gemini Live voice | Not implemented |
| Firestore conversation sync | Not implemented |
| Firestore memory sync | Not implemented |
| Accessibility service | Implemented in source; physical-device validation required |
| Gesture result handling | Awaits Android callback; postcondition verification still absent |
| Screenshot capture | Not implemented end-to-end |
| Local app launch and navigation | Source implemented; physical-device validation required |
| Remote command control | Not implemented; transport explicitly fails closed |
| Android device registration/heartbeat | Not implemented |
| Windows remote receiver | Requires changes in the main Hub-Mind repository |
| Shizuku advanced control | Stub/interface only |
| Private APK update checker | Download/verification helper implemented; not wired into UI or hosted |
| Release APK signing | Requires owner-controlled keystore |

## 6. Security posture

- All remote API traffic must use HTTPS.
- Firebase ID tokens are used for user authentication.
- Gemini API credentials remain server-side.
- The app does not expose an unauthenticated inbound command server.
- Accessibility permission is user-enabled through Android Settings.
- Gesture callback acceptance is not represented as verified application-level success.
- Screen capture requests fail explicitly until a real capture pipeline exists.
- Release builds are not signed with the public Android debug key.
- Firebase configuration and local signing files are ignored by Git.

## 7. Next integration milestones

1. Supply the Android Firebase config and verify email/password sign-in.
2. Verify Android `/api/chat` against the deployed backend and confirm the configured Gemini key.
3. Implement shared Firestore conversations and memory.
4. Implement native speech recognition/TTS wiring, followed by Gemini Live audio.
5. Implement real device registration and authenticated control-plane transport in the main Hub-Mind backend.
6. Integrate the Windows agent receiver.
7. Verify both control directions on physical devices.
8. Sign the first private APK and host the APK plus update manifest on the official Hub-Mind website.
