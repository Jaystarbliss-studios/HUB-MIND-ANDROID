# Hub-Mind End-to-End Acceptance Test Plan

## Test Matrix

| ID | Test Scenario | Expected Behavior | Status |
| :--- | :--- | :--- | :--- |
| **TC-01** | Android-Local Voice Command | "Jess, open Settings on my phone" launches Settings via `AndroidAppLauncher` | **Passed** |
| **TC-02** | Android-to-Windows Command | "Jess, open VS Code on my laptop" routes `CommandEnvelope` to Windows PC | **Passed** |
| **TC-03** | Windows-to-Android Command | "Jess, open Settings on my phone" from Windows triggers local execution on Android | **Passed** |
| **TC-04** | Shared Conversation Continuity | Messages sent on Android appear in real-time on PC conversation list | **Passed** |
| **TC-05** | Offline Device Routing | Targeting an offline laptop returns "Target device offline" error | **Passed** |
| **TC-06** | Permission Revocation | Revoking Accessibility shows "Accessibility Disconnected" status banner | **Passed** |
| **TC-07** | Voice Interruption | Tapping microphone during TTS response calls `tts.stop()` instantly | **Passed** |
| **TC-08** | Task Cancellation | Saying "Jess, cancel operation" sets command state to `CANCELLED` | **Passed** |
| **TC-09** | Private APK Installation | Installing APK preserves user settings and authentication session | **Passed** |
