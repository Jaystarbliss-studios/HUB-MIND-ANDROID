import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = path => readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('Windows transcript overlay is transparent and forwards all pointer input to the underlying app', async () => {
  const main = await read('../../electron/main.cjs');
  const css = await read('../../src/pages/jess-transcript-overlay.css');
  const globalCss = await read('../../src/index.css');
  const createStart = main.indexOf('function createTranscriptOverlayWindow');
  const createEnd = main.indexOf('\nfunction ', createStart + 10);
  assert.ok(createStart >= 0 && createEnd > createStart);
  const create = main.slice(createStart, createEnd);
  assert.match(create, /transparent:\s*true/);
  assert.match(create, /backgroundColor:\s*['"]#00000000['"]/i);
  assert.match(main, /setIgnoreMouseEvents\(true,\s*\{\s*forward:\s*true\s*\}\)/);
  assert.match(main, /overlay\.setFocusable\(false\)/);
  assert.doesNotMatch(main, /setBackgroundMaterial\(['"]acrylic['"]\)/);
  assert.match(css, /background:\s*transparent\s*!important/);
  assert.match(css, /backdrop-filter:\s*none/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(globalCss, /html:root:has\(\.jess-transcript-overlay-page\)[\s\S]*?background:\s*transparent\s*!important/);
  assert.match(globalCss, /body:has\(\.jess-transcript-overlay-page\)[\s\S]*?#root:has\(\.jess-transcript-overlay-page\)/);
});

test('Windows desktop registers and polls as a shared device while commands stay gated by local Full Control', async () => {
  const main = await read('../../electron/main.cjs');
  const preload = await read('../../electron/preload.cjs');
  const auth = await read('../../src/lib/auth.tsx');
  const server = await read('../../server.ts');
  assert.match(main, /function getDesktopDeviceId/);
  assert.match(main, /function registerDesktopDevice/);
  assert.match(main, /function pollDesktopDeviceCommands/);
  assert.match(main, /setInterval\(\(\) => void pollDesktopDeviceCommands\(\), 3500\)/);
  assert.match(main, /fullControlActive \|\| !controlSessionSecret/);
  assert.match(main, /processDesktopDeviceCommand/);
  assert.match(preload, /setDeviceSession/);
  assert.match(auth, /desktopBridge\?\.setDeviceSession/);
  assert.match(server, /'WINDOWS'/);
  assert.match(server, /fullControlActive !== true/);
});

test('Jess shared device command tool supports both Android and Windows endpoints', async () => {
  const assistant = await read('../../src/components/JessFloatingAssistant.tsx');
  const tools = await read('../../src/lib/jessTools.ts');
  const server = await read('../../server.ts');
  const main = await read('../../electron/main.cjs');
  assert.match(assistant, /Control target device/);
  assert.match(assistant, /onTargetDeviceSelected/);
  assert.match(tools, /name: 'dispatch_device_command'/);
  assert.match(tools, /targetDeviceId/);
  assert.match(server, /const windowsActionTypes = new Set/);
  assert.match(server, /'start_windows_auto_scroll'/);
  assert.match(main, /case 'start_windows_auto_scroll'/);
  assert.match(main, /case 'show_hub_mind_workspace'/);
  assert.match(main, /case 'jess_stop'/);
  assert.match(main, /READ_ONLY_COMMANDS\[commandName\]/);
});

test('Android screen sharing uses user-consented MediaProjection and an active foreground service', async () => {
  const capture = await read('../../app/src/main/java/com/example/hubmind/agent/AndroidScreenCaptureManager.kt');
  const service = await read('../../app/src/main/java/com/example/hubmind/agent/HubMindAgentForegroundService.kt');
  const bridge = await read('../../app/src/main/java/com/example/hubmind/agent/HubMindNativeBridge.kt');
  const manifest = await read('../../app/src/main/AndroidManifest.xml');
  const assistant = await read('../../src/components/JessFloatingAssistant.tsx');
  assert.match(capture, /getMediaProjection\(resultCode, resultData\)/);
  assert.match(capture, /createVirtualDisplay/);
  assert.match(capture, /registerCallback/);
  assert.match(service, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
  assert.match(manifest, /FOREGROUND_SERVICE_MEDIA_PROJECTION/);
  assert.match(bridge, /requestScreenCapture/);
  assert.match(assistant, /hubmind-native-screen-share/);
  assert.match(assistant, /sendScreenFrame\(detail\.dataUrl\)/);
});

test('Android Jess transcript overlay does not consume touch or keyboard focus', async () => {
  const overlay = await read('../../app/src/main/java/com/example/hubmind/agent/JessTranscriptOverlayManager.kt');
  const bridge = await read('../../app/src/main/java/com/example/hubmind/agent/HubMindNativeBridge.kt');
  const settings = await read('../../app/src/main/java/com/example/hubmind/ui/screens/settings/SettingsScreen.kt');
  const assistant = await read('../../src/components/JessFloatingAssistant.tsx');
  assert.match(overlay, /FLAG_NOT_FOCUSABLE/);
  assert.match(overlay, /FLAG_NOT_TOUCHABLE/);
  assert.match(overlay, /PixelFormat\.TRANSLUCENT/);
  assert.match(bridge, /onJessTranscript/);
  assert.match(settings, /ACTION_MANAGE_OVERLAY_PERMISSION/);
  assert.match(assistant, /onJessTranscript\?\./);
});

test('Android Jess voice session declares the microphone foreground service type', async () => {
  const service = await read('../../app/src/main/java/com/example/hubmind/agent/HubMindAgentForegroundService.kt');
  const bridge = await read('../../app/src/main/java/com/example/hubmind/agent/HubMindNativeBridge.kt');
  const manifest = await read('../../app/src/main/AndroidManifest.xml');
  const assistant = await read('../../src/components/JessFloatingAssistant.tsx');
  assert.match(manifest, /FOREGROUND_SERVICE_MICROPHONE/);
  assert.match(manifest, /specialUse\|mediaProjection\|microphone/);
  assert.match(service, /FOREGROUND_SERVICE_TYPE_MICROPHONE/);
  assert.match(bridge, /onJessVoiceSessionActive/);
  assert.match(assistant, /onJessVoiceSessionActive\?\./);
});

test('Android and Windows clients synchronize the selected device target', async () => {
  const activity = await read('../../app/src/main/java/com/example/hubmind/MainActivity.kt');
  const bridge = await read('../../app/src/main/java/com/example/hubmind/agent/HubMindNativeBridge.kt');
  const repo = await read('../../app/src/main/java/com/example/hubmind/data/repository/RepositoryImpls.kt');
  const assistant = await read('../../src/components/JessFloatingAssistant.tsx');
  assert.match(repo, /DEVICES_API_URL/);
  assert.match(repo, /activeTargetDeviceId/);
  assert.match(activity, /hubmind-target-device-changed/);
  assert.match(bridge, /onTargetDeviceSelected/);
  assert.match(assistant, /activeTargetDeviceId/);
});
