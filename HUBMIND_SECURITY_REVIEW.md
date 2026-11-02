# Hub-Mind Security & Privacy Review

## 1. Zero-Trust Security Principles

1. **No Embedded Server Secrets**: Firebase service account keys and administrative API tokens are strictly isolated on the secure server. The Android client only uses client configuration and authenticated JWT Bearer tokens.
2. **Hardware-Backed Device Identity**: Device pairing uses asymmetric EC keypairs generated inside the **Android Keystore System** (`AndroidKeyStore`).
3. **No Unauthenticated Server Sockets**: ARTEMIS's local TCP server socket has been removed. All command traffic flows through TLS WebSockets or Firestore security rules.
4. **Scope Isolation**: All data queries enforce `request.auth.uid == userId` in `firestore.rules`.
5. **No Lock Screen / PIN Bypass**: Jess respects Android OS security boundaries and cannot bypass lock screens or biometric prompts.

---

## 2. Privacy & Data Handling Controls

- **Transparent Recording**: Microphone recording and screen capture run only during active, user-initiated sessions with a visible foreground notification.
- **No Silent Telemetry Leakage**: Log outputs scrub sensitive Bearer tokens, secrets, and private payload data.
