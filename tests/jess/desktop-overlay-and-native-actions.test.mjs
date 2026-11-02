import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = (path) => readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('workspace theme remains dark regardless of operating system preference', async () => {
  const css = await read('../../src/index.css');
  assert.match(css, /color-scheme:\s*dark/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*light/);
  assert.match(css, /background-color:\s*#020617/i);
});

test('desktop companion is a local movable Jess character with close and hide controls', async () => {
  const main = await read('../../electron/main.cjs');
  const page = await read('../../src/pages/CompanionPage.tsx');
  assert.ok(main.includes('width: JESS_PET_WIDTH, height: JESS_PET_HEIGHT'));
  assert.ok(main.includes('maxWidth: JESS_PET_WIDTH, maxHeight: JESS_PET_HEIGHT'));
  assert.ok(main.includes("loadFile(path.join(__dirname, 'jess-pet', 'index.html'))"));
  assert.ok(!main.includes('maxWidth: 420, maxHeight: 520'));
  assert.ok(!main.includes("loadURL(APP_URL + '/companion')"));
  assert.match(main, /hubmind:set-companion-transcript-visible/);
  assert.match(page, /JessOrbVisualizer/);
  assert.ok(page.includes('JessOrbVisualizer'));
  assert.ok(page.includes('hideCompanion'));
  assert.ok(page.includes('jess-orb-window'));
  assert.ok(page.includes('moveCompanionBy'));
  assert.ok(page.includes('onPointerMove'));
  assert.ok(page.includes('jess-orb-window'));
  assert.ok(page.includes('setCompanionTranscriptVisible'));
});

test('native system actions use the isolated bridge and a Full Control Session', async () => {
  const main = await read('../../electron/main.cjs');
  const preload = await read('../../electron/preload.cjs');
  const tools = await read('../../src/lib/jessTools.ts');
  assert.match(main, /hubmind:native-action/);
  assert.match(main, /hubmind:full-control-start/);
  assert.match(main, /jess-native-audit\.jsonl/);
  assert.match(main, /nativeAgent\.call/);
  assert.match(main, /assertTrustedSender\(event\)/);
  assert.match(preload, /nativeAction/);
  assert.match(preload, /startFullControl/);
  assert.match(tools, /name: 'run_windows_command_native'/);
  assert.match(tools, /name: 'launch_windows_application'/);
  assert.match(tools, /name: 'control_system_volume'/);
  assert.match(tools, /name: 'control_screen_brightness'/);
  assert.match(main, /method === 'media_key'/);
  assert.match(await read('../../electron/jess-agent.ps1'), /'media_key'/);
});

test('desktop display capture uses a custom thumbnail picker', async () => {
  const main = await read('../../electron/main.cjs');
  const start = main.indexOf('setDisplayMediaRequestHandler');
  const end = main.indexOf('const stopHotkeyRegistered', start);
  assert.ok(start >= 0 && end > start);
  const handler = main.slice(start, end);
  assert.match(handler, /desktopCapturer\.getSources/);
  assert.match(handler, /chooseDisplaySource\(unique\)/);
  assert.match(main, /screen-share-picker\.html/);
  assert.match(handler, /thumbnailSize: \{ width: 320, height: 180 \}/);
  assert.match(handler, /callback\(selected \? \{ video: selected \} : \{\}\)/);
});
