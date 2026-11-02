# Hub-Mind Cross-Device Command Protocol Specification (v1.0)

## 1. Typed Command Envelope Schema

All cross-device actions are wrapped in a versioned, tamper-evident `CommandEnvelope`:

```json
{
  "protocolVersion": "1.0",
  "commandId": "cmd-8f92a10b-44c1-4b72-911a-3e81042df5a9",
  "taskId": "task-ops-102",
  "conversationId": "conv-daily-ops-01",
  "issuingUserId": "usr-hubmind-admin-01",
  "sourceDeviceId": "android-pixel-01",
  "targetDeviceId": "win-main-workstation",
  "actionType": "launch_windows_application",
  "parameters": {
    "appName": "code.exe"
  },
  "creationTime": 1798845000000,
  "expirationTime": 1798845030000,
  "replayToken": "nonce-77291a0c4f82",
  "requiresConfirmation": false,
  "correlationId": "corr-01975306"
}
```

---

## 2. Command Lifecycle States

```text
  [CREATED]
      │
      ▼
[AUTHENTICATED] ──(Server Identity Check)──► [ROUTED]
                                              │
                                              ▼
                                         [RECEIVED]
                                              │
                   ┌──────────────────────────┴──────────────────────────┐
                   ▼                                                     ▼
        [AWAITING_CONFIRMATION]                                     [EXECUTING]
                   │                                                     │
                   └──────────────────────────┬──────────────────────────┘
                                              │
                                              ▼
                                 [COMPLETED] / [FAILED]
```

1. **`CREATED`**: Initialized by Jess in response to a user voice/chat turn.
2. **`AUTHENTICATED`**: Signed by client Android Keystore / JWT Bearer token.
3. **`ROUTED`**: Transmitted over WebSocket / Firestore command queue to target device.
4. **`RECEIVED`**: Target device validates `targetDeviceId == myDeviceId`, checks `expirationTime > currentTime`, and verifies `replayToken` was not previously seen.
5. **`AWAITING_CONFIRMATION`**: Paused for spoken yes/no or UI prompt if action is classified high-impact.
6. **`EXECUTING`**: Native execution on target (Win32 API or Android AccessibilityService).
7. **`COMPLETED` / `FAILED`**: Final state with postcondition verification results.

---

## 3. Replay Protection & Idempotency Rules

- **Nonce Cache**: The agent maintains an in-memory sliding window cache of `replayToken` strings for 10 minutes.
- **Expiration Limit**: Default TTL is 30 seconds. Expired commands are discarded immediately without execution.
- **Idempotent Actions**: Read-only tools (`get_windows_system_info`, `GET_SCREEN_HIERARCHY`, `scan_windows_storage`) are retry-safe.
