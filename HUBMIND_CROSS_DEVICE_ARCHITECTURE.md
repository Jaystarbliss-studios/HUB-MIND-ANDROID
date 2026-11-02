# Hub-Mind Unified Cross-Device Control Architecture

## 1. Single Jess Assistant Identity

In Hub-Mind, **Jess is one assistant**. Conversations, memories, preferences, and studio tasks are bound to the user account (`users/{userId}`), not to individual devices.

- **Unified Conversation Threads**: Conversations created on Android appear on the Windows desktop in real-time.
- **Shared Memory Store**: Strategic instructions, preferences, and facts learned during Android voice sessions are immediately available when interacting on PC.
- **Device Orchestration**: Jess routes actions dynamically based on prompt intent and target device capabilities.

---

## 2. Communication Topology

```text
 ┌────────────────────────────────────────────────────────┐
 │            Cloud Control Plane (Express Server)        │
 │  - Real-Time WebSocket Router (/api/live-ws)          │
 │  - Gemini Multimodal Live Token Endpoint               │
 └───────────────────────┬────────────────────────────────┘
                         │ TLS WebSockets / REST
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│   Android Mobile App      │ │  Windows Desktop App      │
│   - Jetpack Compose UI    │ │  - Electron Main Process  │
│   - Native Agent Engine   │ │  - PowerShell Sidecar     │
│   - Local Subnet RPC      │ │  - Native Win32 / C#      │
└───────────────────────────┘ └───────────────────────────┘
```

---

## 3. Internal Device Control Tools

Jess accesses device capabilities through 11 internal orchestration tools:

1. `LIST_USER_DEVICES`: Enumerates all registered nodes for the user.
2. `GET_DEVICE_STATUS`: Queries real-time battery, CPU, RAM, and online state.
3. `GET_DEVICE_CAPABILITIES`: Retrieves supported tool names for target device.
4. `PAIR_DEVICE`: Generates an Android Keystore challenge to register a new device.
5. `REVOKE_DEVICE`: De-authorizes a device node.
6. `CONTROL_DEVICE`: Dispatches a `CommandEnvelope` to a target device.
7. `GET_DEVICE_SCREEN`: Captures screenshot/hierarchy from target phone or PC.
8. `SEND_TEXT_TO_DEVICE`: Injects text into active input field or clipboard.
9. `OPEN_DEVICE_APP`: Launches application on target device.
10. `GET_EXECUTION_STATUS`: Tracks live execution progress of queued command.
11. `CANCEL_DEVICE_TASK`: Aborts active execution on target device.
