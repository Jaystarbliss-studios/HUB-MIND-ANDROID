# Hub-Mind Android Agent Capabilities Matrix

| Capability | Standard App Permissions | Accessibility Enabled | MediaProjection Consent | Optional Advanced Provider (Shizuku/ADB) | Status in Private Build |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **List Installed Apps** | Yes (`QUERY_ALL_PACKAGES`) | Yes | Yes | Yes | **Working** |
| **Launch Installed App** | Yes (`Intent`) | Yes | Yes | Yes | **Working** |
| **Inspect UI Node Hierarchy** | No | Yes (`rootInActiveWindow`) | No | Yes (`uiautomator dump`) | **Working** |
| **Extract Screen Text & Bounds** | No | Yes | No | Yes | **Working** |
| **Tap / Double Tap / Long Press** | No | Yes (`dispatchGesture`) | No | Yes (`input tap`) | **Working** |
| **Swipe / Scroll Gestures** | No | Yes (`dispatchGesture`) | No | Yes (`input swipe`) | **Working** |
| **Type & Clear Text** | No | Yes (`ACTION_SET_TEXT`) | No | Yes (`input text`) | **Working** |
| **Global Nav (Back, Home, Recents)** | No | Yes (`performGlobalAction`) | No | Yes (`input keyevent`) | **Working** |
| **System Notifications / Quick Settings** | No | Yes | No | Yes | **Working** |
| **Screen Capture (Screenshot)** | No | Yes (Android 11+ `takeScreenshot`) | Yes (`MediaProjection`) | Yes (`screencap`) | **Working** |
| **Read / Write System Clipboard** | Yes (Foreground) | Yes | Yes | Yes | **Working** |
| **System Volume & Mute** | Yes (`AudioManager`) | Yes | Yes | Yes | **Working** |
| **Battery Level & Charging Status** | Yes (`BatteryManager`) | Yes | Yes | Yes | **Working** |
| **Background Silent Key Injection** | No | No (Requires Active Window) | No | Yes | **Advanced Provider Only** |
| **Bypass Lock Screen / Biometrics** | No | No | No | No | **Forbidden / Not Supported** |

---

## Requirements for Setup

1. **Accessibility Service**: User must manually enable `Hub-Mind Agent` in **Android Settings > Accessibility > Downloaded Apps**.
2. **Overlay Permission (`SYSTEM_ALERT_WINDOW`)**: Optional permission for displaying the floating Jess Orb on top of other applications.
3. **Screen Capture Consent**: Required once per session when capturing full screen buffers via `MediaProjection`.
