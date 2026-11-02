import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const coordinator = fs.readFileSync(new URL('../../src/services/jessSessionCoordinator.ts', import.meta.url), 'utf8');
const assistant = fs.readFileSync(new URL('../../src/components/JessFloatingAssistant.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const companionCss = fs.readFileSync(new URL('../../src/pages/companion.css', import.meta.url), 'utf8');
const electron = fs.readFileSync(new URL('../../electron/main.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../../electron/preload.cjs', import.meta.url), 'utf8');
const tools = fs.readFileSync(new URL('../../src/lib/jessTools.ts', import.meta.url), 'utf8');
const live = fs.readFileSync(new URL('../../src/services/liveAudioClient.ts', import.meta.url), 'utf8');
const orb = fs.readFileSync(new URL('../../src/pages/CompanionPage.tsx', import.meta.url), 'utf8');

test('Jess voice sessions coordinate through a per-user Firestore lease', () => {
  assert.match(coordinator, /runTransaction/);
  assert.match(coordinator, /leaseUntil/);
  assert.match(coordinator, /watchJessSession/);
  assert.match(assistant, /claimJessSession/);
  assert.match(assistant, /renewJessSession/);
  assert.match(assistant, /releaseJessSession\(previousLease\.userId, previousLease\.sessionId\)/);
  assert.match(assistant, /Jess is already active in/);
  assert.match(assistant, /jessActivationRequest/);
  assert.match(assistant, /!orbDismissed && !isDesktopShell/);
});

test('transparent companion styles stay scoped to the companion route', () => {
  assert.ok(companionCss.includes('body:has(.jess-orb-window)'));
  assert.ok(!/^html,body,#root\{/m.test(companionCss));
  assert.ok(!app.includes("import './pages/companion.css';"));
});

test('desktop workspace and local Jess character visibility follow the current lifecycle', () => {
  assert.ok(electron.includes("mainWindow.on('show', () => { createCompanionWindow(); positionCompanionBottomRightIfNeeded(); });"));
  assert.ok(electron.includes("mainWindow.on('restore', () => { createCompanionWindow(); positionCompanionBottomRightIfNeeded(); });"));
  assert.ok(electron.includes("mainWindow.on('minimize', () => { createCompanionWindow();"));
  assert.ok(electron.includes("mainWindow.on('close', (event) => { if (!quitting)"));
  assert.ok(electron.includes('width: JESS_PET_WIDTH, height: JESS_PET_HEIGHT'));
  assert.ok(electron.includes("loadFile(path.join(__dirname, 'jess-pet', 'index.html'))"));
  assert.ok(!electron.includes("loadURL(APP_URL + '/companion')"));
  assert.ok(electron.includes('hubmind:set-companion-transcript-visible'));
  assert.ok(electron.includes('hubmind:hide-companion'));
  assert.ok(electron.includes('hubmind:move-companion-by'));
  assert.ok(orb.includes('JessOrbVisualizer'));
  assert.ok(orb.includes('hideCompanion'));
  assert.ok(orb.includes('moveCompanionBy'));
});

test('native Windows tools use a full-control session, narrow preload bridge and honesty protocol', () => {
  assert.match(tools, /jess_full_control/);
  assert.match(tools, /jess_stop/);
  assert.match(tools, /list_windows/);
  assert.match(tools, /manage_windows/);
  assert.match(tools, /take_windows_screenshot/);
  assert.match(tools, /run_windows_command_native/);
  assert.match(preload, /hubmind:native-action/);
  assert.match(preload, /hubmind:full-control-start/);
  assert.match(preload, /hubmind:full-control-stop/);
  assert.match(electron, /Control\+Alt\+Shift\+J|Ctrl\+Alt\+Shift\+J/);
  assert.match(electron, /full-control-started/);
  assert.match(electron, /jess-native-audit\.jsonl/);
  assert.match(live, /NATIVE WINDOWS HONESTY PROTOCOL/);
  assert.match(live, /WEB RESEARCH/);
});
