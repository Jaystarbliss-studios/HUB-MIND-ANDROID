import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('Chrome native host and desktop bridge use the same bounded named-pipe protocol', async () => {
  const [bridge, host, project] = await Promise.all([
    read('electron/chromeBridge.cjs'),
    read('native/JessChromeNativeHost/Program.cs'),
    read('native/JessChromeNativeHost/JessChromeNativeHost.csproj'),
  ]);
  assert.match(bridge, /hubmind-jess-chrome-v1/);
  assert.ok(bridge.includes("socket.write(JSON.stringify({ type: 'hello-ack' }) + '\\n');"), 'the native-host handshake acknowledgement must end with a real newline');
  assert.match(bridge, /serverListening/);
  assert.match(bridge, /pendingRequests/);
  assert.match(bridge, /lastHandshakeAt/);
  assert.match(bridge, /lastDisconnectAt/);
  assert.match(bridge, /function scheduleServerRestart\(\)/);
  assert.match(bridge, /serverRestartAttempt/);
  assert.match(bridge, /instance\.on\('error'/);
  assert.match(host, /hubmind-jess-chrome-v1/);
  assert.match(host, /AllowedOrigin/);
  assert.match(host, /baifedjcpcnkjjoikbafnkiombiaooai/);
  assert.match(host, /ReadUInt32LittleEndian/);
  assert.match(host, /WriteUInt32LittleEndian/);
  assert.match(host, /MaxMessageBytes = 1024 \* 1024/);
  assert.match(host, /Could not connect to the Hub-Mind named pipe/);
  assert.match(host, /Could not read the per-user Jess bridge token/);
  assert.match(host, /native-messaging bridge stopped/);
  assert.match(project, /net8\.0/);
});

test('Chrome native host installer is pinned to the extension origin and registers per-user only', async () => {
  const [installer, manifest] = await Promise.all([
    read('scripts/install-jess-chrome-bridge.ps1'),
    read('chrome-extension/manifest.json'),
  ]);
  const extension = JSON.parse(manifest);
  assert.ok(extension.key);
  assert.match(installer, /HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts/);
  assert.match(installer, /baifedjcpcnkjjoikbafnkiombiaooai/);
  assert.match(installer, /allowed_origins/);
  assert.match(installer, /JessChromeNativeHost\.exe/);
});

test('Chrome actions are gated by the signed-in Full Control Session and close requires an explicit tab ID', async () => {
  const [main, tools, worker] = await Promise.all([
    read('electron/main.cjs'),
    read('src/lib/jessTools.ts'),
    read('chrome-extension/service-worker.js'),
  ]);
  assert.match(main, /Chrome control requires an active Full Control Session/);
  assert.match(main, /hubmind:chrome-action/);
  assert.match(tools, /chrome_close_tab/);
  assert.match(tools, /name: 'chrome_bridge_status'/);
  assert.match(tools, /desktop\.chromeStatus\(\)/);
  assert.match(worker, /A specific tabId is required to close a tab/);
  assert.match(worker, /chrome\.tabs\.query\(\{\}\)/);
  assert.match(worker, /password, payment, card, security-code or one-time-code fields/);
});

test('offline Windows wake listener requires consent and uses local System.Speech', async () => {
  const [wake, main, preload, assistant] = await Promise.all([
    read('native/JessOfflineWake/Program.cs'),
    read('electron/main.cjs'),
    read('electron/preload.cjs'),
    read('src/components/JessFloatingAssistant.tsx'),
  ]);
  assert.match(wake, /System\.Speech\.Recognition/);
  assert.match(wake, /Windows System\.Speech offline recognizer/);
  assert.match(main, /Enable local Jess wake-word detection/);
  assert.match(main, /offlineWakeConsentGranted = choice\.response === 1/);
  assert.match(preload, /onOfflineWake/);
  assert.match(assistant, /startOfflineWake/);
});

test('screen reading has a bounded local Windows OCR fallback and removes temporary screenshots', async () => {
  const [main, ocr, project, builder] = await Promise.all([
    read('electron/main.cjs'),
    read('native/JessWindowsOcr/Program.cs'),
    read('native/JessWindowsOcr/JessWindowsOcr.csproj'),
    read('electron-builder.yml'),
  ]);
  assert.match(main, /readWindowsOcrFallback/);
  assert.match(main, /25 \* 1024 \* 1024/);
  assert.match(main, /fs\.unlinkSync\(tempPath\)/);
  assert.match(ocr, /Windows\.Media\.Ocr/);
  assert.match(ocr, /TryCreateFromUserProfileLanguages/);
  assert.match(project, /net8\.0-windows10\.0\.26100\.0/);
  assert.match(builder, /JessWindowsOcr\.exe/);
});


test('native desktop bridge exposes actionable helper health without leaking credentials', async () => {
  const [agent, main] = await Promise.all([
    read('electron/agentBridge.cjs'),
    read('electron/main.cjs'),
  ]);
  assert.match(agent, /function status\(\)/);
  assert.match(agent, /pendingRequests/);
  assert.match(agent, /lastStartedAt/);
  assert.match(agent, /lastExitedAt/);
  assert.match(agent, /lastError/);
  assert.match(agent, /scriptExists/);
  assert.match(agent, /safeDiagnostic/);
  assert.match(agent, /\[redacted\]/);
  assert.match(agent, /module\.exports = \{ call, stop, status \}/);
  assert.match(main, /helper: nativeAgent\.status\(\), chrome: chromeBridge\.status\(\)/);
});

test('native desktop bridge exposes actionable diagnostics and performs a harmless end-to-end probe', async () => {
  const [bridge, main, tools] = await Promise.all([
    read('electron/agentBridge.cjs'),
    read('electron/main.cjs'),
    read('src/lib/jessTools.ts'),
  ]);
  assert.match(bridge, /function status\(\)/);
  assert.match(bridge, /lastError/);
  assert.match(bridge, /scriptExists/);
  assert.match(main, /helper: nativeAgent\.status\(\)/);
  assert.match(tools, /name: 'native_bridge_status'/);
  assert.match(tools, /desktop\.nativeAction\('system_info', \{\}, user\.id, executionId\)/);
  assert.match(tools, /native helper did not complete the read-only round-trip/i);
});


test('Jess uses one renderer microphone owner across live audio, dictation, and desktop wake lifecycle', async () => {
  const [coordinator, live, dictation] = await Promise.all([
    read('src/services/jessVoiceSessionCoordinator.ts'),
    read('src/services/liveAudioClient.ts'),
    read('src/components/VoiceDictation.tsx'),
  ]);
  assert.match(coordinator, /export type JessAudioOwner = 'live-conversation' \| 'dictation'/);
  assert.match(coordinator, /export function claimJessAudio/);
  assert.match(coordinator, /if \(activeLease !== null\) return null/);
  assert.match(coordinator, /export function releaseJessAudio/);
  assert.match(live, /claimJessAudio\('live-conversation'\)/);
  assert.match(live, /releaseJessAudio\(this\.audioSessionLease\)/);
  assert.match(live, /stopOfflineWake\(\)/);
  assert.match(live, /if \(wakeStop\?\.error \|\| wakeStop\?\.stopped === false\)/);
  assert.match(live, /startOfflineWake\(\)/);
  assert.match(live, /disconnect\(false, false, false\)/);
  assert.match(dictation, /claimJessAudio\('dictation'\)/);
  assert.match(dictation, /releaseJessAudio\(lease\)/);
  assert.match(dictation, /Jess microphone is busy/);
  assert.match(dictation, /await desktop\.stopOfflineWake\(\)/);
  assert.match(dictation, /resumeDesktopWake\(\)/);
});

test('native helper status resolves the packaged or development script path before first launch', async () => {
  const bridge = await read('electron/agentBridge.cjs');
  assert.match(bridge, /function resolveScriptPath\(\)/);
  assert.match(bridge, /const scriptPath = lastScriptPath \|\| resolveScriptPath\(\)/);
  assert.ok(bridge.includes('app.asar.unpacked'));
  assert.ok(bridge.includes("'electron', 'jess-agent.ps1'"));
});

test('Windows screenshots support bounded high-detail capture without unbounded native bridge payloads', async () => {
  const [agent, bridge, main, tools, assistant] = await Promise.all([
    read('electron/jess-agent.ps1'),
    read('electron/agentBridge.cjs'),
    read('electron/main.cjs'),
    read('src/lib/jessTools.ts'),
    read('src/components/JessFloatingAssistant.tsx'),
  ]);
  assert.match(agent, /requestedMonitor = \[string\]\$a\.monitorName/);
  assert.match(agent, /High-detail capture must target one monitor/);
  assert.match(agent, /maxDimension = if \(\$detail -eq 'high'\) \{ 3200 \} else \{ 1920 \}/);
  assert.match(agent, /EncoderParameter\(\[System\.Drawing\.Imaging\.Encoder\]::Quality/);
  assert.match(agent, /exceeded the 8 MB image limit/);
  assert.match(agent, /exceeded the 2 MB per-monitor image limit/);
  assert.match(agent, /All-monitor capture is limited to four monitors/);
  assert.match(bridge, /MAX_RESPONSE_LINE_CHARS = 16 \* 1024 \* 1024/);
  const nativeHandler = main.indexOf("ipcMain.handle('hubmind:native-action'");
  const chromeHandler = main.indexOf("ipcMain.handle('hubmind:chrome-action'");
  const screenshotValidation = main.indexOf("if (method === 'screenshot')", nativeHandler);
  assert.ok(nativeHandler >= 0 && screenshotValidation > nativeHandler, 'screenshot options must be validated by the native action bridge');
  assert.match(tools, /detail: \{ type: 'string', enum: \['standard','high'\] \}/);
  assert.match(tools, /monitorName: String\(args\?\.monitorName \|\| 'primary'\)/);
  assert.match(assistant, /const selectedMonitor = monitors\.find\(\(monitor: any\) => monitor\.primary\) \|\| monitors\[0\]/);
  assert.match(assistant, /imageDeliveredToJess: monitor === selectedMonitor && delivered/);
  assert.match(assistant, /selected monitor screenshot was sent to Jess as an image frame/);
});

test('desktop dictation reuses the local Windows speech helper and the shared microphone owner', async () => {
  const [wake, main, preload, component, coordinator] = await Promise.all([
    read('native/JessOfflineWake/Program.cs'),
    read('electron/main.cjs'),
    read('electron/preload.cjs'),
    read('src/components/VoiceDictation.tsx'),
    read('src/services/jessVoiceSessionCoordinator.ts'),
  ]);
  assert.match(wake, /args\[i\] == "--mode"/);
  assert.match(wake, /mode == "dictation"/);
  assert.match(wake, /type = "dictation"/);
  assert.match(wake, /Windows System\.Speech local dictation/);
  assert.match(main, /ipcMain\.handle\('hubmind:offline-dictation-start'/);
  assert.match(main, /startOfflineRecognizer\(event, 'dictation'\)/);
  assert.match(main, /offlineWakeMode === mode/);
  assert.match(main, /hubmind:offline-dictation/);
  assert.match(preload, /startOfflineDictation/);
  assert.match(preload, /onOfflineDictation/);
  assert.match(component, /desktop\.startOfflineDictation\(\)/);
  assert.match(component, /nativeDictationActiveRef/);
  assert.match(component, /onTranscriptRef\.current/);
  assert.match(component, /claimJessAudio\('dictation'\)/);
});

test('live screen sharing sends bounded HD frames and reports repeated delivery failures', async () => {
  const assistant = await read('src/components/JessFloatingAssistant.tsx');
  assert.match(assistant, /frameRate: \{ ideal: 1, max: 2 \}/);
  assert.match(assistant, /1920 \/ sourceWidth/);
  assert.match(assistant, /1920 \/ sourceHeight/);
  assert.match(assistant, /toDataURL\('image\/jpeg', 0\.84\)/);
  assert.match(assistant, /setInterval\(sendFrame, 1000\)/);
  assert.match(assistant, /consecutiveFrameFailures >= 3/);
  assert.match(assistant, /Jess is not receiving screen frames/);
  assert.match(assistant, /HD snapshots about once per second/);
});
