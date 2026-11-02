# Hub-Mind Android — Current Release Status

**As of 2 November 2026**

## Current classification

**Private Android prototype — not ready for general installation yet.**

The code has been audited and misleading demo-success behaviour is being removed. The app is not yet an operational replacement for the web/Windows Hub-Mind platform.

## Present in source
- Native Kotlin/Compose application structure.
- Firebase email/password integration code.
- Authenticated text-chat client for the existing Hub-Mind `/api/chat` endpoint.
- Native AccessibilityService and gesture execution helpers.
- Local Android device information and capability reporting.
- Safer release signing configuration.
- Private APK update download/checksum helper.
- GitHub Actions Android build and unit-test job.

## Not yet complete or verified
- Android Firebase app registration/config file.
- Live Firebase authentication test.
- Live Gemini text backend test.
- Native Google sign-in.
- Gemini Live voice and audio streaming.
- Firestore conversation and memory synchronisation.
- Full MediaProjection frame capture.
- Authenticated device registration/heartbeat.
- Remote control transport.
- Windows agent command receiver.
- Shizuku advanced control.
- Private APK update UI and website deployment.
- Physical-device accessibility/gesture tests.
- Owner-controlled release keystore.

## Release gate
Do not create a production APK until:
1. GitHub Actions Android build and unit tests pass.
2. Firebase Android app config has been added locally.
3. Text chat has been tested against the live Hub-Mind backend.
4. Local accessibility actions have been tested on a physical Android phone.
5. The owner has generated and backed up the permanent release signing key.

Cross-device use must remain disabled until backend and Windows-agent integration is implemented and tested.
