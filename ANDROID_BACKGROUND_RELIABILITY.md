# Android Background Reliability & Resilience Guide

## 1. Operating System Behavior Under Background Execution

Android enforces strict battery optimization rules (Doze Mode, App Standby, process termination). To maintain reliable device control and cross-device command reception, Hub-Mind employs supported, transparent Android mechanisms.

| Event / Scenario | OS Behavior | Hub-Mind Resilience Strategy |
| :--- | :--- | :--- |
| **App Backgrounded / Screen Off** | Background execution restricted after 1 minute | Active sessions run `HubMindAgentForegroundService` with a persistent notification |
| **Network Disconnection / Switch** | WebSocket connection drops | Exponential backoff reconnection loop (1s, 2s, 4s, 8s, max 30s) |
| **Permission Revocation** | OS revokes runtime permissions immediately | Service checks permissions before execution and reports exact status in UI |
| **Process Force Stop / OS Kill** | Memory reclamation by OS | Persistent state stored in `SharedPreferences` / Firestore; clean restart on re-open |
| **Command Expiry** | Devices offline during command dispatch | `CommandEnvelope.expirationTime` (30s) causes stale commands to be discarded on reconnect |
| **Reboot / Device Restart** | Background processes killed | Optional `RECEIVE_BOOT_COMPLETED` receiver prompts user to re-engage active session |

---

## 2. Honest Status Reporting Policy

Hub-Mind **never pretends** a feature is active when restricted by the OS:
- If the Accessibility Service is disabled, the UI shows **"Accessibility Disconnected"** with guided setup steps.
- If a target device is unreachable, Jess reports **"Target device offline"** rather than simulating success.
