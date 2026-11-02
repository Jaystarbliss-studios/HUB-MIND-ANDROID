# Hub-Mind Android Architecture & Windows Agent Integration Map

## 1. Executive Summary & Product Context

**Hub-Mind** is Jaystarbliss Studios' internal operations platform, featuring the AI assistant **Jess**. The system currently operates across:
- Web workspace (React 19, TypeScript, Tailwind CSS, Vite)
- Windows desktop companion & agent (Electron, C# / .NET host, PowerShell `jess-agent.ps1`, Chrome Native Messaging, MCP server bridge)
- Backend & Firebase layer (Cloud Firestore, Firebase Authentication, Node.js API server with Google Search grounding and Gemini Live WebSocket proxy)

This document establishes the architecture for the **native Android application** for Hub-Mind. The Android application is **not** a secondary client or separate bot; it is a full first-class mobile endpoint of the single, unified Jess ecosystem, sharing user identity, account status, memory, conversation history, task records, and cross-device command routing.

---

## 2. Existing Hub-Mind System Inspection

### 2.1 Authentication & User Authorization
- **Provider**: Firebase Authentication (Email/Password, Google OAuth).
- **Profile Store**: Firestore collection `users/{userId}`.
- **Roles**: `admin`, `staff`.
- **Status**: `active`, `training`, `suspended`, `inactive`. Access is restricted to `status == 'active'` (or bootstrap administrator emails `johnrufai242@gmail.com`, `rufaijohnny@gmail.com`).
- **Security Rules**: Enforced via `firestore.rules`. User profiles can only update personal display fields (`preferredName`, `photoUrl`, `name`, `phone`, `lastSeenAt`, `displayName`).

### 2.2 Data Model & Firestore Collections
1. **Users & Private Data**:
   - `users/{userId}`: User profile.
   - `users/{userId}/conversations/{conversationId}`: Conversation threads.
   - `users/{userId}/memories/{memoryId}`: Persistent memory entries (`category`: `preference`, `instruction`, `personal`, `workflow`, `fact`, `schedule`).
   - `users/{userId}/private/jessActiveSession`: Cross-client exclusive session lease (`sessionId`, `client`, `status`, `leaseUntil`).
   - `users/{userId}/dailyReports/{id}`, `weeklyReports/{id}`, `jessTasks/{id}`.
2. **Workspace Shared Collections**:
   - `tasks/{taskId}`: Assigned operational tasks with checklists, comments, and status (`draft`, `assigned`, `in_progress`, `completed`, etc.).
   - `projects/{projectId}`: Active and archived studio projects.
   - `clients/{clientId}`: Schools, parents, partners.
   - `meetings/{meetingId}`: Scheduled and completed sessions with AI summaries and action points.
   - `documents/{documentId}`: Internal and external documentation with version history.
   - `knowledge/{id}`: SOPs, templates, FAQs, lesson modules.
   - `inbox/{id}`: Quick capture notes for conversion into tasks, meetings, or knowledge.
   - `activityLogs/{id}`: Audit log of system and user operations.
   - `notifications/{id}`: Targeted alerts per user.

### 2.3 Jess Session Coordinator & Active Lease System
In `src/services/jessSessionCoordinator.ts`, Jess enforces single-active-speaker coordination using an atomic Firestore transaction on `users/{userId}/private/jessActiveSession`:
- `leaseUntil`: Epoch timestamp (current time + 22,000 ms).
- `client`: Origin identifier (`'desktop'`, `'web'`, `'android'`).
- The active client renews every 10 seconds. When an Android voice session begins, it atomically claims the lease, alerting any active desktop session to pause or hand off gracefully.

### 2.4 Existing Windows Agent & Tool Architecture
The Windows desktop application exposes 52 native tools (`src/shared/jessNativeToolNames.ts`):
- **Window Management**: `list_windows`, `manage_windows` (minimize, maximize, restore, snap left/right/center, bring to front, close).
- **Input Simulation**: `control_mouse`, `drag_windows_mouse`, `type_windows_text`, `press_windows_keys`, `manage_windows_clipboard`.
- **Screen & UI Automation**: `take_windows_screenshot`, `read_windows_screen`, `find_windows_ui_element`, `list_windows_ui_elements`, `invoke_windows_ui_element`.
- **System & Apps**: `launch_windows_application` (Calculator, Notepad, Paint, Explorer, Task Manager, Edge, Chrome, Word, Excel, Teams, VS Code), `open_local_windows_path`, `get_windows_time`, `get_windows_system_info`, `control_system_volume`, `control_screen_brightness`, `control_windows_power`.
- **Commands & Storage**: `run_windows_command_native`, `scan_windows_storage`, `clean_windows_storage_candidates`, `manage_windows_files`.
- **Browser Automation**: `chrome_bridge_status`, `chrome_list_tabs`, `chrome_open_tab`, `chrome_read_page`, `chrome_click_element`, `chrome_fill_field`.

---

## 3. Android vs. Windows Device Capabilities Matrix

| Capability Category | Windows Native Agent (`jess-agent.ps1`) | Android Native App (Private Build) | Cross-Device Coordination Mechanism |
| :--- | :--- | :--- | :--- |
| **OS Window Control** | Win32 API (`SetWindowPos`, `ShowWindow`) | Multi-window / Picture-in-Picture / Floating Bubble | Android triggers Windows window commands via Cloud Queue |
| **Input Injection** | Windows `SendInput` (Mouse/Keyboard/Keys) | Android `AccessibilityService` (Click, Gesture, Text input) | Android triggers Windows input; Windows cannot inject into Android |
| **Screen Reading / OCR** | Windows UI Automation (`IUIAutomation`) + Windows.Media.Ocr | Android `AccessibilityNodeInfo` tree inspection + `MediaProjection` | Both capture screen context locally; results shareable via Jess context |
| **App Launching** | Start Menu, PATH, `explorer.exe <uri>` | Android `Intent` / `PackageManager` launch | Android can request Windows to launch PC apps; Windows can trigger Android intents |
| **Shell Commands** | Bounded PowerShell runner | Termux/Local shell (if configured) or privileged intent receiver | Security policy prevents arbitrary cross-machine destructive commands |
| **Audio / Voice** | WebAudio via Electron, live PCM stream | Android `AudioRecord` (16kHz 16-bit PCM) & `AudioTrack` | Unified Live WebSocket protocol (`/api/live-ws`) |
| **Clipboard** | Win32 Clipboard API | Android `ClipboardManager` | Bi-directional clipboard sync through `users/{userId}/private/clipboardSync` |
| **Telephony / SMS** | Not available | Android `TelephonyManager`, SMS receiver, Contacts provider | Android provides mobile telephony telemetry to Windows Jess |
| **Location / Sensors**| Wi-Fi geolocation / Windows Location API | Android Fused Location Provider, Battery Manager, Sensors | Android streams mobile hardware state to user context |

---

## 4. Cross-Device Communication Architecture (Android to Windows)

To allow the Android app to command and monitor the registered Windows laptop securely without requiring public IP forwarding or dynamic DNS, Hub-Mind employs a **Dual-Channel Control Transport**:

```
 ┌────────────────────────────────────────────────────────┐
 │                   Cloud Firestore                      │
 │                                                        │
 │  users/{userId}/devices/{deviceId}                     │
 │    ├── status: "online" | "busy" | "offline"           │
 │    ├── platform: "windows" | "android"                 │
 │    ├── capabilities: ["window_management", ...]        │
 │    └── lastSeenAt: Timestamp                           │
 │                                                        │
 │  users/{userId}/deviceCommands/{commandId}             │
 │    ├── targetDeviceId: "win-workstation-01"            │
 │    ├── sourceDeviceId: "android-pixel-01"              │
 │    ├── toolName: "launch_windows_application"          │
 │    ├── args: { "appName": "vscode" }                   │
 │    ├── status: "pending" | "acknowledged" | "completed"│
 │    ├── result: { "ok": true, "verified": true }        │
 │    └── createdAt / completedAt                         │
 └──────────────┬──────────────────────────▲──────────────┘
                │                          │
        Firestore Watcher          Firestore Watcher
         (Snapshot Flow)            (Snapshot Flow)
                │                          │
 ┌──────────────▼─────────────┐   ┌────────┴───────────────────┐
 │   Android Mobile Client    │   │  Windows Desktop Client    │
 │   - HubMind Android App    │   │  - Electron + jess-agent   │
 │   - Native Jess Voice/Chat │   │  - Full Control Session    │
 │   - Dispatches PC commands │   │  - Executes native Win32   │
 └────────────────────────────┘   └────────────────────────────┘
                │                               ▲
                │      Local Subnet Bridge      │
                └──────(mDNS / HTTPS RPC)───────┘
                     (Optional Low-Latency LAN)
```

### 4.1 Interface Specification: Cloud Command Queue (Firestore Transport)

#### Device Registration Schema (`users/{userId}/devices/{deviceId}`):
```json
{
  "deviceId": "win-main-workstation",
  "deviceName": "ThinkPad P1 Gen 6 (Windows 11)",
  "platform": "windows",
  "clientVersion": "2.4.0",
  "status": "online",
  "fullControlActive": true,
  "permissionMode": "allow-routine",
  "capabilities": [
    "window_management",
    "mouse_keyboard_input",
    "screen_reading",
    "app_launch",
    "powershell_execution",
    "chrome_automation"
  ],
  "lastSeenAt": "2026-11-01T23:50:00Z",
  "localIp": "192.168.1.142",
  "localPort": 28443
}
```

#### Device Command Schema (`users/{userId}/deviceCommands/{commandId}`):
```json
{
  "commandId": "cmd-9f204a11",
  "sourceDeviceId": "android-phone-01",
  "targetDeviceId": "win-main-workstation",
  "toolName": "take_windows_screenshot",
  "arguments": {
    "monitorIndex": 0
  },
  "status": "pending",
  "executionPolicy": "require_online",
  "createdAt": "2026-11-01T23:51:10Z",
  "acknowledgedAt": null,
  "completedAt": null,
  "result": null,
  "error": null
}
```

### 4.2 Local Network Transport (`LocalSubnetTransport`)
When Android and the Windows laptop share the same Wi-Fi network:
1. Windows Electron app announces service via mDNS (`_hubmind-jess._tcp.local.`).
2. Android detects Windows IP and validates TLS certificate fingerprint pinned in the user's Firestore device record.
3. High-bandwidth requests (e.g., live screen streaming or low-latency remote touchpad gestures) bypass cloud storage and execute over local HTTPS JSON-RPC.

---

## 5. Android Clean Architecture Implementation

The Android app follows Clean Architecture with unidirectional data flow (MVI / MVVM):

```
┌────────────────────────────────────────────────────────┐
│             UI Layer (Jetpack Compose & M3)             │
│  - AuthenticationScreen                                │
│  - JessHomeScreen (Voice Orb, Chat, Live Status)       │
│  - DevicesScreen (Android & Windows nodes, Pings)      │
│  - ActivityScreen (Task Timeline & Execution Traces)   │
│  - SettingsScreen (Permissions, Device Agent Setup)    │
└──────────────────────────┬─────────────────────────────┘
                           │ State & Events
┌──────────────────────────▼─────────────────────────────┐
│                   ViewModel Layer                      │
│  - AuthViewModel                                       │
│  - JessHomeViewModel                                   │
│  - DevicesViewModel                                    │
│  - ActivityViewModel                                   │
│  - SettingsViewModel                                   │
└──────────────────────────┬─────────────────────────────┘
                           │ Coroutines & StateFlow
┌──────────────────────────▼─────────────────────────────┐
│                   Domain Layer                         │
│  - JessRepository & VoiceInteractionRepository         │
│  - ConversationRepository & MemoryRepository           │
│  - DeviceRegistryRepository & DeviceControlRepository  │
│  - PermissionStatusRepository                          │
│  - AndroidAgentController                              │
└──────────────────────────┬─────────────────────────────┘
                           │ Data Operations
┌──────────────────────────▼─────────────────────────────┐
│                   Data Layer                           │
│  - FirestoreDataSource (users, tasks, devices, logs)   │
│  - HubMindBackendApi (Retrofit / OkHttp REST)          │
│  - LiveAudioWebSocketClient (Gemini Live PCM streaming)│
│  - AndroidNativeAgentService (Accessibility, Media)    │
│  - DeviceControlDispatcher (Cloud & Local Transports)  │
└────────────────────────────────────────────────────────┘
```

---

## 6. Security Boundaries for Private Distribution

As a personal, privately distributed APK:
1. **No Sensitive Keys in Binary**: Firebase service account keys and Gemini API keys reside on the secure backend server. The Android app only uses client Firebase initialization and authenticated JWT Bearer tokens.
2. **Strict User Identity Gate**: Reads and writes are scoped to `request.auth.uid == userId`.
3. **Explicit Consent for Device Control**: Remote actions on the Windows PC require active `Full Control Session` state on Windows. Android actions require explicitly granted Android runtime permissions (Accessibility Service, Audio Recording, Media Projection).
