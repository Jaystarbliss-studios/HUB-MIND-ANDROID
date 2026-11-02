# Hub-Mind Optional Advanced Control Provider (Shizuku / ADB Bridge)

## 1. Overview & Capability Boundary

While `HubMindAccessibilityService` handles standard UI inspection and gesture dispatching, certain low-level system actions on Android are restricted by the operating system:
- Key event injection during secure PIN/Password entry screens
- Direct background touch injection across protected system dialogs
- System setting toggles (e.g. Wi-Fi, Bluetooth) on Android 10+
- Unrestricted Process listing (`ps -A`)

To support owner-authorized power features without requiring root access, Hub-Mind includes an optional `AdvancedDeviceControlProvider` interface that integrates with **Shizuku** or a user-authorized **Wireless Debugging (ADB)** bridge.

---

## 2. Supported Environments & Activation Requirements

| Environment | Supported Android Versions | Activation Requirement | Reboot Persistence | Security & Risk Profile |
| :--- | :--- | :--- | :--- | :--- |
| **Shizuku Service** | Android 8.0 - 15+ | Shizuku app installed; authorized via Wireless Debugging or PC `adb server` once per boot | Requires re-activation after phone reboot | Isolated IPC binder connection with explicit per-app permission prompt |
| **Wireless Debugging (ADB)** | Android 11+ | Pair via 6-digit Wireless Debugging code in Developer Options | Requires re-pairing if port changes on reboot | Localhost ADB connection bounded by allowlisted commands |

---

## 3. Architecture & Interface Design

```kotlin
interface AdvancedDeviceControlProvider {
    val isAvailable: Boolean
    val providerName: String
    suspend fun executeAdbShellCommand(allowlistedCommand: String, args: List<String>): String
    suspend fun injectKeyEvent(keyCode: Int): Boolean
    suspend fun dumpUiAutomationXml(): String?
}
```

### Allowlisted ADB Commands:
To avoid arbitrary command execution risks, `AdvancedDeviceControlProvider` restricts shell inputs strictly to pre-validated commands:
- `input keyevent <code`
- `input tap <x> <y>`
- `input swipe <x1> <y1> <x2> <y2> <duration>`
- `screencap -p`
- `uiautomator dump`
- `settings get/put <namespace> <key> <value>`

Commands containing shell chaining (`&&`, `;`, `|`), redirection (`>`, `<`), or non-allowlisted binaries are rejected immediately.

---

## 4. Fallback Behavior

If Shizuku or Wireless Debugging is not installed or enabled:
1. `AdvancedDeviceControlProvider.isAvailable` evaluates to `false`.
2. All UI automation and gesture actions gracefully fall back to `HubMindAccessibilityService`.
3. The user is presented with a clear status indicator in **Settings > Advanced Device Control Setup**.
