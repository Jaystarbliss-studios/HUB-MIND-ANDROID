# Hub-Mind Android — Audit and Test Readiness

**Audit date:** 2 November 2026  
**Repository:** `Jaystarbliss-studios/HUB-MIND-ANDROID`  
**Working branch:** `fix/android-audit-baseline`  
**Application ID:** `com.jaystarbliss.hubmind`  
**Target:** Private sideloaded Android APK  
**Assistant:** Jess

## 1. Executive finding

The first Android project contained demonstration implementations that reported success without performing the operation. The current audit branch removes the most dangerous false-positive behaviour and establishes safer integration boundaries.

This branch is **not a production-ready cross-device app yet**. It is a safer native Android foundation with:
- Firebase Authentication code that requires the owner's Android Firebase configuration.
- A text-chat client that calls the existing Hub-Mind `/api/chat` backend with a Firebase ID token.
- An Android AccessibilityService and gesture executor that waits for Android's dispatch result.
- An actual local Android device record rather than fabricated phone/Windows devices.
- Explicit failures when no authenticated remote command transport exists.
- A private-update download path with same-origin HTTPS validation and SHA-256 verification.
- A CI workflow that attempts a real Android Gradle build and unit tests.

Do not infer feature completion from a visible UI, class/interface, previous AI Studio report, or test that only checks an enum/model. Features are marked below according to the current source code.

## 2. Changes made in this audit branch

| Area | Repair |
|---|---|
| App identity | Chosen package name `com.jaystarbliss.hubmind` before the first private release. It must be kept unchanged after first distribution. |
| Authentication | Removed default credentials and the automatic-authenticated bypass. Email/password now uses Firebase Auth and checks `users/{uid}` profile status. |
| Admin bootstrap | Limited initial profile creation to the same two email addresses configured by the existing website, subject to Firestore rules. |
| Firebase | Added Firebase Auth/Firestore SDK dependencies and conditional Google Services plugin. Missing `app/google-services.json` produces a clear configuration error rather than a demo login. |
| Chat | Text messages call `/api/chat` with the signed-in Firebase ID token; the Gemini key remains server-side. |
| Conversations | Removed fabricated conversation/message examples. Android conversation state is still local-only and is not yet synced to Firestore. |
| Devices | Removed demo Pixel/ThinkPad entries and fake online presence. The local Android endpoint is derived from device information. |
| Remote actions | Removed simulated successful WebSocket/remote results. Without a real transport, remote actions fail explicitly and say that no command was sent. |
| Device resolver | Removed fallback to the first device when a target is ambiguous. |
| Android gestures | Waits for the AccessibilityService gesture callback; validates coordinates and reports acceptance separately from postcondition verification. |
| Screenshot | No longer reports a screenshot as successful. Actual MediaProjection frame acquisition/encoding/return is not implemented. |
| Permissions | Permission state is now read from Android system state rather than optimistic hardcoded flags. |
| Foreground session | UI state follows the actual service lifecycle and reports start errors. |
| Release signing | Removed the public Android debug keystore as the release signer. Release signing now requires owner-supplied signing credentials. |
| Update installer | Reads installed version, validates a same-origin HTTPS APK URL, checks SHA-256, and uses a restricted FileProvider path. |
| CI | Removed npm cache configuration that failed without a lockfile; added Android assemble and unit-test jobs. |
| Repository hygiene | Added Gradle/Android/private-secret ignores and removed tracked Gradle cache files. |

## 3. Feature status — source-code assessment

| Feature | Current status | What is still needed |
|---|---|---|
| Native Compose UI | Implemented in source; not independently re-tested in this audit | CI build and physical visual review |
| Email/password Firebase Auth | Implemented; not connected until Firebase Android app config is supplied | Register Android package in existing Firebase project and add local `app/google-services.json` |
| Google sign-in | Not implemented | Configure Android OAuth client, package SHA fingerprints and native Credential Manager / Google identity flow |
| Profile/role/status check | Implemented in Firebase repository | Validate against actual production Firestore rules and account |
| Jess text chat | HTTP client implemented | Verify the deployed `/api/chat` URL, backend authentication, Gemini key, model permissions and response shape |
| Gemini Live voice | Not implemented | Integrate authenticated ephemeral token and live audio/WebSocket pipeline; no Gemini key belongs in APK |
| Local speech recognition | A helper class exists but is not wired to Jess Home | Connect permissions, transcript callback, cancellation and send flow |
| Text-to-speech | A helper class exists but is not wired to Jess responses | Connect response playback and lifecycle |
| Conversation persistence | Local in-memory draft only | Map the existing website conversation/message schema and Firestore branch semantics |
| Shared memory | Not implemented | Reuse existing memory service/API or Firestore model |
| Local Android app launch | Native PackageManager helper exists | Physical-device tests |
| Accessibility hierarchy | Implemented in source with traversal limits | Enable Accessibility in Android Settings and test on physical phone |
| Tap/swipe/scroll/text input | Native executor implemented with callback handling | Physical-device tests; coordinate gestures are not semantic target planning |
| Clipboard | Android ClipboardManager helper exists | Verify behaviour on Android version and foreground/background context |
| Global navigation | Native controller exists | Accessibility must be enabled and actions tested on physical phone |
| Screen capture | Not implemented end-to-end | MediaProjection consent, foreground-service lifecycle, frame capture, encoding and controlled result delivery |
| Device registry | Local Android-only draft | Authenticated registration API and heartbeat |
| Windows device presence | Not implemented in current Android runtime | Windows agent registration/heartbeat and shared registry |
| Remote command relay | Explicitly unavailable in this branch | Authenticated WebSocket/control-plane backend and Android client |
| Windows command receiver | Not implemented by this branch | Change and test the main Hub-Mind Electron Windows agent |
| Shizuku advanced provider | Interface/stub only | Optional integration and explicit user activation |
| VoiceInteractionService/default assistant | Not active; manifest deliberately does not advertise the incomplete stub | Real assistant metadata/session service and physical-device validation |
| Private APK updater | Helper implemented, not wired into app UI or deployed | Publish `/app-version.json`, APK and SHA-256 on same host; add UI trigger |
| Release signing | Safe configuration is present | Create and securely store owner-controlled keystore; set Gradle/env signing variables |

## 4. Required Firebase setup

The existing Hub-Mind website uses Firebase project:

`ai-studio-hubmind-4cac2024-c6eb-4208-80cf-928714dfd430`

The Android app must be registered as a **new Android app inside this same Firebase project**, using this exact package name:

`com.jaystarbliss.hubmind`

Then download its Android `google-services.json` and put it at:

`app/google-services.json`

That file is deliberately ignored by Git. Do not commit it. It contains app configuration, not a server/admin credential, but it should still be managed as environment-specific configuration.

Enable Email/Password authentication for the Firebase project if it is not already enabled. The app queries the named Firestore database:

`ai-studio-hubmind-4cac2024-c6eb-4208-80cf-928714dfd430`

Confirm that this database ID exists and that Firestore rules permit the signed-in owner to read their own `users/{uid}` profile. The Android repository does not bypass Firestore rules.

Google sign-in is currently not available in this APK branch. It must not be presented as working until native Android OAuth is configured for the package and its signing certificate.

## 5. Gemini/API configuration

The APK does not contain a Gemini API key.

Text requests are sent to:

`POST {HUBMIND_API_BASE_URL}/api/chat`

The request uses:
- `Authorization: Bearer <Firebase ID token>`
- JSON body containing Gemini-style `messages` and a system instruction.

The backend must:
- Validate the Firebase ID token.
- Have a valid server-side `GEMINI_API_KEY`.
- Return JSON with a non-empty `text` field.
- Be reachable through HTTPS.

The default Android API base is `https://hub-mind.netlify.app`; override with Gradle property or environment variable `HUBMIND_API_BASE_URL` if the production Hub-Mind host differs.

Gemini Live voice remains unimplemented. It requires the backend's ephemeral-token route and live WebSocket/audio protocol to be integrated; placing the long-lived Gemini key inside the APK is not an acceptable workaround.

## 6. Build and test status

The original default-branch GitHub Actions run `41366980952` had:
- Windows native validation: passed.
- General validation: failed before dependency installation because `setup-node` attempted npm caching without a lockfile.
- No Android Gradle compilation was run by that previous workflow.

This branch corrects the npm-cache setup and adds an Android job to run:
- `gradle :app:assembleDebug`
- `gradle :app:testDebugUnitTest`

**Do not treat the former AI Studio "PASSED" report as current verification.** The new branch must pass its own GitHub Actions run. This report will be updated after the branch's CI result is available.

## 7. Physical-device test plan

After a debug APK builds and Firebase config is supplied:

1. Install the debug APK on the target Android phone.
2. Confirm the app opens and shows sign-in, not the main assistant screen.
3. Sign in using the existing Hub-Mind Firebase account.
4. Confirm an inactive/non-authorised profile is rejected.
5. Send a text prompt and confirm a genuine response from `/api/chat`.
6. Disable network and repeat; the UI must show a backend error, not a fabricated answer.
7. Enable Hub-Mind Accessibility Service in Android Settings.
8. Return to Hub-Mind and verify that permission-enabled and service-connected statuses are both accurate.
9. Use local test controls to test app launch, hierarchy retrieval, tap, swipe, scroll and text entry.
10. Confirm that an expired command is rejected.
11. Confirm screen capture reports unavailable and does not claim success.
12. Confirm the device screen shows only the current Android phone, not a fictitious Windows machine.
13. Confirm a Windows-target request reports that remote transport is not connected.

Do not try cross-device testing yet: the Android transport is intentionally marked unavailable until the backend and Windows agent are integrated.

## 8. Private release requirements

The first release must use:
- Application ID `com.jaystarbliss.hubmind`
- Owner-controlled signing keystore, backed up securely.
- Release signing properties supplied outside Git.
- An incremented versionCode for every subsequent release.

Never commit signing keys or passwords. The APK cannot be updated over an installed copy if its signing key changes.

The app updater expects a same-host HTTPS `/app-version.json` manifest containing `versionCode`, `versionName`, `apkUrl`, `sha256` (64 hex characters), and optionally `releaseNotes` and `minSupportedVersionCode`. The updater is not yet integrated into the settings UI.

## 9. Acceptance gate

This Android branch should not be described as "complete" until:
- Its own CI build and tests pass.
- Firebase login is verified using the existing Hub-Mind project.
- Text chat is verified against the deployed Hub-Mind backend.
- Local Android agent actions are tested on the actual phone.
- Shared Firestore conversations/memory are implemented.
- A real device registry and authenticated command relay are deployed.
- Both Android-to-Windows and Windows-to-Android commands are verified against the existing Windows agent.
- The private release is signed with the permanent owner-controlled key.
