# Hub-Mind Device Registry Architecture & Schema

## 1. Overview & Data Schema

In Hub-Mind, the device registry tracks all authorized physical hardware endpoints connected to a user's account. Scoped strictly under `users/{userId}/devices/{deviceId}` in Cloud Firestore, the registry maintains live telemetry, registered capabilities, connection status, and authorization states for both Android mobile phones and Windows desktop PCs.

```json
{
  "deviceId": "android-pixel-01",
  "userId": "usr-hubmind-admin-01",
  "deviceName": "Hub-Mind Android Phone",
  "platform": "ANDROID",
  "model": "Pixel 8 Pro",
  "agentVersion": "2.4.0-native",
  "capabilities": [
    "ANDROID_ACCESSIBILITY",
    "MEDIA_STREAMING",
    "NOTIFICATION_LISTENER",
    "CAMERA_CAPTURE",
    "STORAGE_MANAGEMENT"
  ],
  "status": "ONLINE",
  "isCurrentDevice": true,
  "pairingStatus": "PAIRED",
  "fullControlActive": true,
  "permissionMode": "allow-routine",
  "batteryPercent": 88,
  "ipAddress": "192.168.1.185",
  "lastSeenAt": 1798845000000,
  "registeredAt": 1798800000000
}
```

---

## 2. Platform Telemetry & Status Management

1. **Heartbeat Loop**: Active clients update `lastSeenAt` every 15 seconds.
2. **Status Evaluation**:
   - `ONLINE`: Active connection within 45 seconds.
   - `BUSY`: Currently executing a long-running device automation task.
   - `OFFLINE`: No heartbeat or WebSocket connection for over 45 seconds.
   - `UNAVAILABLE`: Device revoked or agent disabled.
3. **Natural Device Resolution**:
   - Querying `"my phone"` automatically targets the registered `ANDROID` node.
   - Querying `"my laptop"` or `"my PC"` targets the registered `WINDOWS` node.
   - Ambiguous queries present an interactive device selection prompt in the UI.

---

## 3. Pairing & Security Lifecycle

- **Device Key Generation**: Android clients generate an asymmetric key pair in the **Android Keystore System** (`AndroidKeyStore`), ensuring private key material never leaves the secure hardware element.
- **Revocation**: Setting `pairingStatus: "REVOKED"` immediately blocks future command routing to that `deviceId` at both the client and server boundaries.
