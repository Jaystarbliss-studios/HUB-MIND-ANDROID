# Hub-Mind Windows Agent Adaptation Contract

## 1. Overview

To allow the existing Windows Electron companion app (`electron/main.cjs`, `electron/agentBridge.cjs`, `electron/jess-agent.ps1`) to receive and execute commands dispatched from the Android app, the following adaptations are specified for the Windows application.

---

## 2. Main Process Listener Addition (`electron/main.cjs`)

The Windows main process must initialize a device registration heartbeat and a Firestore snapshot listener on `users/{userId}/deviceCommands`:

```javascript
// Add to electron/main.cjs
function setupCrossDeviceCommandListener(userId) {
  const commandsRef = db.collection('users').doc(userId).collection('deviceCommands');
  commandsRef.where('targetDeviceId', '==', myWindowsDeviceId)
             .where('status', '==', 'pending')
             .onSnapshot(snapshot => {
               snapshot.docChanges().forEach(change => {
                 if (change.type === 'added') {
                   const cmd = change.doc.data();
                   executeRemoteCommandFromAndroid(change.doc.id, cmd);
                 }
               });
             });
}

async function executeRemoteCommandFromAndroid(docId, cmd) {
  // Dispatch tool via nativeAgent.call(cmd.toolName, cmd.args)
  const result = await nativeAgent.call(cmd.toolName, cmd.arguments);
  await db.collection('users').doc(userId).collection('deviceCommands').doc(docId).update({
    status: result.ok ? 'completed' : 'failed',
    completedAt: new Date().toISOString(),
    result
  });
}
```

---

## 3. Tool Mapping Compatibility

All 52 existing Win32 tools declared in `src/shared/jessNativeToolNames.ts` (`launch_windows_application`, `manage_windows`, `take_windows_screenshot`, `get_windows_system_info`, `control_system_volume`, etc.) are directly invokable by Jess when targeting the Windows laptop from Android.
