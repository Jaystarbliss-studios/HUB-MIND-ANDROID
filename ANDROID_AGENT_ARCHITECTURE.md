# Hub-Mind Native Android Device Agent Architecture

## 1. Executive Overview

The Hub-Mind Native Android Agent allows **Jess** to perform owner-authorized automation on the user's Android phone. Adapted directly from Google's open-source **ARTEMIS** project (`com.artemis.helper`), the automation engine is integrated natively into the single Kotlin/Compose app module (`com.example.hubmind.agent`).

No external plugins, local server sockets, or third-party background services are required. Commands arrive via the authenticated Hub-Mind cloud transport and execute through a modular local pipeline.

---

## 2. Agent Component Map

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     Hub-Mind Authenticated Transport                     │
│               (Firestore Queue / Encrypted Local RPC)                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Validated AndroidCommand
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      AndroidUiActionExecutor                            │
│  - Command Validation & Expiry Check                                    │
│  - Audit Logging & Sensitive Action Confirmation                         │
└──────────┬─────────────────────────┬──────────────────────────┬─────────┘
           │                         │                          │
           ▼                         ▼                          ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  HubMindAccessibility│  │AndroidAppLauncher &  │  │ AndroidScreenCapture │
│       Service        │  │ GlobalActionControl  │  │       Manager        │
│  - HierarchyDumper   │  │ - Installed Packages │  │ - MediaProjection    │
│  - GestureController │  │ - Intents & Nav      │  │ - Foreground Service │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### Core Classes & Interfaces:

1. **`HubMindAccessibilityService`**: Standard Android `AccessibilityService` subclass that retains static singleton access for UI hierarchy node retrieval (`rootInActiveWindow`) and gesture dispatching (`dispatchGesture`).
2. **`AndroidUiHierarchyInspector`**: Traverses the active `AccessibilityNodeInfo` tree, converting system nodes into lightweight JSON-serializable `UiNodeInfo` models (extracting bounds, resource IDs, text, content descriptions, clickable/editable flags).
3. **`AndroidGestureController`**: Constructs stroke paths (`Path`) and dispatches `GestureDescription` strokes for single tap, double tap, long press, swipe, and scroll.
4. **`AndroidUiActionExecutor`**: Central router for local `AndroidCommand` instances. Dispatches actions to appropriate system controllers and wraps output into `AndroidActionResult`.
5. **`AndroidAppLauncher`**: Queries `PackageManager` for launchable applications (`ACTION_MAIN` / `CATEGORY_LAUNCHER`) and resolves package names by display name or partial query.
6. **`AndroidGlobalActionController`**: Triggers system-level navigation (`GLOBAL_ACTION_BACK`, `GLOBAL_ACTION_HOME`, `GLOBAL_ACTION_RECENTS`, `GLOBAL_ACTION_NOTIFICATIONS`, `GLOBAL_ACTION_QUICK_SETTINGS`).
7. **`AndroidScreenCaptureManager`**: Handles `MediaProjectionManager` consent tokens and manages the `HubMindAgentForegroundService` notification.
8. **`AndroidClipboardController`**: Manages `ClipboardManager` primary clip reads and writes.
9. **`AdvancedDeviceControlProvider`**: Optional interface for Shizuku / Wireless Debugging ADB bridge operations.

---

## 3. Local Command Protocol Schema

Every action executed on the phone is represented as an `AndroidCommand`:

```kotlin
data class AndroidCommand(
    val commandId: String = UUID.randomUUID().toString(),
    val actionType: AndroidActionType,
    val parameters: Map<String, Any> = emptyMap(),
    val targetNodeId: String? = null,
    val expiryTimestamp: Long = System.currentTimeMillis() + 30000,
    val requiresConfirmation: Boolean = false
)
```

### Supported Action Types:
- `TAP`, `DOUBLE_TAP`, `LONG_PRESS`, `SWIPE`, `SCROLL`
- `TYPE_TEXT`, `CLEAR_TEXT`
- `OPEN_APP`, `GET_INSTALLED_APPS`
- `GET_SCREEN_HIERARCHY`, `CAPTURE_SCREEN`
- `SET_CLIPBOARD`, `GET_CLIPBOARD`
- `NAVIGATE_BACK`, `GO_HOME`, `OPEN_RECENTS`, `OPEN_NOTIFICATIONS`, `OPEN_QUICK_SETTINGS`

---

## 4. Security & Audit Policy

1. **No Open Server Ports**: ARTEMIS's original TCP `CommandServer` socket has been removed in favor of Hub-Mind's authenticated transport.
2. **Confirmation Gate for Sensitive Actions**: Operations like clearing inputs, text entry into non-standard fields, or app launch verify user authorization.
3. **Foreground Notification**: Active device control and screen capture maintain a persistent notification (`HubMindAgentForegroundService`).
